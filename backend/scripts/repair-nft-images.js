#!/usr/bin/env node
import 'dotenv/config';

/**
 * Repair NFT Images Script
 *
 * Fixes NFT images not showing on Flare Explorer by:
 * 1. Finding domains with missing nft_image_cid in the domains table
 * 2. Looking up existing preparations in nft_preparations table
 * 3. Copying CIDs from preparations to domains
 * 4. Extracting metadata_cid from metadata_uri if available
 * 5. Optionally regenerating NFTs if no preparation exists
 *
 * Usage:
 *   node scripts/repair-nft-images.js              # Dry run (shows what would be fixed)
 *   node scripts/repair-nft-images.js --fix        # Apply fixes
 *   node scripts/repair-nft-images.js --regenerate # Also regenerate missing preparations
 */

import pool, { query } from '../src/db/index.js';

const HSR_API = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';

// Default prompt for regeneration when none exists
const DEFAULT_PROMPT = 'A cosmic digital realm with swirling galaxies and stars';

// Parse command line args
const args = process.argv.slice(2);
const dryRun = !args.includes('--fix') && !args.includes('--regenerate');
const shouldRegenerate = args.includes('--regenerate');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(70));
  console.log('NFT Image Repair Script');
  console.log('='.repeat(70));
  console.log(`Mode: ${dryRun ? 'DRY RUN (use --fix to apply)' : shouldRegenerate ? 'FIX + REGENERATE' : 'FIX ONLY'}`);
  console.log('');

  try {
    // Step 1: Find domains with missing nft_image_cid
    console.log('Step 1: Finding domains with missing NFT image CIDs...');
    const missingResult = await query(`
      SELECT
        d.id,
        d.fqdn,
        d.subdomain,
        d.token_id,
        d.nft_image_cid,
        d.nft_metadata_cid,
        d.metadata_uri,
        d.owner_wallet,
        t.name as tld_name
      FROM domains d
      JOIN tlds t ON d.tld_id = t.id
      WHERE d.nft_image_cid IS NULL
        AND d.token_id IS NOT NULL
        AND d.status = 'active'
      ORDER BY d.created_at DESC
    `);

    const domainsWithMissingCIDs = missingResult.rows;
    console.log(`   Found ${domainsWithMissingCIDs.length} domains with missing image CIDs\n`);

    if (domainsWithMissingCIDs.length === 0) {
      console.log('All domains have their NFT image CIDs. Nothing to repair.');
      await pool.end();
      return;
    }

    // Step 2: Check nft_preparations for each domain
    console.log('Step 2: Checking nft_preparations table for existing data...');

    const fqdnList = domainsWithMissingCIDs.map(d => d.fqdn);
    const preparationsResult = await query(`
      SELECT
        fqdn,
        image_cid,
        metadata_cid,
        generation_seed,
        tier,
        theme,
        created_at
      FROM nft_preparations
      WHERE fqdn = ANY($1)
    `, [fqdnList]);

    const preparationsMap = new Map();
    preparationsResult.rows.forEach(prep => {
      preparationsMap.set(prep.fqdn.toLowerCase(), prep);
    });

    console.log(`   Found ${preparationsMap.size} existing preparations\n`);

    // Step 3: Categorize domains
    const withPreparation = [];
    const withoutPreparation = [];

    domainsWithMissingCIDs.forEach(domain => {
      const prep = preparationsMap.get(domain.fqdn.toLowerCase());
      if (prep) {
        withPreparation.push({ domain, prep });
      } else {
        withoutPreparation.push(domain);
      }
    });

    console.log('Step 3: Analysis Summary');
    console.log(`   - ${withPreparation.length} domains can be fixed (have preparations)`);
    console.log(`   - ${withoutPreparation.length} domains need regeneration (no preparations)\n`);

    // Step 4: Fix domains with existing preparations
    if (withPreparation.length > 0) {
      console.log('Step 4: Fixing domains with existing preparations...');

      let fixed = 0;
      let failed = 0;

      for (const { domain, prep } of withPreparation) {
        console.log(`   [${fixed + failed + 1}/${withPreparation.length}] ${domain.fqdn}`);
        console.log(`      Token ID: ${domain.token_id}`);
        console.log(`      Image CID: ${prep.image_cid}`);
        console.log(`      Metadata CID: ${prep.metadata_cid}`);

        if (!dryRun) {
          try {
            await query(`
              UPDATE domains SET
                nft_image_cid = $2,
                nft_metadata_cid = $3,
                nft_generation_seed = $4,
                metadata_uri = $5,
                updated_at = NOW()
              WHERE fqdn = $1
            `, [
              domain.fqdn.toLowerCase(),
              prep.image_cid,
              prep.metadata_cid,
              prep.generation_seed,
              `ipfs://${prep.metadata_cid}`
            ]);
            console.log(`      ✅ Fixed!`);
            fixed++;
          } catch (error) {
            console.log(`      ❌ Failed: ${error.message}`);
            failed++;
          }
        } else {
          console.log(`      → Would fix (dry run)`);
          fixed++;
        }
      }

      console.log(`\n   Summary: ${fixed} fixed, ${failed} failed\n`);
    }

    // Step 4b: Fix domains with image_cid but missing metadata_cid
    console.log('Step 4b: Finding domains with image_cid but missing metadata_cid...');
    const missingMetadataResult = await query(`
      SELECT fqdn, nft_image_cid, metadata_uri
      FROM domains
      WHERE nft_image_cid IS NOT NULL
        AND nft_metadata_cid IS NULL
        AND metadata_uri IS NOT NULL
        AND metadata_uri LIKE 'ipfs://%'
    `);

    if (missingMetadataResult.rows.length > 0) {
      console.log(`   Found ${missingMetadataResult.rows.length} domains with missing metadata_cid`);
      let fixedMetadata = 0;

      for (const row of missingMetadataResult.rows) {
        // Extract CID from ipfs:// URI
        const metadataCid = row.metadata_uri.replace('ipfs://', '');
        console.log(`   - ${row.fqdn}: extracting metadata_cid from metadata_uri`);

        if (!dryRun) {
          try {
            await query(`
              UPDATE domains SET nft_metadata_cid = $2, updated_at = NOW()
              WHERE fqdn = $1
            `, [row.fqdn.toLowerCase(), metadataCid]);
            fixedMetadata++;
          } catch (error) {
            console.log(`     ❌ Failed: ${error.message}`);
          }
        } else {
          fixedMetadata++;
        }
      }
      console.log(`   ${dryRun ? 'Would fix' : 'Fixed'} ${fixedMetadata} domains\n`);
    } else {
      console.log('   No domains with missing metadata_cid found\n');
    }

    // Step 5: Regenerate domains without preparations (if requested)
    if (withoutPreparation.length > 0) {
      console.log('Step 5: Domains without preparations:');

      for (const domain of withoutPreparation) {
        console.log(`   - ${domain.fqdn} (token: ${domain.token_id})`);
      }

      if (shouldRegenerate) {
        console.log('\n   Regenerating NFTs for domains without preparations...');

        let regenerated = 0;
        let failed = 0;

        for (const domain of withoutPreparation) {
          console.log(`\n   [${regenerated + failed + 1}/${withoutPreparation.length}] Regenerating: ${domain.fqdn}`);

          try {
            const response = await fetch(`${HSR_API}/nft/prepare`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subdomain: domain.subdomain,
                tld: domain.tld_name,
                theme: 'default',
                customPrompt: DEFAULT_PROMPT,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              console.log(`      ✅ Generated! Image CID: ${data.imageCID}`);

              // Update domains table with new CIDs
              await query(`
                UPDATE domains SET
                  nft_image_cid = $2,
                  nft_metadata_cid = $3,
                  nft_generation_seed = $4,
                  metadata_uri = $5,
                  updated_at = NOW()
                WHERE fqdn = $1
              `, [
                domain.fqdn.toLowerCase(),
                data.imageCID,
                data.metadataCID,
                data.seed,
                data.metadataURI
              ]);

              regenerated++;
            } else {
              const error = await response.text();
              console.log(`      ❌ Failed: ${error}`);
              failed++;
            }
          } catch (error) {
            console.log(`      ❌ Error: ${error.message}`);
            failed++;
          }

          // Delay between regenerations to avoid rate limiting
          if (regenerated + failed < withoutPreparation.length) {
            console.log('      Waiting 3s before next...');
            await sleep(3000);
          }
        }

        console.log(`\n   Regeneration Summary: ${regenerated} regenerated, ${failed} failed`);
      } else {
        console.log('\n   Use --regenerate flag to regenerate missing NFTs');
      }
    }

    // Step 6: Verify marketplace listings
    console.log('\nStep 6: Checking marketplace listings with broken images...');

    const brokenListingsResult = await query(`
      SELECT
        ml.listing_id,
        ml.token_id,
        ml.fqdn,
        d.nft_image_cid,
        d.nft_metadata_cid
      FROM marketplace_listings ml
      LEFT JOIN domains d ON ml.token_id::text = d.token_id::text
      WHERE ml.status = 'active'
        AND (d.nft_image_cid IS NULL OR d.nft_metadata_cid IS NULL)
    `);

    if (brokenListingsResult.rows.length > 0) {
      console.log(`   ⚠️  ${brokenListingsResult.rows.length} active listings still have broken images:`);
      brokenListingsResult.rows.forEach(listing => {
        console.log(`      - Listing ${listing.listing_id}: ${listing.fqdn || 'unknown'} (token ${listing.token_id})`);
      });
    } else {
      console.log('   ✅ All active marketplace listings have valid image CIDs');
    }

    console.log('\n' + '='.repeat(70));
    console.log('Repair Complete!');
    console.log('='.repeat(70));

    if (dryRun) {
      console.log('\nThis was a dry run. To apply fixes, run:');
      console.log('   node scripts/repair-nft-images.js --fix');
      console.log('\nTo also regenerate missing NFTs, run:');
      console.log('   node scripts/repair-nft-images.js --regenerate');
    }

  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
