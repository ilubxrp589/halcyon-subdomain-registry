#!/usr/bin/env node

/**
 * Comprehensive GPU Style + Theme Testing Script (v2.0)
 *
 * New Test Structure: Each test = Model + Style + Theme Category
 * Naming: {Model}_{StyleCategory}{Number}_{ThemeCategory}
 *
 * Usage:
 *   node comprehensive-gpu-test.js --list                      # List all 896 tests
 *   node comprehensive-gpu-test.js --list PG                   # List Playground tests only
 *   node comprehensive-gpu-test.js --list Exotic               # List Exotic category tests
 *   node comprehensive-gpu-test.js --section PG_A01_Exotic     # Run specific test
 *   node comprehensive-gpu-test.js --section PG_A01_Exotic --resume     # Resume interrupted
 *   node comprehensive-gpu-test.js --section PG_A01_Exotic --dry-run    # Preview without generating
 *   node comprehensive-gpu-test.js --status                    # Show all test statuses
 *
 * Test Naming:
 *   PG_A01_Exotic = Playground + Watercolor (Artistic #1) + Exotic themes
 *   AN_D03_Fantasy = Animagine + Low Poly (Digital #3) + Fantasy themes
 *
 * Each test generates ~50 images (one per theme in category)
 * Subjects rotate through 30 options (theme[0] → subject[0], etc.)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
const rootDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

// Dynamic imports for ES modules
let pool, query, imageAnalysisService, gpuFanControl, setActiveModel, getActiveModelConfig;
let loadAllThemes, getThemesForAPI, getThemeById;
let loadAllStyles, getStylesForAPI, getStyleById, getAllStylesFlat;
let generateParallel, getAllServersStatus;

// Load test sections config
let testConfig;

// =============================================================
//                     CONFIGURATION
// =============================================================

const CONFIG = {
  // Timing settings (in ms)
  cooldownBetweenBatches: 10000,    // 10 seconds between batches
  llavaAnalysisTimeout: 60000,      // 60 seconds per image analysis

  // Quality thresholds
  passScore: 5,
  styleMinimum: 6,
  themeMinimum: 6,
  qualityMinimum: 5,

  // Output settings
  outputBaseDir: '/home/localai/Desktop/ThemeTests/comprehensive',
  saveRawImages: true,
  generateReports: true,

  // Batch settings
  imagesPerBatch: 5,   // 5 GPUs = 5 parallel images (3x .39 + 2x .67)
};

// =============================================================
//                     SECTION NAME PARSING
// =============================================================

/**
 * Parse a section name like "PG_A01_Exotic" into components
 * @param {string} sectionName - e.g., "PG_A01_Exotic"
 * @returns {object} - { modelCode, styleCategoryCode, styleNumber, themeCategory, style }
 */
function parseSectionName(sectionName) {
  const regex = /^(PG|AN)_([ADFMRO])(\d{2})_(\w+)$/i;
  const match = sectionName.toUpperCase().match(regex);

  if (!match) {
    return null;
  }

  const [, modelCode, styleCategoryCode, styleNumberStr, themeCategoryRaw] = match;
  const styleNumber = parseInt(styleNumberStr, 10);

  // Fix theme category casing (Exotic, not EXOTIC)
  const themeCategory = themeCategoryRaw.charAt(0).toUpperCase() + themeCategoryRaw.slice(1).toLowerCase();

  // Validate model
  const model = testConfig.models[modelCode];
  if (!model) {
    return null;
  }

  // Validate style category
  const styleCategory = testConfig.styleCategories[styleCategoryCode];
  if (!styleCategory) {
    return null;
  }

  // Validate style number (1-based index)
  if (styleNumber < 1 || styleNumber > styleCategory.styles.length) {
    return null;
  }

  // Get the specific style
  const styleId = styleCategory.styles[styleNumber - 1];

  // Validate theme category
  if (!testConfig.themeCategories[themeCategory]) {
    return null;
  }

  return {
    modelCode,
    model,
    styleCategoryCode,
    styleCategory,
    styleNumber,
    styleId,
    themeCategory,
    sectionName: `${modelCode}_${styleCategoryCode}${String(styleNumber).padStart(2, '0')}_${themeCategory}`,
  };
}

/**
 * Generate all possible section names
 */
function getAllSectionNames() {
  const sections = [];

  for (const modelCode of Object.keys(testConfig.models)) {
    for (const [catCode, category] of Object.entries(testConfig.styleCategories)) {
      for (let i = 1; i <= category.styles.length; i++) {
        for (const themeCategory of Object.keys(testConfig.themeCategories)) {
          const sectionName = `${modelCode}_${catCode}${String(i).padStart(2, '0')}_${themeCategory}`;
          sections.push({
            name: sectionName,
            modelCode,
            modelName: testConfig.models[modelCode].name,
            styleCategoryCode: catCode,
            styleCategoryName: category.name,
            styleNumber: i,
            styleId: category.styles[i - 1],
            themeCategory,
            themeCount: testConfig.themeCategories[themeCategory].count,
          });
        }
      }
    }
  }

  return sections;
}

/**
 * Get subject for a theme index (rotating through 30 subjects)
 */
function getSubjectForThemeIndex(index) {
  const subjects = testConfig.subjects.rotation;
  return subjects[index % subjects.length];
}

// =============================================================
//                     DATABASE OPERATIONS
// =============================================================

/**
 * Get or create a test run for a section
 */
async function getOrCreateTestRun(sectionId, totalBatches) {
  // Check for existing incomplete run
  const existingResult = await query(
    `SELECT * FROM gpu_test_progress WHERE section_id = $1 AND status != 'completed'`,
    [sectionId]
  );

  if (existingResult.rows.length > 0) {
    return existingResult.rows[0];
  }

  // Create new run
  const testRunId = crypto.randomUUID();
  await query(
    `INSERT INTO gpu_test_progress
     (section_id, test_run_id, status, total_batches, completed_batches, started_at)
     VALUES ($1, $2, 'pending', $3, 0, NOW())
     ON CONFLICT (section_id) DO UPDATE SET
       test_run_id = $2,
       status = 'pending',
       total_batches = $3,
       completed_batches = 0,
       started_at = NOW(),
       completed_at = NULL`,
    [sectionId, testRunId, totalBatches]
  );

  return {
    section_id: sectionId,
    test_run_id: testRunId,
    status: 'pending',
    total_batches: totalBatches,
    completed_batches: 0,
  };
}

/**
 * Update section progress
 */
async function updateProgress(sectionId, completedBatches, status = 'running') {
  await query(
    `UPDATE gpu_test_progress
     SET completed_batches = $2, status = $3
     WHERE section_id = $1`,
    [sectionId, completedBatches, status]
  );
}

/**
 * Mark section as completed with aggregate scores
 */
async function completeSection(sectionId, avgStyleScore, avgThemeScore, passRate) {
  await query(
    `UPDATE gpu_test_progress
     SET status = 'completed',
         completed_at = NOW(),
         avg_style_score = $2,
         avg_theme_score = $3,
         pass_rate = $4
     WHERE section_id = $1`,
    [sectionId, avgStyleScore, avgThemeScore, passRate]
  );
}

/**
 * Save individual test result
 */
async function saveTestResult(testRunId, sectionId, batchNumber, result) {
  await query(
    `INSERT INTO gpu_test_results
     (test_run_id, section_id, batch_number, model, theme_id, theme_category,
      style_id, style_category, subject, prompt, image_path, image_base64, generation_time_ms,
      gpu_server, llava_style_score, llava_theme_score, llava_prompt_score,
      llava_quality_score, llava_reasoning, success, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      testRunId,
      sectionId,
      batchNumber,
      result.model,
      result.themeId,
      result.themeCategory,
      result.styleId,
      result.styleCategory,
      result.subject,
      result.prompt,
      result.imagePath,
      result.imageBase64?.substring(0, 100), // Store truncated for reference
      result.generationTimeMs,
      result.gpuServer,
      result.llavaStyleScore,
      result.llavaThemeScore,
      result.llavaPromptScore,
      result.llavaQualityScore,
      result.llavaReasoning,
      result.success,
      result.error,
    ]
  );
}

/**
 * Get all section statuses
 */
async function getAllSectionStatuses() {
  const result = await query(
    `SELECT section_id, status, completed_batches, total_batches,
            avg_style_score, avg_theme_score, pass_rate,
            started_at, completed_at
     FROM gpu_test_progress
     ORDER BY section_id`
  );
  return result.rows;
}

// =============================================================
//                     SECTION GENERATION
// =============================================================

/**
 * Generate test combinations for a section (single style sweep)
 */
async function generateSectionCombinations(parsed) {
  const combinations = [];
  const themes = await getThemesForAPI();
  const categoryThemes = themes[parsed.themeCategory.toLowerCase()] || [];

  // Get the style object
  const style = await getStyleById(parsed.styleId);

  // Each theme gets exactly one image with a rotating subject
  for (let i = 0; i < categoryThemes.length; i++) {
    const theme = categoryThemes[i];
    const subject = getSubjectForThemeIndex(i);

    combinations.push({
      model: parsed.model,
      theme,
      style,
      styleId: parsed.styleId,
      styleCategory: parsed.styleCategoryCode,
      subject,
      themeIndex: i,
    });
  }

  return combinations;
}

// =============================================================
//                     TEST EXECUTION
// =============================================================

/**
 * Run a single batch of images (3 parallel)
 */
async function runBatch(batch, batchNumber, testRunId, sectionId, outputDir, parsed) {
  const results = [];
  const startTime = Date.now();

  // All items in batch use the same model
  const { model, style } = batch[0];

  // Set the active model
  await setActiveModel(model.id);

  // Prepare theme IDs
  const themeIds = batch.map(b => b.theme.id);
  while (themeIds.length < 3) {
    themeIds.push(batch[0].theme.id);
  }

  try {
    // Generate images in parallel (one subject per theme)
    const genResults = [];

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const customPrompt = item.subject;

      // Generate single image
      const genResult = await generateParallel(
        `test_${sectionId}_batch${batchNumber}_${i}`,
        [item.theme.id],
        customPrompt,
        style
      );

      genResults.push(genResult.images[0]);
    }

    // Process each generated image
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const image = genResults[i];

      // Build full prompt string for logging
      const fullPrompt = `${item.subject}, ${item.theme.modifiers}`;

      // Create readable slugs for filename
      const themeSlug = item.theme.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const subjectSlug = item.subject
        .split(',')[0].trim()
        .replace(/[^a-z0-9]+/gi, '-')
        .toLowerCase();

      const styleSlug = item.styleId.replace(/_/g, '-');

      if (!image || !image.success) {
        results.push({
          model: model.id,
          themeId: item.theme.id,
          themeCategory: parsed.themeCategory,
          styleId: item.styleId,
          styleCategory: parsed.styleCategoryCode,
          subject: item.subject,
          prompt: fullPrompt,
          success: false,
          error: image?.error || 'Generation failed',
          generationTimeMs: Date.now() - startTime,
          gpuServer: image?.server || 'unknown',
        });
        continue;
      }

      // Save image to disk
      let imagePath = null;
      if (CONFIG.saveRawImages) {
        // Format: PG_A01_Exotic_0001_ancient-temple_1girl_watercolor.png
        const seqNum = String((batchNumber - 1) * 3 + i + 1).padStart(4, '0');
        const fileName = `${sectionId}_${seqNum}_${themeSlug}_${subjectSlug}_${styleSlug}.png`;
        imagePath = path.join(outputDir, fileName);

        // Convert base64 to buffer and save
        const base64Data = image.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        await fs.writeFile(imagePath, Buffer.from(base64Data, 'base64'));
      }

      // Analyze with LLaVA
      let llavaResult = null;
      try {
        llavaResult = await imageAnalysisService.analyzeComprehensive(image.imageBase64, {
          style: style?.name || 'default',
          theme: item.theme,
          prompt: fullPrompt,
          subject: item.subject,
        });
      } catch (error) {
        console.error(`LLaVA analysis failed for batch ${batchNumber}, image ${i}:`, error.message);
      }

      results.push({
        model: model.id,
        themeId: item.theme.id,
        themeCategory: parsed.themeCategory,
        styleId: item.styleId,
        styleCategory: parsed.styleCategoryCode,
        subject: item.subject,
        prompt: fullPrompt,
        imagePath,
        imageBase64: image.imageBase64,
        success: true,
        generationTimeMs: image.generationTime * 1000,
        gpuServer: image.server,
        llavaStyleScore: llavaResult?.analyses?.style?.score || null,
        llavaThemeScore: llavaResult?.analyses?.theme?.score || null,
        llavaPromptScore: llavaResult?.analyses?.prompt?.score || null,
        llavaQualityScore: llavaResult?.analyses?.quality?.overall || null,
        llavaReasoning: JSON.stringify(llavaResult || {}),
        passed: llavaResult?.passed || false,
        aggregateScore: llavaResult?.aggregateScore || null,
      });
    }
  } catch (error) {
    console.error(`Batch ${batchNumber} failed:`, error.message);
    // Mark all items in batch as failed
    for (const item of batch) {
      const fullPrompt = `${item.subject}, ${item.theme.modifiers}`;

      results.push({
        model: model.id,
        themeId: item.theme.id,
        themeCategory: parsed.themeCategory,
        styleId: item.styleId,
        styleCategory: parsed.styleCategoryCode,
        subject: item.subject,
        prompt: fullPrompt,
        success: false,
        error: error.message,
        generationTimeMs: Date.now() - startTime,
      });
    }
  }

  // Save results to database
  for (const result of results) {
    await saveTestResult(testRunId, sectionId, batchNumber, result);
  }

  return results;
}

/**
 * Run a complete section
 */
async function runSection(sectionName, options = {}) {
  const { resume = false, dryRun = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log(`Starting Test: ${sectionName}`);
  console.log('='.repeat(60));

  // Parse the section name
  const parsed = parseSectionName(sectionName);
  if (!parsed) {
    throw new Error(`Invalid section name: ${sectionName}. Expected format: PG_A01_Exotic`);
  }

  const style = await getStyleById(parsed.styleId);

  console.log(`Model: ${parsed.model.name} (${parsed.modelCode})`);
  console.log(`Style: ${style?.name || parsed.styleId} (${parsed.styleCategoryCode}${String(parsed.styleNumber).padStart(2, '0')})`);
  console.log(`Theme Category: ${parsed.themeCategory}`);
  console.log(`Expected Images: ~${testConfig.themeCategories[parsed.themeCategory].count}`);

  // Generate all combinations
  console.log('\nGenerating test combinations...');
  const combinations = await generateSectionCombinations(parsed);
  console.log(`Total combinations: ${combinations.length}`);

  // Group into batches of 3
  const batches = [];
  for (let i = 0; i < combinations.length; i += CONFIG.imagesPerBatch) {
    batches.push(combinations.slice(i, i + CONFIG.imagesPerBatch));
  }
  console.log(`Total batches: ${batches.length}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would generate:');
    console.log(`  - ${combinations.length} images`);
    console.log(`  - ${batches.length} batches`);
    console.log(`  - Model: ${parsed.model.name}`);
    console.log(`  - Style: ${style?.name || parsed.styleId}`);
    console.log(`  - Themes: ${parsed.themeCategory} (${testConfig.themeCategories[parsed.themeCategory].count})`);
    console.log(`  - Estimated time: ~${Math.round(batches.length * 75 / 60)} minutes`);

    console.log('\nSample combinations:');
    for (let i = 0; i < Math.min(5, combinations.length); i++) {
      const c = combinations[i];
      console.log(`  ${i + 1}. ${c.theme.name} + "${c.subject}"`);
    }
    if (combinations.length > 5) {
      console.log(`  ... and ${combinations.length - 5} more`);
    }
    return;
  }

  // Create output directory
  const outputDir = path.join(CONFIG.outputBaseDir, parsed.sectionName);
  await fs.mkdir(outputDir, { recursive: true });

  // Get or create test run
  const testRun = await getOrCreateTestRun(parsed.sectionName, batches.length);
  const { test_run_id: testRunId, completed_batches: startBatch } = testRun;

  console.log(`\nTest run ID: ${testRunId}`);
  if (resume && startBatch > 0) {
    console.log(`Resuming from batch ${startBatch + 1}/${batches.length}`);
  }

  // Update status to running
  await updateProgress(parsed.sectionName, startBatch, 'running');

  // Spin up GPU fans
  await gpuFanControl.onJobStart();

  // Track results for final stats
  const allResults = [];
  let completedBatches = startBatch;

  try {
    // Process batches
    for (let i = resume ? startBatch : 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      // Progress display
      const progress = Math.round((batchNum / batches.length) * 100);
      const eta = Math.round(((batches.length - batchNum) * 75) / 60);
      process.stdout.write(`\rBatch ${batchNum}/${batches.length} (${progress}%) - ETA: ${eta} min   `);

      // Run batch
      const results = await runBatch(batch, batchNum, testRunId, parsed.sectionName, outputDir, parsed);
      allResults.push(...results);

      // Update progress
      completedBatches = batchNum;
      await updateProgress(parsed.sectionName, completedBatches, 'running');

      // Cooldown between batches
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, CONFIG.cooldownBetweenBatches));
      }
    }

    console.log('\n');

    // Calculate aggregate stats
    const successResults = allResults.filter(r => r.success);
    const passedResults = successResults.filter(r => r.passed);

    const avgStyleScore = successResults.length > 0
      ? successResults.reduce((sum, r) => sum + (r.llavaStyleScore || 0), 0) / successResults.length
      : null;

    const avgThemeScore = successResults.length > 0
      ? successResults.reduce((sum, r) => sum + (r.llavaThemeScore || 0), 0) / successResults.length
      : null;

    const passRate = successResults.length > 0
      ? (passedResults.length / successResults.length) * 100
      : 0;

    // Mark section as completed
    await completeSection(parsed.sectionName, avgStyleScore, avgThemeScore, passRate);

    // Print summary
    console.log('='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total images: ${allResults.length}`);
    console.log(`Successful: ${successResults.length}`);
    console.log(`Failed: ${allResults.length - successResults.length}`);
    console.log(`Passed validation: ${passedResults.length} (${passRate.toFixed(1)}%)`);
    console.log(`Average style score: ${avgStyleScore?.toFixed(1) || 'N/A'}`);
    console.log(`Average theme score: ${avgThemeScore?.toFixed(1) || 'N/A'}`);

    // Generate HTML report
    if (CONFIG.generateReports) {
      await generateHtmlReport(parsed.sectionName, parsed, style, allResults, outputDir);
    }

  } catch (error) {
    console.error('\n\nTest failed:', error.message);
    await updateProgress(parsed.sectionName, completedBatches, 'failed');
    throw error;
  } finally {
    // Ensure fans return to idle
    await gpuFanControl.onJobComplete();
  }
}

// =============================================================
//                     REPORTING
// =============================================================

/**
 * Generate HTML report for a section
 */
async function generateHtmlReport(sectionId, parsed, style, results, outputDir) {
  const successResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);
  const passedResults = successResults.filter(r => r.passed);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GPU Test Report - ${sectionId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #1a1a2e; color: #eee; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; }
    h1 { margin: 0; }
    .meta { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px; font-size: 14px; opacity: 0.9; }
    .meta span { background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 4px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .stat-card { background: #16213e; padding: 16px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: bold; color: #667eea; }
    .stat-label { color: #888; font-size: 12px; text-transform: uppercase; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .image-card { background: #16213e; border-radius: 8px; overflow: hidden; }
    .image-card img { width: 100%; height: 200px; object-fit: cover; }
    .image-info { padding: 12px; }
    .score { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
    .score.pass { background: #22c55e20; color: #22c55e; }
    .score.fail { background: #ef444420; color: #ef4444; }
    .tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .tag { background: #0f3460; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .subject-tag { background: #4a1d6a; }
    .failed-section { background: #3a1212; padding: 20px; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>GPU Test Report - ${sectionId}</h1>
    <div class="meta">
      <span>Model: ${parsed.model.name}</span>
      <span>Style: ${style?.name || parsed.styleId}</span>
      <span>Theme Category: ${parsed.themeCategory}</span>
    </div>
    <p style="margin-top: 10px; opacity: 0.8;">Generated: ${new Date().toISOString()}</p>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-value">${results.length}</div>
      <div class="stat-label">Total Images</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${successResults.length}</div>
      <div class="stat-label">Successful</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${passedResults.length}</div>
      <div class="stat-label">Passed Validation</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${((passedResults.length / Math.max(successResults.length, 1)) * 100).toFixed(1)}%</div>
      <div class="stat-label">Pass Rate</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${(successResults.reduce((s, r) => s + (r.llavaStyleScore || 0), 0) / Math.max(successResults.length, 1)).toFixed(1)}</div>
      <div class="stat-label">Avg Style Score</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${(successResults.reduce((s, r) => s + (r.llavaThemeScore || 0), 0) / Math.max(successResults.length, 1)).toFixed(1)}</div>
      <div class="stat-label">Avg Theme Score</div>
    </div>
  </div>

  <h2>Generated Images</h2>
  <div class="gallery">
    ${successResults.slice(0, 100).map(r => `
      <div class="image-card">
        ${r.imagePath ? `<img src="${path.basename(r.imagePath)}" alt="${r.themeId}">` : ''}
        <div class="image-info">
          <div class="score ${r.passed ? 'pass' : 'fail'}">Score: ${r.aggregateScore?.toFixed(1) || 'N/A'}</div>
          <div class="tags">
            <span class="tag">${r.themeId}</span>
            <span class="tag subject-tag">${r.subject?.split(',')[0] || 'N/A'}</span>
          </div>
          <p style="font-size: 12px; color: #888; margin-top: 8px;">
            Style: ${r.llavaStyleScore || '-'} | Theme: ${r.llavaThemeScore || '-'} | Quality: ${r.llavaQualityScore || '-'}
          </p>
        </div>
      </div>
    `).join('\n')}
  </div>

  ${failedResults.length > 0 ? `
  <div class="failed-section">
    <h2>Failed Generations (${failedResults.length})</h2>
    <ul>
      ${failedResults.map(r => `<li>${r.themeId} - ${r.error}</li>`).join('\n')}
    </ul>
  </div>
  ` : ''}

</body>
</html>`;

  const reportPath = path.join(outputDir, `report_${sectionId}.html`);
  await fs.writeFile(reportPath, html);
  console.log(`Report saved to: ${reportPath}`);
}

// =============================================================
//                     CLI COMMANDS
// =============================================================

/**
 * List all available sections with optional filtering
 */
function listSections(filter = null) {
  const allSections = getAllSectionNames();

  // Apply filter if provided
  let sections = allSections;
  if (filter) {
    const filterUpper = filter.toUpperCase();
    const filterCapitalized = filter.charAt(0).toUpperCase() + filter.slice(1).toLowerCase();

    sections = allSections.filter(s =>
      s.name.toUpperCase().includes(filterUpper) ||
      s.modelCode === filterUpper ||
      s.themeCategory === filterCapitalized ||
      s.styleCategoryCode === filterUpper
    );
  }

  console.log('\n' + '='.repeat(70));
  console.log('Available Tests' + (filter ? ` (filtered by "${filter}")` : ''));
  console.log('='.repeat(70) + '\n');

  console.log(`Total tests: ${sections.length}` + (filter ? ` (of ${allSections.length})` : ''));
  console.log(`Format: {Model}_{StyleCategory}{Number}_{ThemeCategory}\n`);

  // Group by model then by theme category
  const grouped = {};
  for (const s of sections) {
    const key = `${s.modelCode}_${s.themeCategory}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(s);
  }

  // Display organized by model
  for (const modelCode of ['PG', 'AN']) {
    const modelSections = sections.filter(s => s.modelCode === modelCode);
    if (modelSections.length === 0) continue;

    const modelName = testConfig.models[modelCode].name;
    console.log(`\n${'='.repeat(50)}`);
    console.log(`MODEL: ${modelName} (${modelCode})`);
    console.log(`${'='.repeat(50)}`);

    for (const themeCategory of Object.keys(testConfig.themeCategories)) {
      const themeSections = modelSections.filter(s => s.themeCategory === themeCategory);
      if (themeSections.length === 0) continue;

      const themeCount = testConfig.themeCategories[themeCategory].count;
      console.log(`\n  ${themeCategory} (${themeCount} themes):`);
      console.log('  ' + '-'.repeat(40));

      // Group by style category
      for (const [catCode, category] of Object.entries(testConfig.styleCategories)) {
        const catSections = themeSections.filter(s => s.styleCategoryCode === catCode);
        if (catSections.length === 0) continue;

        const sectionNames = catSections.map(s => {
          const num = String(s.styleNumber).padStart(2, '0');
          return `${catCode}${num}`;
        }).join(', ');

        console.log(`    ${category.name} (${catCode}): ${sectionNames}`);
      }
    }
  }

  console.log('\n' + '-'.repeat(70));
  console.log('Style Categories:');
  for (const [code, cat] of Object.entries(testConfig.styleCategories)) {
    console.log(`  ${code} = ${cat.name} (${cat.styles.length} styles)`);
  }

  console.log('\nUsage:');
  console.log('  node comprehensive-gpu-test.js --section PG_A01_Exotic');
  console.log('  node comprehensive-gpu-test.js --section PG_A01_Exotic --dry-run');
  console.log('  node comprehensive-gpu-test.js --list PG              # Filter by model');
  console.log('  node comprehensive-gpu-test.js --list Exotic          # Filter by theme');
  console.log('  node comprehensive-gpu-test.js --list A               # Filter by style category');
}

/**
 * Show status of tests
 */
async function showStatus(filter = null) {
  console.log('\n' + '='.repeat(60));
  console.log('Test Status');
  console.log('='.repeat(60) + '\n');

  const statuses = await getAllSectionStatuses();
  const statusMap = new Map(statuses.map(s => [s.section_id, s]));

  const allSections = getAllSectionNames();
  let sections = allSections;

  if (filter) {
    const filterUpper = filter.toUpperCase();
    const filterCapitalized = filter.charAt(0).toUpperCase() + filter.slice(1).toLowerCase();

    sections = allSections.filter(s =>
      s.name.toUpperCase().includes(filterUpper) ||
      s.modelCode === filterUpper ||
      s.themeCategory === filterCapitalized
    );
  }

  let completed = 0;
  let running = 0;
  let failed = 0;
  let pending = 0;

  for (const section of sections) {
    const status = statusMap.get(section.name);
    const statusText = status?.status || 'pending';

    if (statusText === 'completed') completed++;
    else if (statusText === 'running') running++;
    else if (statusText === 'failed') failed++;
    else pending++;
  }

  console.log(`Summary: ${completed} completed, ${running} running, ${failed} failed, ${pending} pending`);
  console.log(`Total: ${sections.length} tests\n`);

  // Only show non-pending tests in detail
  const activeSections = sections.filter(s => {
    const status = statusMap.get(s.name);
    return status && status.status !== 'pending';
  });

  if (activeSections.length === 0) {
    console.log('No tests have been started yet.');
    return;
  }

  for (const section of activeSections) {
    const status = statusMap.get(section.name);
    const progress = status
      ? `${status.completed_batches}/${status.total_batches}`
      : '0/0';

    const passRate = status?.pass_rate
      ? `${status.pass_rate.toFixed(1)}%`
      : '-';

    let statusIcon = '[ ]';
    if (status.status === 'completed') statusIcon = '[X]';
    else if (status.status === 'running') statusIcon = '[>]';
    else if (status.status === 'failed') statusIcon = '[!]';

    console.log(`${statusIcon} ${section.name}`);
    console.log(`    Progress: ${progress} | Pass Rate: ${passRate} | Status: ${status.status}`);
  }
}

// =============================================================
//                     MAIN
// =============================================================

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Comprehensive GPU Style + Theme Testing (v2.0)

Test Naming: {Model}_{StyleCategory}{Number}_{ThemeCategory}
  Examples:
    PG_A01_Exotic = Playground + Watercolor + Exotic themes
    AN_D03_Fantasy = Animagine + Low Poly + Fantasy themes

Usage:
  node comprehensive-gpu-test.js --list                      List all 896 tests
  node comprehensive-gpu-test.js --list PG                   List Playground tests only
  node comprehensive-gpu-test.js --list Exotic               List Exotic theme tests
  node comprehensive-gpu-test.js --list A                    List Artistic style tests
  node comprehensive-gpu-test.js --section PG_A01_Exotic     Run specific test
  node comprehensive-gpu-test.js --section PG_A01_Exotic --resume     Resume interrupted
  node comprehensive-gpu-test.js --section PG_A01_Exotic --dry-run    Preview without generating
  node comprehensive-gpu-test.js --status                    Show all test statuses

Models:
  PG = Playground v2.5 + LCM
  AN = Animagine XL 3.1

Style Categories:
  A = Artistic (10 styles: watercolor, colored_pencil, gouache, ...)
  D = Digital (7 styles: 3d_render, pixel_art, vector, ...)
  F = Film (10 styles: cinematic, film_noir, polaroid, ...)
  M = Movements (10 styles: impressionist, art_nouveau, pop_art, ...)
  R = Rendering (10 styles: photorealistic, anime, manga, ...)
  O = Mood (9 styles: dreamy, dark_moody, cyberpunk, ...)

Theme Categories:
  Exotic (50), Anime (61), Fantasy (50), Nature (50),
  Space (50), Business (50), Jobs (50), Fractal (50)

Options:
  --list [filter]     List tests (optionally filter by model, theme, or style category)
  --section <name>    Run a specific test (e.g., PG_A01_Exotic)
  --resume            Resume an interrupted test from last batch
  --dry-run           Preview what would be generated without running
  --status [filter]   Show status of tests (optionally filter)
  --help, -h          Show this help message
`);
    process.exit(0);
  }

  // Load dependencies
  console.log('Loading dependencies...');

  try {
    // Load test config
    const configPath = path.join(__dirname, 'test-sections.json');
    testConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    // Handle --list without loading full dependencies
    if (args.includes('--list')) {
      const listIndex = args.indexOf('--list');
      const filter = args[listIndex + 1] && !args[listIndex + 1].startsWith('--')
        ? args[listIndex + 1]
        : null;
      listSections(filter);
      process.exit(0);
    }

    // Load full dependencies for other commands
    const dbModule = await import('../src/db/index.js');
    pool = dbModule.pool;
    query = dbModule.query;

    const imageAnalysisModule = await import('../src/services/imageAnalysis.js');
    imageAnalysisService = imageAnalysisModule.imageAnalysisService;

    const fanModule = await import('../src/services/gpuFanControl.js');
    gpuFanControl = fanModule.gpuFanControl;

    const sdxlModule = await import('../src/services/sdxlMultiGPU.js');
    setActiveModel = sdxlModule.setActiveModel;
    getActiveModelConfig = sdxlModule.getActiveModelConfig;
    generateParallel = sdxlModule.generateParallel;
    getAllServersStatus = sdxlModule.getAllServersStatus;

    const themesModule = await import('../src/data/themes/index.js');
    loadAllThemes = themesModule.loadAllThemes;
    getThemesForAPI = themesModule.getThemesForAPI;
    getThemeById = themesModule.getThemeById;

    const stylesModule = await import('../src/data/styles/index.js');
    loadAllStyles = stylesModule.loadAllStyles;
    getStylesForAPI = stylesModule.getStylesForAPI;
    getStyleById = stylesModule.getStyleById;
    getAllStylesFlat = stylesModule.getAllStylesFlat;

    console.log('Dependencies loaded successfully');
  } catch (error) {
    console.error('Failed to load dependencies:', error.message);
    process.exit(1);
  }

  // Handle commands
  if (args.includes('--status')) {
    const statusIndex = args.indexOf('--status');
    const filter = args[statusIndex + 1] && !args[statusIndex + 1].startsWith('--')
      ? args[statusIndex + 1]
      : null;
    await showStatus(filter);
    await pool.end();
    process.exit(0);
  }

  const sectionIndex = args.indexOf('--section');
  if (sectionIndex !== -1 && args[sectionIndex + 1]) {
    const sectionName = args[sectionIndex + 1];
    const resume = args.includes('--resume');
    const dryRun = args.includes('--dry-run');

    try {
      await runSection(sectionName, { resume, dryRun });
    } catch (error) {
      console.error('Test execution failed:', error);
      process.exit(1);
    } finally {
      if (pool) await pool.end();
    }
    process.exit(0);
  }

  // No valid command
  console.log('No command specified. Use --help for usage information.');
  process.exit(1);
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
