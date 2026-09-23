#!/usr/bin/env node
/**
 * Generate showcase images for register page marquee
 *
 * Features:
 * - Sets GPU fan to 100% before each generation
 * - 5-10 second stagger between jobs for cooling
 * - Generates images across multiple themes
 * - Saves optimized images to /backend/showcase/
 *
 * Usage:
 *   cd /home/localai/Desktop/HSR/backend
 *   node scripts/generate-showcase.js
 *
 * Options:
 *   --dry-run    Show what would be generated without actually generating
 *   --limit N    Only generate first N images
 *   --start N    Start from Nth image (for resuming)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOWCASE_DIR = path.join(__dirname, '..', 'showcase');
const STAGGER_DELAY_MS = 7000; // 7 seconds between jobs

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity;
const startIdx = args.indexOf('--start');
const startFrom = startIdx !== -1 ? parseInt(args[startIdx + 1]) : 0;

// Each entry = 1 unique showcase image with distinct subject
const SHOWCASE_CONFIGS = [
  // Space theme (5 images)
  { subdomain: 'stardust', themes: ['cosmic-nebula'], model: 'playground' },
  { subdomain: 'nova', themes: ['cosmic-nebula'], model: 'playground' },
  { subdomain: 'orion', themes: ['galaxy-spiral'], model: 'playground' },
  { subdomain: 'andromeda', themes: ['galaxy-spiral'], model: 'playground' },
  { subdomain: 'pulsar', themes: ['stellar-phenomena'], model: 'playground' },

  // Fantasy theme (5 images)
  { subdomain: 'dragonfire', themes: ['dragon-realm'], model: 'playground' },
  { subdomain: 'wyrm', themes: ['dragon-realm'], model: 'playground' },
  { subdomain: 'elderwood', themes: ['enchanted-forest'], model: 'playground' },
  { subdomain: 'faewild', themes: ['enchanted-forest'], model: 'playground' },
  { subdomain: 'crystalheart', themes: ['crystal-palace'], model: 'playground' },

  // Nature theme (5 images)
  { subdomain: 'everest', themes: ['mountain-majesty'], model: 'playground' },
  { subdomain: 'alpine', themes: ['mountain-majesty'], model: 'playground' },
  { subdomain: 'deepblue', themes: ['ocean-depths'], model: 'playground' },
  { subdomain: 'coralreef', themes: ['ocean-depths'], model: 'playground' },
  { subdomain: 'northernlights', themes: ['aurora-borealis'], model: 'playground' },

  // Fractal theme (5 images)
  { subdomain: 'infinity', themes: ['mandelbrot-dreams'], model: 'playground' },
  { subdomain: 'recursive', themes: ['mandelbrot-dreams'], model: 'playground' },
  { subdomain: 'tessellate', themes: ['geometric-infinity'], model: 'playground' },
  { subdomain: 'kaleidoscope', themes: ['geometric-infinity'], model: 'playground' },
  { subdomain: 'fractalcore', themes: ['geometric-infinity'], model: 'playground' },

  // Anime theme (5 images)
  { subdomain: 'sakura', themes: ['anime-protagonist'], model: 'animagine' },
  { subdomain: 'shinobi', themes: ['anime-protagonist'], model: 'animagine' },
  { subdomain: 'sensei', themes: ['anime-protagonist'], model: 'animagine' },
  { subdomain: 'kawaii', themes: ['anime-landscape'], model: 'animagine' },
  { subdomain: 'akihabara', themes: ['anime-landscape'], model: 'animagine' },

  // Cyberpunk theme (5 images)
  { subdomain: 'neonwave', themes: ['neon-city'], model: 'playground' },
  { subdomain: 'synthcity', themes: ['neon-city'], model: 'playground' },
  { subdomain: 'gridrunner', themes: ['neon-city'], model: 'playground' },
  { subdomain: 'cybercore', themes: ['cyber-future'], model: 'playground' },
  { subdomain: 'datastream', themes: ['cyber-future'], model: 'playground' },
];

/**
 * Set GPU fan speed using nvidia-settings
 */
function setFanSpeed(speed) {
  try {
    for (let gpu = 0; gpu < 3; gpu++) {
      execSync(
        `nvidia-settings -a "[gpu:${gpu}]/GPUFanControlState=1" -a "[fan:${gpu}]/GPUTargetFanSpeed=${speed}"`,
        { stdio: 'pipe' }
      );
    }
    console.log(`🌀 Fan speed set to ${speed}%`);
  } catch (e) {
    console.warn(`⚠️  Could not set fan speed: ${e.message}`);
  }
}

/**
 * Reset fans to auto mode
 */
function resetFans() {
  try {
    for (let gpu = 0; gpu < 3; gpu++) {
      execSync(`nvidia-settings -a "[gpu:${gpu}]/GPUFanControlState=0"`, { stdio: 'pipe' });
    }
    console.log('🌀 Fans reset to auto mode');
  } catch (e) {
    console.warn(`⚠️  Could not reset fans: ${e.message}`);
  }
}

/**
 * Save and optimize image for showcase
 */
async function saveShowcaseImage(imageBuffer, filename) {
  const outputPath = path.join(SHOWCASE_DIR, filename);

  // Optimize: resize to 800x800, convert to WebP, quality 85
  await sharp(imageBuffer)
    .resize(800, 800, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(outputPath);

  const stats = await fs.stat(outputPath);
  console.log(`   💾 Saved: ${filename} (${Math.round(stats.size / 1024)}KB)`);
}

/**
 * Generate a single showcase image
 * This is a placeholder - actual implementation would call the generation service
 */
async function generateShowcaseImage(config) {
  const { subdomain, themes, model } = config;

  // Set fans to 100% before generation
  setFanSpeed(100);

  console.log(`   🎨 Generating with ${model} model...`);

  // In actual implementation, this would call:
  // const result = await fluxMultiGPUService.generateParallel(...)
  // const withBranding = await addBrandingOverlay(result.imageBuffer, subdomain, 'cryptofans', 'standard')
  // await saveShowcaseImage(withBranding, `${subdomain}.webp`)

  // For now, return placeholder success
  return { success: true, subdomain };
}

/**
 * Check if image already exists
 */
async function imageExists(subdomain) {
  const webpPath = path.join(SHOWCASE_DIR, `${subdomain}.webp`);
  const jpgPath = path.join(SHOWCASE_DIR, `${subdomain}.jpg`);
  const pngPath = path.join(SHOWCASE_DIR, `${subdomain}.png`);

  try {
    await fs.access(webpPath);
    return true;
  } catch {
    try {
      await fs.access(jpgPath);
      return true;
    } catch {
      try {
        await fs.access(pngPath);
        return true;
      } catch {
        return false;
      }
    }
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('  HALCYON SHOWCASE IMAGE GENERATOR');
  console.log('═'.repeat(60));
  console.log(`  Total configs: ${SHOWCASE_CONFIGS.length}`);
  console.log(`  Start from: ${startFrom}`);
  console.log(`  Limit: ${limit === Infinity ? 'none' : limit}`);
  console.log(`  Stagger delay: ${STAGGER_DELAY_MS / 1000}s between jobs`);
  console.log(`  Output directory: ${SHOWCASE_DIR}`);
  console.log(`  Dry run: ${dryRun ? 'yes' : 'no'}`);
  console.log('═'.repeat(60));

  // Ensure showcase directory exists
  await fs.mkdir(SHOWCASE_DIR, { recursive: true });

  // Get configs to process
  const configsToProcess = SHOWCASE_CONFIGS.slice(startFrom, startFrom + limit);

  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (let i = 0; i < configsToProcess.length; i++) {
    const config = configsToProcess[i];
    const globalIndex = startFrom + i;
    const { subdomain, themes } = config;

    console.log(`\n[${globalIndex + 1}/${SHOWCASE_CONFIGS.length}] ${subdomain}.cryptofans`);
    console.log(`   Theme: ${themes.join(', ')}`);

    // Check if already exists
    const exists = await imageExists(subdomain);
    if (exists) {
      console.log(`   ⏭️  Already exists, skipping`);
      totalSkipped++;
      continue;
    }

    if (dryRun) {
      console.log(`   🔍 [DRY RUN] Would generate: ${subdomain}.webp`);
      totalGenerated++;
      continue;
    }

    try {
      await generateShowcaseImage(config);
      totalGenerated++;
      console.log(`   ✅ Success`);
    } catch (e) {
      totalFailed++;
      console.error(`   ❌ Failed: ${e.message}`);
    }

    // Stagger delay between jobs (except last)
    if (i < configsToProcess.length - 1) {
      console.log(`   ⏳ Cooling delay: ${STAGGER_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, STAGGER_DELAY_MS));
    }
  }

  // Reset fans to auto
  if (!dryRun) {
    resetFans();
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  COMPLETE!');
  console.log(`  Generated: ${totalGenerated}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log(`  Failed: ${totalFailed}`);
  console.log('═'.repeat(60));

  // Instructions for actual generation
  console.log('\n📋 To actually generate images, this script needs to be');
  console.log('   integrated with the fluxMultiGPUService. The placeholder');
  console.log('   generateShowcaseImage() function should be replaced with');
  console.log('   actual calls to the generation service.');
  console.log('\n   You can also manually copy generated images to:');
  console.log(`   ${SHOWCASE_DIR}`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  resetFans();
  process.exit(1);
});
