#!/usr/bin/env node
/**
 * Direct backend test for fractal themes
 * Bypasses API credit system and calls fluxMultiGPU service directly
 */

import fs from 'fs/promises';
import path from 'path';

// Import the service directly
const fluxMultiGPUPath = path.join(process.cwd(), 'src/services/fluxMultiGPU.js');
const fluxMultiGPU = await import(fluxMultiGPUPath);

const OUTPUT_DIR = '/home/localai/Desktop/ThemeTests/fractal_' + new Date().toISOString().split('T')[0].replace(/-/g, '');
const TEST_FQDN = 'fractaltest.cryptofans';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🎨 Fractal Theme Direct Tester');
  console.log('================================\n');

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);

  // Get all themes
  const allThemes = await fluxMultiGPU.default.getThemes();
  const fractalThemes = allThemes.fractal || [];

  console.log(`📋 Found ${fractalThemes.length} fractal themes\n`);

  if (fractalThemes.length === 0) {
    console.log('❌ No fractal themes found!');
    return;
  }

  // Check server health
  const health = await fluxMultiGPU.default.checkServerHealth();
  console.log(`🖥️  GPU Status: ${health.availableCount}/${health.totalCount} available\n`);

  if (health.availableCount === 0) {
    console.log('❌ No GPU servers available!');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  // Generate in batches of 3 (one per GPU)
  for (let i = 0; i < fractalThemes.length; i += 3) {
    const batch = fractalThemes.slice(i, i + 3);
    const batchNum = Math.floor(i / 3) + 1;
    const totalBatches = Math.ceil(fractalThemes.length / 3);

    console.log(`\n🔄 Batch ${batchNum}/${totalBatches}:`);
    batch.forEach((t, idx) => console.log(`   GPU${idx}: ${t.name}`));

    try {
      // Call generateParallel directly
      const themeIds = batch.map(t => t.id);
      const result = await fluxMultiGPU.default.generateParallel(TEST_FQDN, themeIds);

      if (result.images) {
        for (const img of result.images) {
          if (img.success && img.imageBase64) {
            const safeName = img.theme.name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            const filename = `${img.theme.id}_${safeName}.png`;
            const buffer = Buffer.from(img.imageBase64, 'base64');
            await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
            console.log(`   ✅ ${img.theme.name} (${(img.generationTime/1000).toFixed(1)}s)`);
            successCount++;
          } else {
            console.log(`   ❌ ${img.theme?.name || 'Unknown'}: ${img.error || 'No image'}`);
            failCount++;
          }
        }
      }
    } catch (error) {
      console.log(`   ❌ Batch error: ${error.message}`);
      failCount += batch.length;
    }

    // Small delay between batches
    if (i + 3 < fractalThemes.length) {
      console.log('   ⏳ Cooling down...');
      await sleep(3000);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('\n================================');
  console.log(`✨ Complete!`);
  console.log(`   ✅ Success: ${successCount}/${fractalThemes.length}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⏱️  Time: ${elapsed} minutes`);
  console.log(`   📁 Output: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
