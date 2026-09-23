#!/usr/bin/env node

/**
 * Backfill Expiring Names
 *
 * Scans hsd blocks for OPEN/CLAIM covenants to build a name pool,
 * then queries getnameinfo for each to find names that are expiring
 * within the next year (or already expired). Inserts them into
 * discovered_auctions as CLOSED entries so the /expiring endpoint can serve them.
 *
 * Usage:
 *   node backfill-expiring-names.js [--start=HEIGHT] [--end=HEIGHT] [--batch=SIZE]
 *
 * Defaults scan blocks 1 through 270,000 in chunks, collecting ~100 names/block.
 * This is a long-running job (~30-60 minutes for full scan).
 */

import { NodeClient } from 'hs-client';
import pg from 'pg';

// ── Config ──────────────────────────────────────────────────────────
const HSD_HOST = process.env.HNS_HOST || '127.0.0.1';
const HSD_PORT = parseInt(process.env.HNS_PORT || '12037');
const HSD_API_KEY = process.env.HNS_API_KEY || 'REDACTED';
const DB_URL = process.env.DATABASE_URL || 'postgresql://subdomain_user:REDACTED@localhost:5432/subdomain_registry';

const NAME_EXPIRY_BLOCKS = 105120;  // ~2 years
const BLOCKS_PER_DAY = 144;

// Parse CLI args
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.replace('--', '').split('='); return [k, v]; })
);

const nc = new NodeClient({ host: HSD_HOST, port: HSD_PORT, apiKey: HSD_API_KEY });

const pool = new pg.Pool({ connectionString: DB_URL });

// ── Phase 1: Scan blocks for OPEN/CLAIM covenants ──────────────────

async function scanBlocksForNames(startHeight, endHeight, progressInterval = 500) {
  const names = new Set();
  let covenantCount = 0;

  console.log(`[Phase 1] Scanning blocks ${startHeight} - ${endHeight} for OPEN/CLAIM covenants...`);

  for (let h = startHeight; h <= endHeight; h++) {
    try {
      const hash = await nc.execute('getblockhash', [h]);
      const block = await nc.execute('getblock', [hash, true, true]);

      if (!block?.tx) continue;

      for (const tx of block.tx) {
        if (!tx.vout) continue;
        for (const out of tx.vout) {
          const cov = out.covenant;
          if (!cov) continue;
          // CLAIM=1, OPEN=2 — both have readable name in items[2]
          if (cov.type === 1 || cov.type === 2) {
            const nameHex = cov.items?.[2];
            if (nameHex) {
              try {
                const name = Buffer.from(nameHex, 'hex').toString('ascii');
                if (name && name.length > 0) {
                  names.add(name);
                  covenantCount++;
                }
              } catch { /* skip malformed */ }
            }
          }
        }
      }
    } catch (err) {
      console.error(`  Block ${h} error: ${err.message}`);
      // Continue — don't let one bad block stop the scan
    }

    if ((h - startHeight) % progressInterval === 0 && h > startHeight) {
      const pct = (((h - startHeight) / (endHeight - startHeight)) * 100).toFixed(1);
      console.log(`  Block ${h} (${pct}%) — ${names.size} unique names, ${covenantCount} covenants`);
    }
  }

  console.log(`[Phase 1] Done. Found ${names.size} unique names from ${covenantCount} covenants.`);
  return names;
}

// ── Phase 2: Check expiry for each name via getnameinfo ─────────────

async function checkExpiry(names, currentHeight) {
  const expiring = [];
  const batchSize = 20; // Parallel queries
  const nameArray = Array.from(names);
  let checked = 0;
  let errors = 0;

  console.log(`[Phase 2] Checking expiry for ${nameArray.length} names (currentHeight=${currentHeight})...`);
  console.log(`  Names expiring within 1 year: renewal < ${currentHeight - NAME_EXPIRY_BLOCKS + 365 * BLOCKS_PER_DAY}`);

  for (let i = 0; i < nameArray.length; i += batchSize) {
    const batch = nameArray.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (name) => {
        const info = await nc.execute('getnameinfo', [name]);
        if (!info?.info) return null;

        const renewal = info.info.renewal || info.info.height || 0;
        if (renewal === 0) return null;

        const expiryHeight = renewal + NAME_EXPIRY_BLOCKS;
        const blocksLeft = expiryHeight - currentHeight;
        const daysLeft = Math.round(blocksLeft * 10 / 1440);

        // Only care about names expiring within 1 year (or already expired)
        if (daysLeft > 365) return null;

        return {
          name,
          state: info.info.state,
          renewal,
          expiryHeight,
          blocksLeft,
          daysLeft,
          owner: info.info.owner?.hash || null,
          value: info.info.value || 0,
          highest: info.info.highest || 0,
        };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        expiring.push(result.value);
      } else if (result.status === 'rejected') {
        errors++;
      }
    }

    checked += batch.length;
    if (checked % 500 === 0 || checked === nameArray.length) {
      console.log(`  Checked ${checked}/${nameArray.length} — ${expiring.length} expiring found, ${errors} errors`);
    }
  }

  console.log(`[Phase 2] Done. ${expiring.length} names expiring within 1 year.`);
  return expiring;
}

// ── Phase 3: Insert into discovered_auctions ────────────────────────

async function insertExpiring(expiringNames, currentHeight) {
  console.log(`[Phase 3] Inserting ${expiringNames.length} names into discovered_auctions...`);
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const name of expiringNames) {
    try {
      const result = await pool.query(
        `INSERT INTO discovered_auctions
           (name, state, open_height, bid_count, highest_lockup, highest_reveal, winner_address, current_height, first_seen_at, updated_at)
         VALUES ($1, 'CLOSED', $2, 0, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (name) DO UPDATE SET
           current_height = $6,
           winner_address = COALESCE(EXCLUDED.winner_address, discovered_auctions.winner_address),
           updated_at = NOW()
         RETURNING (xmax = 0) AS is_insert`,
        [
          name.name,
          name.renewal, // open_height = renewal height (close enough for display)
          name.highest,
          name.value,
          name.owner,
          currentHeight,
        ]
      );

      if (result.rows[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`  Insert error for "${name.name}": ${err.message}`);
      }
    }
  }

  console.log(`[Phase 3] Done. Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  try {
    // Get chain height
    const info = await nc.getInfo();
    const currentHeight = info.chain.height;
    console.log(`Current chain height: ${currentHeight}`);

    // Determine scan range
    // To find names expiring within 1 year:
    //   renewal + 105120 < currentHeight + 52560
    //   renewal < currentHeight - 52560
    // Names registered before block ~267,000 could be expiring
    // But names can be opened at any time — we scan OPEN covenants to find name strings
    // We scan from block 1 (or a starting point) through ~270,000
    // The scan is for name DISCOVERY only — expiry check happens in Phase 2

    const scanStart = parseInt(args.start) || 1;
    const scanEnd = parseInt(args.end) || Math.min(currentHeight, 270000);
    const blockBatch = parseInt(args.batch) || 1000;

    console.log(`\nScan range: blocks ${scanStart} - ${scanEnd}`);
    console.log(`Block batch size: ${blockBatch}`);
    console.log(`Estimated time: ~${Math.round((scanEnd - scanStart) / 300)} seconds\n`);

    // Phase 1: Collect names in chunks (to show progress and allow resumption)
    const allNames = new Set();

    for (let chunkStart = scanStart; chunkStart <= scanEnd; chunkStart += blockBatch) {
      const chunkEnd = Math.min(chunkStart + blockBatch - 1, scanEnd);
      const chunkNames = await scanBlocksForNames(chunkStart, chunkEnd, 200);

      for (const name of chunkNames) {
        allNames.add(name);
      }
      console.log(`  Running total: ${allNames.size} unique names\n`);
    }

    console.log(`\nTotal unique names discovered: ${allNames.size}`);

    // Phase 2: Check expiry for all names
    const expiringNames = await checkExpiry(allNames, currentHeight);

    if (expiringNames.length === 0) {
      console.log('\nNo expiring names found. Done.');
      process.exit(0);
    }

    // Sort by days left
    expiringNames.sort((a, b) => a.daysLeft - b.daysLeft);

    console.log('\nTop 20 soonest-expiring:');
    for (const n of expiringNames.slice(0, 20)) {
      const status = n.daysLeft <= 0 ? 'EXPIRED' : n.daysLeft <= 30 ? 'GRACE' : 'EXPIRING';
      console.log(`  ${n.name.padEnd(30)} ${status.padEnd(10)} ${n.daysLeft} days left (renewal: ${n.renewal})`);
    }

    // Phase 3: Insert into DB
    await insertExpiring(expiringNames, currentHeight);

    console.log('\nBackfill complete!');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
