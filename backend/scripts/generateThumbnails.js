#!/usr/bin/env node

/**
 * Generate Theme Thumbnail Placeholder Images
 *
 * Generates 48 thumbnail images for the register page theme selector:
 * - 6 representative themes from each of 8 categories
 * - 24 with Playground v2.5 (photorealistic)
 * - 24 with Animagine XL 3.1 (anime style)
 * - Each thumbnail showcases a different watermark style (34 total, cycling)
 *
 * Output: /backend/public/static/theme-thumbnails/{model}_{category}_{themeId}.webp
 *
 * Usage:
 *   node scripts/generateThumbnails.js           # Generate all 48 thumbnails
 *   node scripts/generateThumbnails.js --dry-run # Preview without generating
 *   node scripts/generateThumbnails.js --resume  # Resume from progress file
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const rootDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

// Disable ComfyUI auto-restart during batch generation (prevents lost prompts)
process.env.COMFYUI_RESTART_THRESHOLD = '9999';

// =============================================================
//                     CONFIGURATION
// =============================================================

const CONFIG = {
  outputDir: '/home/localai/Desktop/HSR/backend/public/static/theme-thumbnails',
  progressFile: '/home/localai/Desktop/HSR/backend/scripts/.thumbnail-progress.json',

  // Models to use
  models: {
    playground: 'sdxl-playground-lora',
    animagine: 'sdxl-animagine'
  },

  // Sample domain for watermark display
  sampleDomain: 'preview.hsr',

  // Timing
  cooldownBetweenImages: 3000,  // 3 seconds between images
};

// 34 Watermark styles to cycle through
const WATERMARK_STYLES = [
  'anime', 'aurora', 'bamboo', 'blueprint', 'candy', 'carbon', 'casino',
  'cinematic', 'circuit', 'comic', 'deco', 'elegant', 'galaxy', 'grunge',
  'jungle', 'matrix', 'medieval', 'military', 'neon_grid', 'noir', 'ocean',
  'origami', 'pcb', 'pixel_art', 'retro', 'sketch', 'sports', 'stained_glass',
  'steampunk', 'synthwave', 'tribal', 'watercolor', 'western', 'zen'
];

// =============================================================
//                     SELECTED THEMES
// =============================================================

// 6 representative themes from each category (48 total)
// Split evenly: 3 with Playground, 3 with Animagine per category
// Selected for visually striking thumbnails
const SELECTED_THEMES = {
  business: {
    // Playground: photorealistic works well for professional settings
    playground: ['01_restaurant', '03_bakery', '08_bookstore'],
    // Animagine: stylized versions of energetic businesses
    animagine: ['19_hair_salon', '21_fitness_gym', '45_brewery']
  },
  nature: {
    // Playground: realistic nature photography style
    playground: ['302_bird_migration', '304_nocturnal_life', '313_ancient_trees'],
    // Animagine: whimsical nature scenes
    animagine: ['303_pollinator_gardens', '315_fungi_kingdom', '319_garden_harvest']
  },
  space: {
    // Playground: cinematic space visuals
    playground: ['sp_01_nebula_nursery', 'sp_02_black_hole_horizon', 'sp_15_galactic_core'],
    // Animagine: anime-style sci-fi
    animagine: ['sp_03_lunar_colony', 'sp_14_europa_ocean', 'sp_17_zero_g_garden']
  },
  fantasy: {
    // Playground: dramatic fantasy landscapes
    playground: ['151_crimson_moon', '154_glass_cathedral', '168_emerald_dragon'],
    // Animagine: magical anime-style fantasy
    animagine: ['152_clockwork_birds', '159_memory_willow', '163_golem_blossoms']
  },
  exotic: {
    // Playground: surreal photorealistic
    playground: ['52_biolum_city', '53_floating_islands', '58_cosmic_whale'],
    // Animagine: stylized otherworldly scenes
    animagine: ['54_cyber_samurai', '62_crystal_phoenix', '65_ice_palace']
  },
  jobs: {
    // Playground: realistic profession scenes
    playground: ['101_snake_milker', '115_balloon_pilot', '118_ethical_hacker'],
    // Animagine: fun animated job scenes
    animagine: ['103_mattress_tester', '110_waterslide_tester', '119_voice_artist']
  },
  fractal: {
    // Playground: detailed mathematical art
    playground: ['202_mandelbrot_mandala', '204_sacred_geometry_pulse', '207_nebula_brain'],
    // Animagine: psychedelic anime style
    animagine: ['203_kaleidoscope_shatter', '206_dmt_portal', '216_fractal_mushrooms']
  },
  anime: {
    // Playground: realistic interpretations of anime scenes
    playground: ['04_school_life', '08_beach_episode', '14_romance_scene'],
    // Animagine: pure anime style (what it's designed for)
    animagine: ['01_magical_girl', '02_mecha_pilot', '13_shonen_battle']
  }
};

// =============================================================
//                     DYNAMIC IMPORTS
// =============================================================

let setActiveModel, generateParallel, getActiveModelConfig, setWatermarkStyle;
let getThemesForAPI, getThemeById;
let gpuFanControl;

async function loadDependencies() {
  console.log('Loading dependencies...');

  const sdxlModule = await import('../src/services/sdxlMultiGPU.js');
  setActiveModel = sdxlModule.setActiveModel;
  generateParallel = sdxlModule.generateParallel;
  getActiveModelConfig = sdxlModule.getActiveModelConfig;
  setWatermarkStyle = sdxlModule.setWatermarkStyle;

  const themesModule = await import('../src/data/themes/index.js');
  getThemesForAPI = themesModule.getThemesForAPI;
  getThemeById = themesModule.getThemeById;

  const fanModule = await import('../src/services/gpuFanControl.js');
  gpuFanControl = fanModule.gpuFanControl;

  console.log('Dependencies loaded successfully');
}

// =============================================================
//                     PROGRESS TRACKING
// =============================================================

async function loadProgress() {
  try {
    const data = await fs.readFile(CONFIG.progressFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { completed: [] };
  }
}

async function saveProgress(progress) {
  await fs.writeFile(CONFIG.progressFile, JSON.stringify(progress, null, 2));
}

// =============================================================
//                     IMAGE GENERATION
// =============================================================

/**
 * Generate a single thumbnail image with watermark
 * Uses the existing generateParallel with a single theme
 */
async function generateSingleImage(themeId, model, watermarkStyle) {
  // Switch to the target model
  await setActiveModel(CONFIG.models[model]);

  // Set the watermark style for this generation
  setWatermarkStyle(watermarkStyle);

  // Get theme data
  const theme = getThemeById(themeId);
  if (!theme) {
    throw new Error(`Theme not found: ${themeId}`);
  }

  // Generate using the parallel system with a single theme repeated 3x
  // (the system requires 3 themes, we'll just use the first result)
  // Watermarks are applied automatically with the current watermark style
  const result = await generateParallel(
    CONFIG.sampleDomain,  // Use sample domain for watermark
    [themeId, themeId, themeId],
    null,  // No custom prompt
    null   // No art style override
    // No skipWatermark - watermarks will be applied!
  );

  if (result.images[0]?.success && result.images[0]?.imageBase64) {
    // Convert base64 to buffer
    const base64Data = result.images[0].imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Convert to WebP with sharp (resize to thumbnail size)
    const webpBuffer = await sharp(imageBuffer)
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    return {
      success: true,
      buffer: webpBuffer,
      theme: result.images[0].theme,
      watermarkStyle
    };
  }

  return { success: false, error: result.images[0]?.error || 'Generation failed' };
}

/**
 * Build list of all images to generate with watermark style assignments
 */
function buildGenerationList() {
  const list = [];
  let styleIndex = 0;

  for (const [category, models] of Object.entries(SELECTED_THEMES)) {
    // Playground themes
    for (const themeId of models.playground) {
      const watermarkStyle = WATERMARK_STYLES[styleIndex % WATERMARK_STYLES.length];
      list.push({
        themeId,
        category,
        model: 'playground',
        watermarkStyle,
        outputName: `playground_${category}_${themeId}.webp`
      });
      styleIndex++;
    }

    // Animagine themes
    for (const themeId of models.animagine) {
      const watermarkStyle = WATERMARK_STYLES[styleIndex % WATERMARK_STYLES.length];
      list.push({
        themeId,
        category,
        model: 'animagine',
        watermarkStyle,
        outputName: `animagine_${category}_${themeId}.webp`
      });
      styleIndex++;
    }
  }

  return list;
}

// =============================================================
//                     MAIN
// =============================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const resume = args.includes('--resume');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Generate Theme Thumbnail Images with Watermarks

Usage:
  node scripts/generateThumbnails.js           Generate all 48 thumbnails
  node scripts/generateThumbnails.js --dry-run Preview without generating
  node scripts/generateThumbnails.js --resume  Resume from progress file

Output: ${CONFIG.outputDir}

Models:
  - Playground v2.5 (photorealistic): 24 images
  - Animagine XL 3.1 (anime style): 24 images

Watermarks:
  - 34 different styles cycled through all thumbnails
  - Sample domain: ${CONFIG.sampleDomain}

Estimated time: ~45 minutes (depending on GPU speed)
`);
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('Theme Thumbnail Generator (with Watermarks)');
  console.log('='.repeat(60));

  // Build generation list
  const generationList = buildGenerationList();
  console.log(`Total thumbnails to generate: ${generationList.length}`);
  console.log(`Watermark styles: ${WATERMARK_STYLES.length} (cycling)`);
  console.log(`Sample domain: ${CONFIG.sampleDomain}`);

  // Dry run - just show what would be generated
  if (dryRun) {
    console.log('\n[DRY RUN] Would generate:\n');

    let playgroundCount = 0;
    let animagineCount = 0;

    for (const item of generationList) {
      const modelIcon = item.model === 'playground' ? '📷' : '🎨';
      console.log(`  ${modelIcon} ${item.outputName} [${item.watermarkStyle}]`);
      if (item.model === 'playground') playgroundCount++;
      else animagineCount++;
    }

    console.log(`\nPlayground: ${playgroundCount}, Animagine: ${animagineCount}`);
    console.log(`\nOutput directory: ${CONFIG.outputDir}`);
    return;
  }

  // Load dependencies
  await loadDependencies();

  // Create output directory
  await fs.mkdir(CONFIG.outputDir, { recursive: true });

  // Load progress for resume
  let progress = { completed: [] };
  if (resume) {
    progress = await loadProgress();
    console.log(`Resuming: ${progress.completed.length} thumbnails already done`);
  }

  // Start fan control
  await gpuFanControl.onJobStart();

  // Track stats
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const startTime = Date.now();

  // Current model tracking (to minimize model switches)
  let currentModel = null;

  // Sort by model to minimize switching
  const sortedList = [...generationList].sort((a, b) => a.model.localeCompare(b.model));

  try {
    for (let i = 0; i < sortedList.length; i++) {
      const item = sortedList[i];
      const key = item.outputName;

      // Skip if already completed
      if (progress.completed.includes(key)) {
        skipped++;
        continue;
      }

      // Progress display
      const pct = Math.round(((i + 1) / sortedList.length) * 100);
      const elapsed = (Date.now() - startTime) / 1000;
      const avgTime = completed > 0 ? elapsed / completed : 30;
      const remaining = Math.round((sortedList.length - i - 1) * avgTime / 60);

      const modelIcon = item.model === 'playground' ? '📷' : '🎨';
      process.stdout.write(`\r[${pct}%] ${i + 1}/${sortedList.length} ${modelIcon} ${item.category}/${item.themeId} [${item.watermarkStyle}] (ETA: ${remaining}min)          `);

      // Switch model if needed
      if (currentModel !== item.model) {
        console.log(`\n  Switching to ${item.model} model...`);
        currentModel = item.model;
      }

      try {
        const result = await generateSingleImage(item.themeId, item.model, item.watermarkStyle);

        if (result.success) {
          // Save the image
          const outputPath = path.join(CONFIG.outputDir, item.outputName);
          await fs.writeFile(outputPath, result.buffer);

          completed++;
          progress.completed.push(key);
          await saveProgress(progress);
        } else {
          console.log(`\n  FAILED: ${item.outputName} - ${result.error}`);
          failed++;
        }
      } catch (error) {
        console.log(`\n  ERROR: ${item.outputName} - ${error.message}`);
        failed++;
      }

      // Cooldown between generations
      await new Promise(r => setTimeout(r, CONFIG.cooldownBetweenImages));
    }

  } finally {
    // Always stop fan control
    await gpuFanControl.onJobComplete();
  }

  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n\n' + '='.repeat(60));
  console.log('THUMBNAIL GENERATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Generated: ${completed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped (already done): ${skipped}`);
  console.log(`Total time: ${totalTime} minutes`);
  console.log(`Output: ${CONFIG.outputDir}`);

  // Verify output
  try {
    const files = await fs.readdir(CONFIG.outputDir);
    const webpFiles = files.filter(f => f.endsWith('.webp'));
    console.log(`\nFiles in output directory: ${webpFiles.length} WebP images`);
  } catch (error) {
    console.log(`\nCouldn't verify output: ${error.message}`);
  }
}

main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
