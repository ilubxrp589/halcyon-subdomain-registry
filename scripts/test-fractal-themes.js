#!/usr/bin/env node
/**
 * Test script to generate images for all fractal themes
 * Generates 3 images in parallel (one per GPU) and saves to output directory
 */

const fs = require('fs').promises;
const path = require('path');

const API_BASE = 'http://localhost:8000/api/v1';
const OUTPUT_DIR = '/home/localai/Desktop/ThemeTests/fractal_themes_' + new Date().toISOString().split('T')[0].replace(/-/g, '');
const TEST_SUBDOMAIN = 'fractaltest';
const TEST_TLD = 'cryptofans';
// Admin wallet with unlimited credits
const TEST_WALLET = '0xc24bD0a7bf2867B78BB6a1111c08867838ce4f96';

// Random user inputs to simulate real usage
const RANDOM_USER_INPUTS = [
  'cosmic dragon flying through nebula clouds',
  'ancient wizard casting spells in mystical forest',
  'cyberpunk samurai in neon tokyo streets',
  'ethereal mermaid in bioluminescent ocean depths',
  'steampunk airship captain navigating stormy skies',
  'phoenix rising from crystalline flames',
  'alien botanist in exotic greenhouse on mars',
  'time traveler stepping through portal vortex',
  'forest spirit guardian with glowing antlers',
  'robot artist painting in surreal dreamscape',
  'viking warrior facing ice giants in blizzard',
  'desert nomad discovering ancient temple ruins',
  'space whale swimming through asteroid field',
  'ninja assassin under blood red moon',
  'mad scientist in laboratory of wonders',
  'fairy queen in enchanted mushroom kingdom',
  'demon hunter in gothic cathedral',
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getThemes() {
  const response = await fetch(`${API_BASE}/nft/flux-themes`);
  const data = await response.json();
  return data.themes.fractal || [];
}

async function generateImages(themes, customPrompt) {
  const response = await fetch(`${API_BASE}/nft/flux-generate-parallel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subdomain: TEST_SUBDOMAIN,
      tld: TEST_TLD,
      themes: themes.map(t => t.id),
      customPrompt: customPrompt,
      wallet: TEST_WALLET,
    }),
  });
  return response.json();
}

function getRandomPrompt() {
  return RANDOM_USER_INPUTS[Math.floor(Math.random() * RANDOM_USER_INPUTS.length)];
}

async function saveImage(base64Data, filename) {
  // Strip data URL prefix if present (e.g., "data:image/png;base64,")
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
}

async function main() {
  console.log('🎨 Fractal Theme Tester');
  console.log('========================\n');

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);

  // Get all fractal themes
  const themes = await getThemes();
  console.log(`📋 Found ${themes.length} fractal themes\n`);

  if (themes.length === 0) {
    console.log('❌ No fractal themes found!');
    return;
  }

  // Generate in batches of 3 (one per GPU)
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < themes.length; i += 3) {
    let batch = themes.slice(i, i + 3);
    const batchNum = Math.floor(i / 3) + 1;
    const totalBatches = Math.ceil(themes.length / 3);

    // Pad incomplete batches with earlier themes (API requires exactly 3)
    while (batch.length < 3) {
      batch.push(themes[batch.length % themes.length]);
    }

    // Pick a random user input for this batch
    const userPrompt = getRandomPrompt();

    console.log(`\n🔄 Batch ${batchNum}/${totalBatches}:`);
    console.log(`   💭 User input: "${userPrompt}"`);
    batch.forEach((t, idx) => console.log(`   GPU${idx}: ${t.name} (${t.id})`));

    try {
      const result = await generateImages(batch, userPrompt);

      if (result.success && result.images) {
        const originalBatch = themes.slice(i, i + 3);
        const originalIds = new Set(originalBatch.map(t => t.id));
        for (const img of result.images) {
          // Only save themes from the original batch (skip padding duplicates)
          if (!originalIds.has(img.theme?.id)) continue;

          if (img.success && img.imageBase64) {
            const filename = `${img.theme.id}_${img.theme.name.replace(/[^a-z0-9]/gi, '_')}.png`;
            await saveImage(img.imageBase64, filename);
            console.log(`   ✅ Saved: ${filename}`);
            successCount++;
          } else {
            console.log(`   ❌ Failed: ${img.theme?.name || 'Unknown'} - ${img.error || 'No image'}`);
            failCount++;
          }
        }
      } else {
        console.log(`   ❌ Batch failed: ${result.error}`);
        failCount += batch.length;
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      failCount += batch.length;
    }

    // 10 second delay between batches to let GPUs cooldown
    if (i + 3 < themes.length) {
      console.log('   ⏳ Cooling down (10s)...');
      await sleep(10000);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n========================');
  console.log(`✨ Complete!`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⏱️  Time: ${elapsed}s`);
  console.log(`   📁 Output: ${OUTPUT_DIR}`);
}

main().catch(console.error);
