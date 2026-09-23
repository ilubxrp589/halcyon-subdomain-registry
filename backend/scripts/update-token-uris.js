#!/usr/bin/env node
import 'dotenv/config';

/**
 * Update Token URIs to IPFS
 *
 * Updates on-chain tokenURI for all NFTs to point to IPFS metadata.
 * Requires the deployer/admin private key.
 *
 * Usage:
 *   DEPLOYER_KEY=<private_key> node scripts/update-token-uris.js
 *   DEPLOYER_KEY=<private_key> node scripts/update-token-uris.js --dry-run
 */

import { ethers } from 'ethers';
import pool, { query } from '../src/db/index.js';
import config from '../src/config/index.js';

const NFT_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function updateTokenURI(uint256 tokenId, string memory newURI) external',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('='.repeat(70));
  console.log('Update Token URIs to IPFS');
  console.log('='.repeat(70));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE - Will update on-chain'}`);
  console.log('');

  if (!DEPLOYER_KEY) {
    console.error('ERROR: DEPLOYER_KEY environment variable is required');
    console.error('Usage: DEPLOYER_KEY=<private_key> node scripts/update-token-uris.js');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
  const wallet = new ethers.Wallet(DEPLOYER_KEY, provider);
  const contract = new ethers.Contract(config.contracts.nft, NFT_ABI, wallet);

  console.log('Deployer wallet:', wallet.address);
  console.log('NFT Contract:', config.contracts.nft);
  console.log('');

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Wallet balance:', ethers.formatEther(balance), 'FLR');

  if (balance === 0n) {
    console.error('ERROR: Wallet has no FLR for gas');
    process.exit(1);
  }
  console.log('');

  // Find domains with metadata CID that need updating
  const result = await query(`
    SELECT
      d.token_id,
      d.fqdn,
      d.nft_metadata_cid,
      d.metadata_uri
    FROM domains d
    WHERE d.token_id IS NOT NULL
      AND d.nft_metadata_cid IS NOT NULL
    ORDER BY d.token_id
  `);

  console.log(`Found ${result.rows.length} domains with metadata CIDs`);
  console.log('');

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const domain of result.rows) {
    const tokenId = domain.token_id;
    const expectedUri = `ipfs://${domain.nft_metadata_cid}`;

    try {
      // Check current on-chain URI
      const currentUri = await contract.tokenURI(tokenId);

      if (currentUri === expectedUri) {
        console.log(`[${tokenId}] ${domain.fqdn}: Already correct ✓`);
        skipped++;
        continue;
      }

      console.log(`[${tokenId}] ${domain.fqdn}:`);
      console.log(`   Current: ${currentUri.substring(0, 60)}...`);
      console.log(`   New:     ${expectedUri}`);

      if (!dryRun) {
        const tx = await contract.updateTokenURI(tokenId, expectedUri);
        console.log(`   TX: ${tx.hash}`);
        await tx.wait();
        console.log(`   ✅ Updated!`);
        updated++;
      } else {
        console.log(`   → Would update (dry run)`);
        updated++;
      }

    } catch (error) {
      console.log(`[${tokenId}] ${domain.fqdn}: ❌ Error - ${error.message.substring(0, 80)}`);
      failed++;
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already correct): ${skipped}`);
  console.log(`Failed: ${failed}`);

  if (dryRun) {
    console.log('');
    console.log('This was a dry run. To apply changes:');
    console.log('  DEPLOYER_KEY=<key> node scripts/update-token-uris.js');
  }

  await pool.end();
}

main().catch(console.error);
