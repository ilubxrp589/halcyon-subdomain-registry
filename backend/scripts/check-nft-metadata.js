#!/usr/bin/env node
import 'dotenv/config';

/**
 * NFT Metadata Checker Script
 *
 * Diagnoses NFT image issues by:
 * 1. Checking on-chain tokenURI from the contract
 * 2. Fetching metadata from IPFS
 * 3. Verifying the image field format
 * 4. Checking if image is accessible
 *
 * Usage:
 *   node scripts/check-nft-metadata.js <token_id>
 *   node scripts/check-nft-metadata.js <fqdn>
 */

import { ethers } from 'ethers';
import pool, { query } from '../src/db/index.js';
import config from '../src/config/index.js';

const GATEWAY_URL = 'https://gateway.pinata.cloud/ipfs';

// NFT contract ABI - just what we need
const NFT_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.log('Usage: node scripts/check-nft-metadata.js <token_id or fqdn>');
    console.log('Example: node scripts/check-nft-metadata.js 1');
    console.log('Example: node scripts/check-nft-metadata.js alpha.cryptofans');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('NFT Metadata Diagnostic Tool');
  console.log('='.repeat(70));
  console.log('');

  try {
    let tokenId;
    let fqdn;

    // Determine if arg is token_id or fqdn
    if (arg.includes('.')) {
      fqdn = arg.toLowerCase();
      console.log(`Looking up domain: ${fqdn}`);

      const result = await query('SELECT token_id FROM domains WHERE fqdn = $1', [fqdn]);
      if (result.rows.length === 0) {
        console.log(`❌ Domain not found in database: ${fqdn}`);
        await pool.end();
        return;
      }
      tokenId = result.rows[0].token_id;
      console.log(`   Token ID: ${tokenId}`);
    } else {
      tokenId = arg;
      console.log(`Looking up token ID: ${tokenId}`);

      const result = await query('SELECT fqdn FROM domains WHERE token_id = $1', [tokenId]);
      if (result.rows.length > 0) {
        fqdn = result.rows[0].fqdn;
        console.log(`   Domain: ${fqdn}`);
      }
    }

    console.log('');

    // Step 1: Check database
    console.log('Step 1: Database Check');
    console.log('-'.repeat(40));

    const dbResult = await query(`
      SELECT
        d.fqdn,
        d.token_id,
        d.nft_image_cid,
        d.nft_metadata_cid,
        d.metadata_uri,
        d.owner_wallet,
        p.image_cid as prep_image_cid,
        p.metadata_cid as prep_metadata_cid,
        p.created_at as prep_created_at
      FROM domains d
      LEFT JOIN nft_preparations p ON d.fqdn = p.fqdn
      WHERE d.token_id = $1
    `, [tokenId]);

    if (dbResult.rows.length === 0) {
      console.log(`❌ No domain found with token_id ${tokenId}`);
      await pool.end();
      return;
    }

    const domain = dbResult.rows[0];
    console.log(`Domain: ${domain.fqdn}`);
    console.log(`Owner: ${domain.owner_wallet}`);
    console.log(`NFT Image CID: ${domain.nft_image_cid || '❌ NULL'}`);
    console.log(`NFT Metadata CID: ${domain.nft_metadata_cid || '❌ NULL'}`);
    console.log(`Metadata URI: ${domain.metadata_uri || '❌ NULL'}`);
    console.log(`Preparation Image CID: ${domain.prep_image_cid || '⚠️ No preparation'}`);
    console.log(`Preparation Metadata CID: ${domain.prep_metadata_cid || '⚠️ No preparation'}`);
    console.log('');

    // Step 2: Check on-chain tokenURI
    console.log('Step 2: On-Chain Check');
    console.log('-'.repeat(40));

    const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
    const nftContract = new ethers.Contract(config.contracts.nft, NFT_ABI, provider);

    let onChainUri;
    try {
      onChainUri = await nftContract.tokenURI(tokenId);
      console.log(`tokenURI(): ${onChainUri}`);

      if (onChainUri.startsWith('ipfs://')) {
        console.log('✅ URI format is correct (ipfs://)');
      } else if (onChainUri.startsWith('http')) {
        console.log('⚠️ URI is HTTP - should be ipfs://');
      } else {
        console.log('❓ Unknown URI format');
      }
    } catch (error) {
      console.log(`❌ Failed to get tokenURI: ${error.message}`);
    }

    let onChainOwner;
    try {
      onChainOwner = await nftContract.ownerOf(tokenId);
      console.log(`ownerOf(): ${onChainOwner}`);
    } catch (error) {
      console.log(`❌ Token may not exist: ${error.message}`);
    }
    console.log('');

    // Step 3: Fetch IPFS metadata
    console.log('Step 3: IPFS Metadata Check');
    console.log('-'.repeat(40));

    if (!onChainUri && !domain.nft_metadata_cid && !domain.prep_metadata_cid) {
      console.log('❌ No metadata CID available to check');
    } else {
      const metadataCID = onChainUri?.replace('ipfs://', '')
        || domain.nft_metadata_cid
        || domain.prep_metadata_cid;

      const metadataUrl = `${GATEWAY_URL}/${metadataCID}`;
      console.log(`Fetching: ${metadataUrl}`);

      try {
        const response = await fetch(metadataUrl, { timeout: 10000 });

        if (!response.ok) {
          console.log(`❌ Failed to fetch metadata: HTTP ${response.status}`);
        } else {
          const metadata = await response.json();
          console.log(`\nMetadata content:`);
          console.log(`  name: ${metadata.name}`);
          console.log(`  description: ${metadata.description?.substring(0, 60)}...`);
          console.log(`  image: ${metadata.image}`);

          if (metadata.image) {
            if (metadata.image.startsWith('ipfs://')) {
              console.log('  ✅ Image field has correct ipfs:// format');
            } else if (metadata.image.startsWith('http://localhost')) {
              console.log('  ❌ Image field points to localhost! This is the bug.');
            } else if (metadata.image.startsWith('http')) {
              console.log('  ⚠️ Image field is HTTP URL instead of ipfs://');
            } else {
              console.log('  ❓ Unknown image format');
            }
          } else {
            console.log('  ❌ No image field in metadata!');
          }

          console.log(`\nAttributes:`);
          metadata.attributes?.forEach(attr => {
            console.log(`  ${attr.trait_type}: ${attr.value}`);
          });
        }
      } catch (error) {
        console.log(`❌ Failed to fetch metadata: ${error.message}`);
      }
    }
    console.log('');

    // Step 4: Check image accessibility
    console.log('Step 4: Image Accessibility Check');
    console.log('-'.repeat(40));

    const imageCID = domain.nft_image_cid || domain.prep_image_cid;
    if (!imageCID) {
      console.log('❌ No image CID available to check');
    } else {
      const imageUrl = `${GATEWAY_URL}/${imageCID}`;
      console.log(`Checking: ${imageUrl}`);

      try {
        const response = await fetch(imageUrl, { method: 'HEAD', timeout: 10000 });
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          const contentLength = response.headers.get('content-length');
          console.log(`✅ Image accessible`);
          console.log(`   Content-Type: ${contentType}`);
          console.log(`   Size: ${contentLength ? `${Math.round(parseInt(contentLength) / 1024)} KB` : 'unknown'}`);
        } else {
          console.log(`❌ Image not accessible: HTTP ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ Failed to check image: ${error.message}`);
      }
    }
    console.log('');

    // Summary
    console.log('='.repeat(70));
    console.log('DIAGNOSIS SUMMARY');
    console.log('='.repeat(70));

    const issues = [];

    if (!domain.nft_image_cid) {
      issues.push('Missing nft_image_cid in domains table');
    }
    if (!domain.nft_metadata_cid) {
      issues.push('Missing nft_metadata_cid in domains table');
    }
    if (domain.prep_image_cid && !domain.nft_image_cid) {
      issues.push('Preparation exists but CIDs not copied to domains table');
    }
    if (!domain.prep_image_cid && !domain.nft_image_cid) {
      issues.push('No preparation exists - need to regenerate NFT');
    }

    if (issues.length === 0) {
      console.log('✅ No issues detected - NFT should display correctly');
    } else {
      console.log('Issues found:');
      issues.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue}`);
      });
      console.log('');
      console.log('To fix, run:');
      console.log('  node scripts/repair-nft-images.js --fix');
    }

  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
