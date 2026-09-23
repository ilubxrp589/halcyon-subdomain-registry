import { loggers } from '../utils/logger.js';
import { query } from '../db/index.js';
import hnsService from './hns.js';

const log = loggers.hns;

// Handshake auction timing constants (in blocks, ~10 min each)
const AUCTION_OPEN_PERIOD = 37;      // ~6 hours
const AUCTION_BID_PERIOD = 720;      // ~5 days
const AUCTION_REVEAL_PERIOD = 1440;  // ~10 days

// Covenant type numbers from hsd
const COVENANT = {
  NONE: 0,
  CLAIM: 1,
  OPEN: 2,
  BID: 3,
  REVEAL: 4,
  REDEEM: 5,
  REGISTER: 6,
  UPDATE: 7,
  RENEW: 8,
  TRANSFER: 9,
  FINALIZE: 10,
  REVOKE: 11,
};

// Reverse map for logging
const COVENANT_NAMES = Object.fromEntries(
  Object.entries(COVENANT).map(([k, v]) => [v, k])
);

const POLL_INTERVAL = 30000;          // 30s between poll cycles
const INITIAL_LOOKBACK = 4320;        // ~30 days of blocks on first run
const MAX_BLOCKS_PER_CYCLE = 50;      // Process up to 50 blocks per cycle to avoid blocking
const NAME_HASH_CACHE_MAX = 10000;    // Max entries in nameHash LRU cache

/**
 * Simple LRU cache with O(1) get/set using Map insertion order.
 */
class LRUCache {
  constructor(maxSize) {
    this._max = maxSize;
    this._map = new Map();
  }
  get(key) {
    if (!this._map.has(key)) return undefined;
    const value = this._map.get(key);
    // Move to end (most recent)
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }
  set(key, value) {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, value);
    // Evict oldest if over capacity
    if (this._map.size > this._max) {
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
  }
  get size() { return this._map.size; }
}

/**
 * Auction Scanner Service
 *
 * Background service that polls hsd for new blocks, extracts name covenants,
 * and populates discovered_auctions + auction_bids tables.
 * This enables the auction house to display all active auctions for browsing.
 */
class AuctionScanner {
  constructor() {
    this._interval = null;
    this._running = false;
    this._processing = false;
    // LRU nameHash → name cache to resolve REVEAL/REGISTER covenants (bounded)
    this._nameHashCache = new LRUCache(NAME_HASH_CACHE_MAX);
  }

  async start() {
    if (this._running) return;
    this._running = true;

    log.info('Auction scanner starting...');

    // Warm up nameHash cache from existing DB records
    try {
      const rows = await query(
        `SELECT DISTINCT ON (name) name FROM discovered_auctions`
      );
      log.info({ count: rows.rows.length }, 'Loaded existing auction names into cache');
    } catch (err) {
      log.warn({ err: err.message }, 'Failed to warm nameHash cache');
    }

    // Initial scan
    await this._poll();

    // Schedule recurring polls
    this._interval = setInterval(() => this._poll(), POLL_INTERVAL);
    log.info('Auction scanner started');
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._running = false;
    log.info('Auction scanner stopped');
  }

  async _poll() {
    if (this._processing) return;
    this._processing = true;

    try {
      // Get current chain height
      const info = await hnsService.nodeClient.getInfo();
      const chainHeight = info.chain?.height;
      if (!chainHeight) {
        log.warn('Could not get chain height');
        return;
      }

      // Get last processed height from checkpoint
      let lastProcessed = 0;
      try {
        const cp = await query('SELECT last_processed_height FROM block_scan_checkpoint WHERE id = 1');
        if (cp.rows.length > 0) {
          lastProcessed = cp.rows[0].last_processed_height;
        }
      } catch {
        // Table may be empty on first run
      }

      // On first run, start from lookback window
      if (lastProcessed === 0) {
        lastProcessed = Math.max(0, chainHeight - INITIAL_LOOKBACK);
        log.info({ startHeight: lastProcessed, chainHeight }, 'First run — starting from lookback');
      }

      // Nothing new
      if (lastProcessed >= chainHeight) {
        return;
      }

      const startHeight = lastProcessed + 1;
      const endHeight = Math.min(chainHeight, startHeight + MAX_BLOCKS_PER_CYCLE - 1);
      const blockCount = endHeight - startHeight + 1;

      if (blockCount > 5) {
        log.info({ startHeight, endHeight, blockCount, chainHeight }, 'Processing blocks');
      }

      let totalCovenants = 0;

      for (let h = startHeight; h <= endHeight; h++) {
        try {
          const covenants = await this._processBlock(h);
          totalCovenants += covenants;
        } catch (err) {
          log.error({ err: err.message, height: h }, 'Failed to process block');
          // Stop at the failed block so we retry it next cycle
          await this._updateCheckpoint(h - 1);
          return;
        }
      }

      // Update checkpoint
      await this._updateCheckpoint(endHeight);

      if (totalCovenants > 0 || blockCount > 5) {
        log.info({ startHeight, endHeight, blockCount, totalCovenants }, 'Scan cycle complete');
      }

      // Update current_height on active auctions for frontend timer calculation
      if (totalCovenants > 0) {
        await query(
          `UPDATE discovered_auctions SET current_height = $1, updated_at = NOW()
           WHERE state IN ('OPENING', 'BIDDING', 'REVEAL')`,
          [chainHeight]
        );
      }
    } catch (err) {
      log.error({ err: err.message }, 'Auction scanner poll error');
    } finally {
      this._processing = false;
    }
  }

  /**
   * Process a single block — extract name covenants, upsert auctions + bids.
   * Returns the number of name covenants found.
   */
  async _processBlock(height) {
    // getblockbyheight with verbose=true, details=true gives decoded txs
    const hash = await hnsService.nodeClient.execute('getblockhash', [height]);
    const block = await hnsService.nodeClient.execute('getblock', [hash, true, true]);

    if (!block?.tx) return 0;

    let covenantCount = 0;

    for (const tx of block.tx) {
      if (!tx.vout) continue;

      for (const out of tx.vout) {
        const cov = out.covenant;
        if (!cov || cov.type < COVENANT.OPEN || cov.type > COVENANT.REVOKE) continue;

        const nameHash = cov.items[0];
        const name = this._extractName(cov);
        const address = out.address?.string || null;
        const value = Math.round((out.value || 0) * 1e6); // HSD returns HNS floats, convert to dollarydoos

        if (!name && !nameHash) continue;

        // Resolve name from cache if not directly in covenant
        const resolvedName = name || this._nameHashCache.get(nameHash);

        if (name && nameHash) {
          this._nameHashCache.set(nameHash, name);
        }

        if (!resolvedName) {
          // Can't resolve this covenant's name — skip (happens for old reveals)
          continue;
        }

        try {
          await this._handleCovenant(resolvedName, cov.type, height, tx.txid, value, address, nameHash);
          covenantCount++;
        } catch (err) {
          log.warn({ err: err.message, name: resolvedName, type: COVENANT_NAMES[cov.type] }, 'Failed to handle covenant');
        }
      }
    }

    return covenantCount;
  }

  /**
   * Extract the human-readable name from a covenant's items.
   * OPEN (2) and BID (3) have the name in items[2] as hex-encoded ASCII.
   * CLAIM (1) has it in items[2] as well.
   * Other types (REVEAL, REGISTER, etc.) only have the nameHash — need cache lookup.
   */
  _extractName(covenant) {
    if (covenant.type === COVENANT.OPEN || covenant.type === COVENANT.BID || covenant.type === COVENANT.CLAIM) {
      const nameHex = covenant.items[2];
      if (nameHex) {
        try {
          return Buffer.from(nameHex, 'hex').toString('ascii');
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Handle a single covenant — upsert discovered_auctions and insert auction_bids.
   */
  async _handleCovenant(name, type, blockHeight, txHash, value, address, nameHash) {
    const typeName = COVENANT_NAMES[type] || `TYPE_${type}`;

    // Insert bid record (all covenant types get logged)
    await query(
      `INSERT INTO auction_bids (name, tx_hash, block_height, covenant_type, lockup_value, address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (tx_hash, name, covenant_type) DO NOTHING`,
      [name, txHash, blockHeight, typeName, value, address]
    );

    // Upsert discovered_auctions based on covenant type
    switch (type) {
      case COVENANT.OPEN:
      case COVENANT.CLAIM: {
        const biddingEnds = blockHeight + AUCTION_OPEN_PERIOD + AUCTION_BID_PERIOD;
        const revealEnds = biddingEnds + AUCTION_REVEAL_PERIOD;

        await query(
          `INSERT INTO discovered_auctions
             (name, state, open_height, bid_count, highest_lockup, bidding_ends_height, reveal_ends_height, current_height, first_seen_at, updated_at)
           VALUES ($1, 'OPENING', $2, 0, 0, $3, $4, $2, NOW(), NOW())
           ON CONFLICT (name) DO UPDATE SET
             state = CASE
               WHEN discovered_auctions.state IN ('CLOSED', 'TRANSFER', 'REVOKE') THEN 'OPENING'
               ELSE discovered_auctions.state
             END,
             open_height = COALESCE(EXCLUDED.open_height, discovered_auctions.open_height),
             bidding_ends_height = CASE
               WHEN discovered_auctions.state IN ('CLOSED', 'TRANSFER', 'REVOKE') THEN $3
               ELSE discovered_auctions.bidding_ends_height
             END,
             reveal_ends_height = CASE
               WHEN discovered_auctions.state IN ('CLOSED', 'TRANSFER', 'REVOKE') THEN $4
               ELSE discovered_auctions.reveal_ends_height
             END,
             current_height = $2,
             updated_at = NOW()`,
          [name, blockHeight, biddingEnds, revealEnds]
        );
        break;
      }

      case COVENANT.BID: {
        await query(
          `INSERT INTO discovered_auctions
             (name, state, open_height, bid_count, highest_lockup, current_height, first_seen_at, updated_at)
           VALUES ($1, 'BIDDING', $3, 1, $2, $3, NOW(), NOW())
           ON CONFLICT (name) DO UPDATE SET
             state = 'BIDDING',
             bid_count = discovered_auctions.bid_count + 1,
             highest_lockup = GREATEST(discovered_auctions.highest_lockup, $2),
             current_height = $3,
             updated_at = NOW()`,
          [name, value, blockHeight]
        );
        break;
      }

      case COVENANT.REVEAL: {
        await query(
          `INSERT INTO discovered_auctions
             (name, state, open_height, reveal_count, highest_reveal, current_height, first_seen_at, updated_at)
           VALUES ($1, 'REVEAL', $3, 1, $2, $3, NOW(), NOW())
           ON CONFLICT (name) DO UPDATE SET
             state = 'REVEAL',
             reveal_count = discovered_auctions.reveal_count + 1,
             highest_reveal = GREATEST(discovered_auctions.highest_reveal, $2),
             current_height = $3,
             updated_at = NOW()`,
          [name, value, blockHeight]
        );

        // Update the bid record with the reveal value (most recent BID by this address)
        await query(
          `UPDATE auction_bids SET reveal_value = $1
           WHERE id = (
             SELECT id FROM auction_bids
             WHERE name = $2 AND address = $3 AND covenant_type = 'BID' AND reveal_value IS NULL
             ORDER BY block_height DESC LIMIT 1
           )`,
          [value, name, address]
        ).catch(() => {}); // Best-effort
        break;
      }

      case COVENANT.REDEEM: {
        // Losing bidder reclaims their coins — no state change needed
        break;
      }

      case COVENANT.REGISTER: {
        await query(
          `UPDATE discovered_auctions SET
             state = 'CLOSED',
             winner_address = $2,
             current_height = $3,
             updated_at = NOW()
           WHERE name = $1`,
          [name, address, blockHeight]
        );
        await this._updateNameStatus(name, type, blockHeight, value, address);
        break;
      }

      case COVENANT.TRANSFER: {
        await query(
          `UPDATE discovered_auctions SET
             state = 'TRANSFER',
             current_height = $2,
             updated_at = NOW()
           WHERE name = $1`,
          [name, blockHeight]
        );
        await this._updateNameStatus(name, type, blockHeight, value, address);
        break;
      }

      case COVENANT.FINALIZE: {
        await query(
          `UPDATE discovered_auctions SET
             state = 'CLOSED',
             winner_address = $2,
             current_height = $3,
             updated_at = NOW()
           WHERE name = $1`,
          [name, address, blockHeight]
        );
        break;
      }

      case COVENANT.REVOKE: {
        await query(
          `UPDATE discovered_auctions SET
             state = 'REVOKE',
             current_height = $2,
             updated_at = NOW()
           WHERE name = $1`,
          [name, blockHeight]
        );
        await this._updateNameStatus(name, type, blockHeight, value, address);
        break;
      }

      case COVENANT.UPDATE:
      case COVENANT.RENEW: {
        // Update current_height but don't change state
        await query(
          `UPDATE discovered_auctions SET
             current_height = $2,
             updated_at = NOW()
           WHERE name = $1`,
          [name, blockHeight]
        );
        await this._updateNameStatus(name, type, blockHeight, value, address);
        break;
      }
    }
  }

  async _updateCheckpoint(height) {
    await query(
      `INSERT INTO block_scan_checkpoint (id, last_processed_height, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         last_processed_height = $1,
         updated_at = NOW()`,
      [height]
    );
  }

  /**
   * Recalculate auction states based on current chain height.
   * Called periodically to transition OPENING → BIDDING → REVEAL → expired.
   */
  async recalculateStates() {
    try {
      const info = await hnsService.nodeClient.getInfo();
      const height = info.chain?.height;
      if (!height) return;

      // OPENING → BIDDING when past open_height + AUCTION_OPEN_PERIOD
      await query(
        `UPDATE discovered_auctions SET state = 'BIDDING', updated_at = NOW()
         WHERE state = 'OPENING' AND open_height + $1 <= $2`,
        [AUCTION_OPEN_PERIOD, height]
      );

      // BIDDING → REVEAL when past bidding_ends_height
      await query(
        `UPDATE discovered_auctions SET state = 'REVEAL', updated_at = NOW()
         WHERE state = 'BIDDING' AND bidding_ends_height IS NOT NULL AND bidding_ends_height <= $1`,
        [height]
      );

      // REVEAL → CLOSED when past reveal_ends_height (no REGISTER covenant was seen)
      await query(
        `UPDATE discovered_auctions SET state = 'CLOSED', updated_at = NOW()
         WHERE state = 'REVEAL' AND reveal_ends_height IS NOT NULL AND reveal_ends_height <= $1`,
        [height]
      );

      // Update current_height on all active auctions
      await query(
        `UPDATE discovered_auctions SET current_height = $1
         WHERE state IN ('OPENING', 'BIDDING', 'REVEAL')`,
        [height]
      );
    } catch (err) {
      log.warn({ err: err.message }, 'Failed to recalculate auction states');
    }
  }

  /**
   * Update hns_name_status table for REGISTER/RENEW/UPDATE covenants.
   * This data powers the expiring domains endpoint without per-name hsd RPC calls.
   */
  async _updateNameStatus(name, type, blockHeight, value, address) {
    const NAME_EXPIRY_BLOCKS = 105120;  // ~2 years
    const GRACE_PERIOD_BLOCKS = 4320;   // ~30 days

    try {
      if (type === COVENANT.REGISTER || type === COVENANT.RENEW || type === COVENANT.UPDATE) {
        const renewalBlock = blockHeight;
        const expiryBlock = renewalBlock + NAME_EXPIRY_BLOCKS;
        const graceEndsBlock = expiryBlock + GRACE_PERIOD_BLOCKS;

        await query(
          `INSERT INTO hns_name_status (name, state, renewal_block, expiry_block, grace_ends_block, owner_hash, value_locked, updated_at)
           VALUES ($1, 'CLOSED', $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (name) DO UPDATE SET
             state = CASE WHEN EXCLUDED.renewal_block >= hns_name_status.renewal_block THEN 'CLOSED' ELSE hns_name_status.state END,
             renewal_block = GREATEST(EXCLUDED.renewal_block, hns_name_status.renewal_block),
             expiry_block = CASE WHEN EXCLUDED.renewal_block >= hns_name_status.renewal_block THEN EXCLUDED.expiry_block ELSE hns_name_status.expiry_block END,
             grace_ends_block = CASE WHEN EXCLUDED.renewal_block >= hns_name_status.renewal_block THEN EXCLUDED.grace_ends_block ELSE hns_name_status.grace_ends_block END,
             owner_hash = COALESCE(EXCLUDED.owner_hash, hns_name_status.owner_hash),
             value_locked = CASE WHEN EXCLUDED.value_locked > 0 THEN EXCLUDED.value_locked ELSE hns_name_status.value_locked END,
             updated_at = NOW()`,
          [name, renewalBlock, expiryBlock, graceEndsBlock, address, value]
        );
      } else if (type === COVENANT.TRANSFER || type === COVENANT.REVOKE) {
        await query(
          `INSERT INTO hns_name_status (name, state, renewal_block, expiry_block, grace_ends_block, updated_at)
           VALUES ($1, $2, 0, 0, 0, NOW())
           ON CONFLICT (name) DO UPDATE SET
             state = $2,
             updated_at = NOW()`,
          [name, COVENANT_NAMES[type]]
        );
      }
    } catch (err) {
      // Best-effort — don't break block scanning
      log.warn({ err: err.message, name }, 'Failed to update name status cache');
    }
  }
}

const auctionScanner = new AuctionScanner();
export default auctionScanner;
