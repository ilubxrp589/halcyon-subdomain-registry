import { Router } from 'express';
import auth from '../middleware/auth.js';
import hnsService from '../services/hns.js';
import { hnsWalletService, walletIdFromFlare } from '../services/hnsWallet.js';
import { query } from '../db/index.js';
import { loggers } from '../utils/logger.js';
import cache from '../services/cache.js';

const log = loggers.api;
const router = Router();

// ============================================================
//  DISCOVERY — Browse & search active auctions
// ============================================================

/**
 * GET /active
 * Paginated active auctions with filtering and sorting.
 * Query: ?state=BIDDING&sort=ending-soon&page=1&limit=20&q=crypto
 */
router.get('/active', async (req, res) => {
  try {
    const {
      state,
      sort = 'ending-soon',
      page = 1,
      limit = 20,
      q,
      contested,
      minLength,
      maxLength,
      minBid,
      maxBid,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // Only show auction-phase states by default
    // "ENDING" is a virtual state: BIDDING or REVEAL auctions ending within ~1 hour (6 blocks)
    const ENDING_THRESHOLD = 6; // blocks (~1 hour)
    if (state && state.toUpperCase() === 'ENDING') {
      conditions.push(`state IN ('BIDDING', 'REVEAL')`);
      conditions.push(`(
        (state = 'BIDDING' AND bidding_ends_height IS NOT NULL AND bidding_ends_height - current_height <= ${ENDING_THRESHOLD})
        OR
        (state = 'REVEAL' AND reveal_ends_height IS NOT NULL AND reveal_ends_height - current_height <= ${ENDING_THRESHOLD})
      )`);
    } else if (state && state.toUpperCase() === 'BIDDING') {
      // Exclude auctions that qualify as ENDING so tabs are mutually exclusive
      conditions.push(`state = 'BIDDING'`);
      conditions.push(`(bidding_ends_height IS NULL OR bidding_ends_height - current_height > ${ENDING_THRESHOLD})`);
    } else if (state && state.toUpperCase() === 'REVEAL') {
      conditions.push(`state = 'REVEAL'`);
      conditions.push(`(reveal_ends_height IS NULL OR reveal_ends_height - current_height > ${ENDING_THRESHOLD})`);
    } else if (state) {
      conditions.push(`state = $${paramIdx++}`);
      params.push(state.toUpperCase());
    } else {
      conditions.push(`state IN ('OPENING', 'BIDDING', 'REVEAL')`);
    }

    // Filter out zero-bid expired re-auctions by default
    // Pass contested=false to see all auctions including uncontested ones
    // Always allow OPENING auctions through (they have 0 bids by definition)
    if (contested !== 'false') {
      conditions.push(`(bid_count > 0 OR state = 'OPENING')`);
    }

    // Name search
    if (q && q.trim()) {
      conditions.push(`name ILIKE $${paramIdx++}`);
      params.push(`%${q.trim()}%`);
    }

    // Advanced filters — name length
    if (minLength && parseInt(minLength) > 0) {
      conditions.push(`LENGTH(name) >= $${paramIdx++}`);
      params.push(parseInt(minLength));
    }
    if (maxLength && parseInt(maxLength) > 0) {
      conditions.push(`LENGTH(name) <= $${paramIdx++}`);
      params.push(parseInt(maxLength));
    }

    // Advanced filters — bid value (stored as integer, divide by 1e6 for HNS)
    if (minBid && parseFloat(minBid) > 0) {
      conditions.push(`highest_lockup >= $${paramIdx++}`);
      params.push(Math.round(parseFloat(minBid) * 1e6));
    }
    if (maxBid && parseFloat(maxBid) > 0) {
      conditions.push(`highest_lockup <= $${paramIdx++}`);
      params.push(Math.round(parseFloat(maxBid) * 1e6));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort
    let orderBy;
    switch (sort) {
      case 'ending-soon':
        orderBy = `COALESCE(
          CASE WHEN state = 'BIDDING' THEN bidding_ends_height
               WHEN state = 'REVEAL' THEN reveal_ends_height
               ELSE open_height + 37
          END, 999999999) ASC`;
        break;
      case 'most-bids':
        orderBy = 'bid_count DESC, updated_at DESC';
        break;
      case 'highest-value':
        orderBy = 'highest_lockup DESC, updated_at DESC';
        break;
      case 'newest':
      default:
        orderBy = 'open_height DESC, first_seen_at DESC';
        break;
    }

    // Count
    const countResult = await query(
      `SELECT count(*) as total FROM discovered_auctions ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Fetch
    const result = await query(
      `SELECT * FROM discovered_auctions ${where}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limitNum, offset]
    );

    res.json({
      auctions: result.rows.map(formatAuction),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    log.error({ err }, 'Failed to get active auctions');
    res.status(500).json({ error: 'Failed to get active auctions' });
  }
});

/**
 * GET /trending
 * Top auctions by bid count, limited to those with recent activity.
 */
router.get('/trending', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await query(
      `SELECT * FROM discovered_auctions
       WHERE state IN ('OPENING', 'BIDDING', 'REVEAL')
         AND bid_count > 0
       ORDER BY bid_count DESC, highest_lockup DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ auctions: result.rows.map(formatAuction) });
  } catch (err) {
    log.error({ err }, 'Failed to get trending auctions');
    res.status(500).json({ error: 'Failed to get trending auctions' });
  }
});

/**
 * GET /recent-opens
 * Names recently opened for auction.
 */
router.get('/recent-opens', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await query(
      `SELECT * FROM discovered_auctions
       WHERE state IN ('OPENING', 'BIDDING')
       ORDER BY first_seen_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ auctions: result.rows.map(formatAuction) });
  } catch (err) {
    log.error({ err }, 'Failed to get recent opens');
    res.status(500).json({ error: 'Failed to get recent opens' });
  }
});

/**
 * GET /recent-sales
 * Names that recently transitioned to CLOSED (auction completed).
 */
router.get('/recent-sales', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await query(
      `SELECT * FROM discovered_auctions
       WHERE state = 'CLOSED' AND winner_address IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ auctions: result.rows.map(formatAuction) });
  } catch (err) {
    log.error({ err }, 'Failed to get recent sales');
    res.status(500).json({ error: 'Failed to get recent sales' });
  }
});

// ============================================================
//  STATS — Aggregate dashboard numbers
// ============================================================

/**
 * GET /stats
 * Aggregate stats for the auction house header.
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        count(*) FILTER (WHERE state IN ('OPENING', 'BIDDING', 'REVEAL')) AS active_count,
        count(*) FILTER (WHERE state IN ('OPENING', 'BIDDING') AND first_seen_at > NOW() - INTERVAL '24 hours') AS opens_24h,
        COALESCE(sum(bid_count) FILTER (WHERE state IN ('OPENING', 'BIDDING', 'REVEAL')), 0) AS total_bids,
        count(*) FILTER (WHERE state = 'CLOSED') AS closed_count
      FROM discovered_auctions
    `);

    const listingsResult = await query(
      `SELECT count(*) as listing_count FROM hns_marketplace_listings WHERE status = 'active'`
    );

    const row = result.rows[0];
    res.json({
      activeCount: parseInt(row.active_count) || 0,
      opens24h: parseInt(row.opens_24h) || 0,
      totalBids: parseInt(row.total_bids) || 0,
      closedCount: parseInt(row.closed_count) || 0,
      listingCount: parseInt(listingsResult.rows[0].listing_count) || 0,
    });
  } catch (err) {
    log.error({ err }, 'Failed to get auction stats');
    res.status(500).json({ error: 'Failed to get auction stats' });
  }
});

// ============================================================
//  NAME DETAIL — Full info for a specific name
// ============================================================

/**
 * GET /name/:name
 * Full detail page data: auction state + bid history + DNS records + marketplace listing.
 */
router.get('/name/:name', async (req, res) => {
  try {
    const name = req.params.name.toLowerCase().trim();
    if (!name || name.length > 63) {
      return res.status(400).json({ error: 'Invalid name' });
    }

    // Parallel: DB auction data + hsd name info + DNS records + marketplace listing
    const [auctionResult, nameInfo, resource, listingResult, bidsResult] = await Promise.all([
      query('SELECT * FROM discovered_auctions WHERE name = $1', [name]),
      hnsService.getNameInfo(name),
      hnsService.getNameResource(name),
      query('SELECT * FROM hns_marketplace_listings WHERE name = $1 AND status = $2', [name, 'active']),
      query(
        'SELECT * FROM auction_bids WHERE name = $1 ORDER BY block_height DESC, id DESC LIMIT 50',
        [name]
      ),
    ]);

    const auction = auctionResult.rows[0] || null;
    const listing = listingResult.rows[0] || null;

    // If we have nothing from DB, try to get live state from hsd
    let liveState = null;
    if (nameInfo.success && nameInfo.data?.info) {
      const info = nameInfo.data.info;
      liveState = {
        state: info.state,
        height: info.height,
        renewal: info.renewal,
        transfer: info.transfer,
        revoked: info.revoked,
        claimed: info.claimed,
        weak: info.weak,
        stats: info.stats,
      };
    }

    res.json({
      name,
      auction: auction ? formatAuction(auction) : null,
      liveState,
      records: resource.success ? resource.data?.records || [] : [],
      listing: listing ? formatListing(listing) : null,
      bids: bidsResult.rows.map(formatBid),
    });
  } catch (err) {
    log.error({ err, name: req.params.name }, 'Failed to get name detail');
    res.status(500).json({ error: 'Failed to get name detail' });
  }
});

/**
 * GET /name/:name/bids
 * Bid history for a specific name.
 */
router.get('/name/:name/bids', async (req, res) => {
  try {
    const name = req.params.name.toLowerCase().trim();
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    const result = await query(
      `SELECT * FROM auction_bids WHERE name = $1
       ORDER BY block_height DESC, id DESC
       LIMIT $2`,
      [name, limit]
    );

    res.json({ bids: result.rows.map(formatBid) });
  } catch (err) {
    log.error({ err }, 'Failed to get bid history');
    res.status(500).json({ error: 'Failed to get bid history' });
  }
});

// ============================================================
//  MARKETPLACE — Browse listings (read-only, no auth)
// ============================================================

/**
 * GET /marketplace
 * Browse marketplace: manual HSR listings + owned names from discovered_auctions.
 * Query: ?sort=price-low&page=1&limit=20&q=crypto&source=all|listed|owned
 */
router.get('/marketplace', async (req, res) => {
  try {
    const {
      sort = 'newest',
      page = 1,
      limit = 20,
      q,
      minLength,
      maxLength,
      minPrice,
      maxPrice,
      source = 'all',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const searchPattern = q && q.trim() ? `%${q.trim()}%` : null;
    const minLen = minLength && parseInt(minLength) > 0 ? parseInt(minLength) : null;
    const maxLen = maxLength && parseInt(maxLength) > 0 ? parseInt(maxLength) : null;
    const minP = minPrice && parseFloat(minPrice) > 0 ? parseFloat(minPrice) : null;
    const maxP = maxPrice && parseFloat(maxPrice) > 0 ? parseFloat(maxPrice) : null;

    // Sort mapping
    let orderClause;
    switch (sort) {
      case 'price-low':
        orderClause = 'price_hns ASC NULLS LAST';
        break;
      case 'price-high':
        orderClause = 'price_hns DESC NULLS LAST';
        break;
      case 'name-asc':
        orderClause = 'name ASC';
        break;
      case 'name-desc':
        orderClause = 'name DESC';
        break;
      case 'newest':
      default:
        orderClause = 'listed_at DESC';
        break;
    }

    // Build conditions for owned names (discovered_auctions)
    const ownedConditions = ["da.state = 'CLOSED'"];
    const listedConditions = ["status = 'active'"];
    const ownedParams = [];
    const listedParams = [];

    if (searchPattern) {
      ownedConditions.push(`da.name ILIKE $${ownedParams.length + 1}`);
      ownedParams.push(searchPattern);
      listedConditions.push(`(name ILIKE $${listedParams.length + 1} OR description ILIKE $${listedParams.length + 1})`);
      listedParams.push(searchPattern);
    }
    if (minLen) {
      ownedConditions.push(`LENGTH(da.name) >= ${minLen}`);
      listedConditions.push(`LENGTH(name) >= ${minLen}`);
    }
    if (maxLen) {
      ownedConditions.push(`LENGTH(da.name) <= ${maxLen}`);
      listedConditions.push(`LENGTH(name) <= ${maxLen}`);
    }
    if (minP) {
      listedConditions.push(`price_hns >= ${minP}`);
    }
    if (maxP) {
      listedConditions.push(`price_hns <= ${maxP}`);
    }

    // Count query — sum both sources
    let total = 0;

    if (source !== 'owned') {
      const listedCount = await query(
        `SELECT count(*) as cnt FROM hns_marketplace_listings WHERE ${listedConditions.join(' AND ')}`,
        listedParams
      );
      total += parseInt(listedCount.rows[0].cnt);
    }

    if (source !== 'listed') {
      const ownedCount = await query(
        `SELECT count(*) as cnt FROM discovered_auctions da
         WHERE ${ownedConditions.join(' AND ')}
         AND NOT EXISTS (SELECT 1 FROM hns_marketplace_listings ml WHERE ml.name = da.name AND ml.status = 'active')`,
        ownedParams
      );
      total += parseInt(ownedCount.rows[0].cnt);
    }

    // Data query — build parts then UNION
    const parts = [];
    const allParams = [];
    let paramOffset = 0;

    if (source !== 'owned') {
      const reindexed = listedConditions.map(c =>
        c.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + paramOffset}`)
      );
      parts.push(`
        SELECT id, name, seller_flare_address, price_hns, description, status,
               buyer_flare_address, transfer_tx_hash, listed_at, sold_at, 'listed'::text as source
        FROM hns_marketplace_listings
        WHERE ${reindexed.join(' AND ')}
      `);
      allParams.push(...listedParams);
      paramOffset = allParams.length;
    }

    if (source !== 'listed') {
      const reindexed = ownedConditions.map(c =>
        c.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + paramOffset}`)
      );
      parts.push(`
        SELECT da.id, da.name, da.winner_address as seller_flare_address,
               COALESCE(da.highest_reveal::numeric / 1e6, 0) as price_hns,
               da.state || ' - ' || da.bid_count || ' bids' as description,
               'owned'::varchar as status,
               NULL::varchar as buyer_flare_address, NULL::varchar as transfer_tx_hash,
               da.updated_at as listed_at, NULL::timestamptz as sold_at,
               'owned'::text as source
        FROM discovered_auctions da
        WHERE ${reindexed.join(' AND ')}
        AND NOT EXISTS (SELECT 1 FROM hns_marketplace_listings ml WHERE ml.name = da.name AND ml.status = 'active')
      `);
      allParams.push(...ownedParams);
      paramOffset = allParams.length;
    }

    if (parts.length === 0) {
      return res.json({ listings: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 } });
    }

    const limitIdx = paramOffset + 1;
    const offsetIdx = paramOffset + 2;
    allParams.push(limitNum, offset);

    const unionSQL = `(${parts.join(' UNION ALL ')}) ORDER BY ${orderClause} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    const result = await query(unionSQL, allParams);

    const listings = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      sellerAddress: row.seller_flare_address || '',
      priceHns: row.price_hns ? parseFloat(row.price_hns) : 0,
      description: row.description,
      status: row.status,
      buyerAddress: row.buyer_flare_address || null,
      transferTxHash: row.transfer_tx_hash || null,
      listedAt: row.listed_at,
      soldAt: row.sold_at || null,
      source: row.source || 'listed',
    }));

    res.json({
      listings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    log.error({ err }, 'Failed to get marketplace listings');
    res.status(500).json({ error: 'Failed to get marketplace listings' });
  }
});

/**
 * GET /marketplace/sales
 * Recent completed marketplace sales.
 */
router.get('/marketplace/sales', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

    const result = await query(
      `SELECT * FROM hns_marketplace_listings
       WHERE status = 'sold'
       ORDER BY sold_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ sales: result.rows.map(formatListing) });
  } catch (err) {
    log.error({ err }, 'Failed to get marketplace sales');
    res.status(500).json({ error: 'Failed to get marketplace sales' });
  }
});

// ============================================================
//  MARKETPLACE WRITE — Authenticated (list/buy/delist/update)
// ============================================================

/**
 * POST /marketplace/list
 * List an owned HNS name for sale.
 * Escrow-at-list-time: name is immediately transferred to the platform escrow wallet.
 * Listing becomes 'active' after the escrow transfer is finalized (~288 blocks / ~2 days).
 * Body: { wallet, signature, nonce, name, priceHns, description? }
 */
router.post('/marketplace/list', auth.verifyWallet, async (req, res) => {
  try {
    const { name, priceHns, description, signature } = req.body;
    const seller = req.authenticatedWallet;

    // Validate inputs
    if (!name || typeof name !== 'string' || name.length > 63) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    const price = parseFloat(priceHns);
    if (!price || price <= 0 || price > 1e12) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    // Verify seller owns the name
    const ownedResult = await hnsWalletService.getOwnedNames(seller);
    if (!ownedResult.success) {
      return res.status(500).json({ error: 'Failed to verify name ownership' });
    }
    const ownsName = ownedResult.names.some(
      n => n.name.toLowerCase() === name.toLowerCase()
    );
    if (!ownsName) {
      return res.status(403).json({ error: 'You do not own this name' });
    }

    // Check no active/pending listing already exists for this name
    const existing = await query(
      `SELECT id FROM hns_marketplace_listings WHERE name = $1 AND status IN ('active', 'pending')`,
      [name.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Name is already listed or pending escrow' });
    }

    // Initiate escrow: transfer name from seller → platform escrow wallet
    const escrowResult = await hnsWalletService.transferToEscrow(seller, name.toLowerCase(), signature);
    if (!escrowResult.success) {
      return res.status(500).json({ error: `Escrow transfer failed: ${escrowResult.error}` });
    }

    // Get current block height for escrow timing
    const nodeInfo = await hnsService.getInfo().catch(() => null);
    const currentHeight = nodeInfo?.data?.chain?.height || 0;

    // Create listing in pending state — becomes active after escrow finalizes
    const result = await query(
      `INSERT INTO hns_marketplace_listings
         (name, seller_flare_address, price_hns, description, status, escrow_status, escrow_transfer_tx, escrow_block_height, listed_at)
       VALUES ($1, $2, $3, $4, 'pending', 'transferring', $5, $6, NOW())
       RETURNING id`,
      [name.toLowerCase(), seller.toLowerCase(), price, description || null, escrowResult.txHash, currentHeight]
    );
    const listingId = result.rows[0].id;

    // Log activity
    await query(
      `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, price_hns, created_at)
       VALUES ('listed', $1, $2, $3, $4, NOW())`,
      [name.toLowerCase(), listingId, seller.toLowerCase(), price]
    );

    log.info({ listingId, name, seller: seller.slice(0, 10), price, escrowTx: escrowResult.txHash }, 'Name listed — escrow transfer initiated');
    res.json({
      success: true,
      listingId,
      escrowTxHash: escrowResult.txHash,
      note: 'Name is being transferred to escrow. Listing will become active after ~2 days (288 blocks).',
    });
  } catch (err) {
    log.error({ err }, 'Failed to list name');
    res.status(500).json({ error: 'Failed to list name for sale' });
  }
});

/**
 * POST /marketplace/buy
 * Buy a listed HNS name from escrow. Name is already in the platform escrow wallet.
 * Body: { wallet, signature, nonce, listingId }
 *
 * Flow:
 *   1. Atomically mark listing as 'processing' (prevents double-buy race condition)
 *   2. Buyer sends HNS payment to seller
 *   3. Platform releases name from escrow to buyer
 *   4. Background job finalizes the transfer after ~288 blocks
 */
router.post('/marketplace/buy', auth.verifyWallet, async (req, res) => {
  try {
    const { listingId, signature } = req.body;
    const buyer = req.authenticatedWallet;

    if (!listingId) {
      return res.status(400).json({ error: 'Missing listingId' });
    }

    // Atomically mark listing as processing — prevents double-buy race condition
    // Only succeeds if listing is active AND escrowed
    const updateResult = await query(
      `UPDATE hns_marketplace_listings
       SET status = 'processing'
       WHERE id = $1 AND status = 'active' AND escrow_status = 'escrowed'
       RETURNING *`,
      [listingId]
    );
    if (updateResult.rowCount === 0) {
      return res.status(409).json({ error: 'Listing not found, no longer active, or not yet escrowed' });
    }
    const listing = updateResult.rows[0];

    // Can't buy your own listing
    if (listing.seller_flare_address.toLowerCase() === buyer.toLowerCase()) {
      await query(`UPDATE hns_marketplace_listings SET status = 'active' WHERE id = $1`, [listingId]);
      return res.status(400).json({ error: 'Cannot buy your own listing' });
    }

    // Verify buyer has enough HNS balance
    const buyerInfo = await hnsWalletService.getWalletInfo(buyer);
    if (!buyerInfo.success) {
      await query(`UPDATE hns_marketplace_listings SET status = 'active' WHERE id = $1`, [listingId]);
      return res.status(500).json({ error: 'Failed to check buyer balance' });
    }
    const price = parseFloat(listing.price_hns);
    if ((buyerInfo.balance?.confirmed || 0) < price) {
      await query(`UPDATE hns_marketplace_listings SET status = 'active' WHERE id = $1`, [listingId]);
      return res.status(400).json({
        error: 'Insufficient HNS balance',
        required: price,
        available: buyerInfo.balance?.confirmed || 0,
      });
    }

    // Step 1: Send HNS from buyer to seller
    const sellerReceive = await hnsWalletService.getReceiveAddress(listing.seller_flare_address);
    if (!sellerReceive.success || !sellerReceive.address) {
      await query(`UPDATE hns_marketplace_listings SET status = 'active' WHERE id = $1`, [listingId]);
      return res.status(500).json({ error: 'Failed to get seller receive address' });
    }

    const paymentResult = await hnsWalletService.sendHns(buyer, sellerReceive.address, price, signature);
    if (!paymentResult.success) {
      await query(`UPDATE hns_marketplace_listings SET status = 'active' WHERE id = $1`, [listingId]);
      return res.status(500).json({ error: `Payment failed: ${paymentResult.error}` });
    }

    // Step 2: Release name from escrow to buyer
    const buyerReceive = await hnsWalletService.getReceiveAddress(buyer);
    if (!buyerReceive.success || !buyerReceive.address) {
      log.error({ listingId, buyer, paymentTx: paymentResult.txHash }, 'Buy: payment succeeded but buyer address lookup failed');
      // Payment sent — can't easily reverse. Mark as sold_pending_transfer.
      await query(
        `UPDATE hns_marketplace_listings SET status = 'sold_pending_transfer', buyer_flare_address = $1, transfer_tx_hash = $2, sold_at = NOW() WHERE id = $3`,
        [buyer.toLowerCase(), paymentResult.txHash, listingId]
      );
      return res.status(500).json({ error: 'Failed to get buyer receive address. Payment was sent — contact support.' });
    }

    const releaseResult = await hnsWalletService.releaseFromEscrow(listing.name, buyerReceive.address);

    // Get current block height for escrow timing
    const nodeInfo = await hnsService.getInfo().catch(() => null);
    const currentHeight = nodeInfo?.data?.chain?.height || 0;

    const transferTx = releaseResult?.success ? releaseResult.txHash : null;
    const escrowStatus = transferTx ? 'releasing' : 'escrowed';
    const saleStatus = transferTx ? 'sold' : 'sold_pending_transfer';

    // Update listing
    await query(
      `UPDATE hns_marketplace_listings SET
         status = $1,
         escrow_status = $2,
         buyer_flare_address = $3,
         transfer_tx_hash = $4,
         escrow_block_height = $5,
         sold_at = NOW()
       WHERE id = $6`,
      [saleStatus, escrowStatus, buyer.toLowerCase(), transferTx || paymentResult.txHash, currentHeight, listingId]
    );

    // Log activity
    await query(
      `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, price_hns, created_at)
       VALUES ('sold', $1, $2, $3, $4, NOW())`,
      [listing.name, listingId, buyer.toLowerCase(), price]
    );

    log.info({
      listingId,
      name: listing.name,
      buyer: buyer.slice(0, 10),
      seller: listing.seller_flare_address.slice(0, 10),
      price,
      paymentTx: paymentResult.txHash,
      transferTx,
    }, 'Marketplace sale completed');

    res.json({
      success: true,
      paymentTxHash: paymentResult.txHash,
      transferTxHash: transferTx,
      note: transferTx
        ? 'Payment sent and name release from escrow initiated. Name will arrive in ~2 days.'
        : 'Payment sent. Name transfer pending — contact support if not received.',
    });
  } catch (err) {
    log.error({ err }, 'Marketplace buy failed');
    res.status(500).json({ error: 'Failed to complete purchase' });
  }
});

/**
 * POST /marketplace/delist
 * Cancel an active listing. Only the seller can delist.
 * If name is escrowed, initiates a reverse transfer back to seller (~2 days).
 * If name is still transferring to escrow, cancels immediately.
 * Body: { wallet, signature, nonce, listingId }
 */
router.post('/marketplace/delist', auth.verifyWallet, async (req, res) => {
  try {
    const { listingId } = req.body;
    const seller = req.authenticatedWallet;

    if (!listingId) {
      return res.status(400).json({ error: 'Missing listingId' });
    }

    // Verify listing exists and belongs to this seller
    const listingResult = await query(
      `SELECT * FROM hns_marketplace_listings WHERE id = $1 AND status IN ('active', 'pending')`,
      [listingId]
    );
    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found or no longer active' });
    }

    const listing = listingResult.rows[0];
    if (listing.seller_flare_address.toLowerCase() !== seller.toLowerCase()) {
      return res.status(403).json({ error: 'Only the seller can delist' });
    }

    // Handle based on escrow state
    if (listing.escrow_status === 'escrowed') {
      // Name is in escrow — need to reverse-transfer it back to seller
      const returnResult = await hnsWalletService.returnFromEscrow(listing.name, seller);

      if (!returnResult.success) {
        return res.status(500).json({ error: `Failed to initiate escrow return: ${returnResult.error}` });
      }

      // Get current block height for escrow timing
      const nodeInfo = await hnsService.getInfo().catch(() => null);
      const currentHeight = nodeInfo?.data?.chain?.height || 0;

      await query(
        `UPDATE hns_marketplace_listings
         SET status = 'delisting', escrow_status = 'returning', escrow_transfer_tx = $1, escrow_block_height = $2
         WHERE id = $3`,
        [returnResult.txHash, currentHeight, listingId]
      );

      // Log activity
      await query(
        `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, created_at)
         VALUES ('delisting', $1, $2, $3, NOW())`,
        [listing.name, listingId, seller.toLowerCase()]
      );

      log.info({ listingId, name: listing.name, seller: seller.slice(0, 10), returnTx: returnResult.txHash }, 'Delist initiated — returning name from escrow');
      res.json({
        success: true,
        note: 'Name is being returned from escrow. It will arrive back in ~2 days (288 blocks).',
        returnTxHash: returnResult.txHash,
      });
    } else if (listing.escrow_status === 'transferring' || listing.escrow_status === 'none') {
      // Name is still transferring to escrow or was never escrowed — cancel immediately
      await query(
        `UPDATE hns_marketplace_listings SET status = 'cancelled', escrow_status = 'cancelled' WHERE id = $1`,
        [listingId]
      );

      await query(
        `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, created_at)
         VALUES ('cancelled', $1, $2, $3, NOW())`,
        [listing.name, listingId, seller.toLowerCase()]
      );

      log.info({ listingId, name: listing.name, seller: seller.slice(0, 10) }, 'Listing cancelled');
      res.json({ success: true });
    } else {
      return res.status(400).json({ error: `Cannot delist in current escrow state: ${listing.escrow_status}` });
    }
  } catch (err) {
    log.error({ err }, 'Failed to delist');
    res.status(500).json({ error: 'Failed to cancel listing' });
  }
});

/**
 * POST /marketplace/update-price
 * Change the price on an active listing. Only the seller can update.
 * Body: { wallet, signature, nonce, listingId, newPriceHns }
 */
router.post('/marketplace/update-price', auth.verifyWallet, async (req, res) => {
  try {
    const { listingId, newPriceHns } = req.body;
    const seller = req.authenticatedWallet;

    if (!listingId) {
      return res.status(400).json({ error: 'Missing listingId' });
    }
    const newPrice = parseFloat(newPriceHns);
    if (!newPrice || newPrice <= 0 || newPrice > 1e12) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    // Verify listing exists and belongs to this seller
    const listingResult = await query(
      `SELECT * FROM hns_marketplace_listings WHERE id = $1 AND status = 'active'`,
      [listingId]
    );
    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found or no longer active' });
    }

    const listing = listingResult.rows[0];
    if (listing.seller_flare_address.toLowerCase() !== seller.toLowerCase()) {
      return res.status(403).json({ error: 'Only the seller can update price' });
    }

    const oldPrice = parseFloat(listing.price_hns);

    // Update price
    await query(
      `UPDATE hns_marketplace_listings SET price_hns = $1 WHERE id = $2`,
      [newPrice, listingId]
    );

    // Log activity
    await query(
      `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, price_hns, created_at)
       VALUES ('price_changed', $1, $2, $3, $4, NOW())`,
      [listing.name, listingId, seller.toLowerCase(), newPrice]
    );

    log.info({ listingId, name: listing.name, oldPrice, newPrice }, 'Listing price updated');
    res.json({ success: true, oldPrice, newPrice });
  } catch (err) {
    log.error({ err }, 'Failed to update price');
    res.status(500).json({ error: 'Failed to update listing price' });
  }
});

// ============================================================
//  ANALYTICS — Charts & aggregate data for the analytics tab
// ============================================================

/**
 * GET /analytics/overview
 * Activity timeline, state distribution, top contested, bid value distribution, KPIs.
 */
router.get('/analytics/overview', async (req, res) => {
  try {
    const cached = cache.get('analytics:overview');
    if (cached) return res.json(cached);

    const [activityRes, statesRes, contestedRes, bucketsRes, kpisRes] = await Promise.all([
      // 1. Activity Over Time (30 days)
      query(`
        WITH days AS (
          SELECT generate_series(
            (CURRENT_DATE - INTERVAL '29 days')::date,
            CURRENT_DATE::date,
            '1 day'::interval
          )::date AS day
        )
        SELECT
          d.day::text AS date,
          COALESCE(opens.cnt, 0) AS opens,
          COALESCE(bids.cnt, 0) AS bids,
          COALESCE(closes.cnt, 0) AS closes
        FROM days d
        LEFT JOIN (
          SELECT first_seen_at::date AS day, COUNT(*) AS cnt
          FROM discovered_auctions
          WHERE first_seen_at >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY 1
        ) opens ON opens.day = d.day
        LEFT JOIN (
          SELECT created_at::date AS day, COUNT(*) AS cnt
          FROM auction_bids
          WHERE covenant_type = 'BID' AND created_at >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY 1
        ) bids ON bids.day = d.day
        LEFT JOIN (
          SELECT updated_at::date AS day, COUNT(*) AS cnt
          FROM discovered_auctions
          WHERE state = 'CLOSED' AND updated_at >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY 1
        ) closes ON closes.day = d.day
        ORDER BY d.day
      `),

      // 2. State Distribution
      query(`SELECT state, COUNT(*) AS count FROM discovered_auctions GROUP BY state ORDER BY count DESC`),

      // 3. Top 10 Contested (active auctions only)
      query(`
        SELECT name, state, bid_count, highest_lockup, reveal_count
        FROM discovered_auctions
        WHERE bid_count > 0 AND state IN ('OPENING', 'BIDDING', 'REVEAL')
        ORDER BY bid_count DESC, highest_lockup DESC
        LIMIT 10
      `),

      // 4. Bid Value Distribution (buckets in dollarydoos → HNS)
      query(`
        SELECT
          CASE
            WHEN lockup_value < 1000000 THEN '0-1'
            WHEN lockup_value < 10000000 THEN '1-10'
            WHEN lockup_value < 100000000 THEN '10-100'
            WHEN lockup_value < 1000000000 THEN '100-1K'
            WHEN lockup_value < 10000000000 THEN '1K-10K'
            ELSE '10K+'
          END AS range,
          COUNT(*) AS count
        FROM auction_bids
        WHERE covenant_type = 'BID' AND lockup_value > 0
        GROUP BY 1
        ORDER BY MIN(lockup_value)
      `),

      // 5. KPI Cards
      query(`
        SELECT
          COALESCE(AVG(bid_count) FILTER (WHERE bid_count > 0), 0) AS avg_bids,
          COALESCE(SUM(highest_lockup), 0) AS total_lockup,
          (SELECT COUNT(DISTINCT address) FROM auction_bids WHERE covenant_type = 'BID') AS unique_bidders,
          COALESCE(AVG(highest_lockup) FILTER (WHERE bid_count > 0), 0) AS avg_lockup
        FROM discovered_auctions
      `),
    ]);

    const kpis = kpisRes.rows[0];
    const result = {
      activity: activityRes.rows.map(r => ({
        date: r.date,
        opens: parseInt(r.opens),
        bids: parseInt(r.bids),
        closes: parseInt(r.closes),
      })),
      states: statesRes.rows.map(r => ({ state: r.state, count: parseInt(r.count) })),
      topContested: contestedRes.rows.map(r => ({
        name: r.name,
        state: r.state,
        bidCount: r.bid_count,
        highestLockupHns: Number(r.highest_lockup) / 1e6,
        revealCount: r.reveal_count,
      })),
      bidValueDistribution: bucketsRes.rows.map(r => ({ range: r.range, count: parseInt(r.count) })),
      kpis: {
        avgBids: parseFloat(Number(kpis.avg_bids).toFixed(1)),
        totalLockupHns: Number(kpis.total_lockup) / 1e6,
        uniqueBidders: parseInt(kpis.unique_bidders),
        avgLockupHns: Number(kpis.avg_lockup) / 1e6,
      },
    };

    cache.set('analytics:overview', result, 60);
    res.json(result);
  } catch (err) {
    log.error({ err }, 'Failed to get analytics overview');
    res.status(500).json({ error: 'Failed to get analytics overview' });
  }
});

/**
 * GET /analytics/participants
 * Bidder leaderboard, name length vs bids, reveal rate.
 */
router.get('/analytics/participants', async (req, res) => {
  try {
    const cached = cache.get('analytics:participants');
    if (cached) return res.json(cached);

    const [leaderboardRes, lengthRes, revealRes] = await Promise.all([
      // 6. Bidder Leaderboard (top 10 by bid count)
      query(`
        SELECT
          address,
          COUNT(*) AS bid_count,
          COUNT(DISTINCT name) AS names_bid_on,
          COALESCE(SUM(lockup_value), 0) AS total_lockup
        FROM auction_bids
        WHERE covenant_type = 'BID' AND address IS NOT NULL
        GROUP BY address
        ORDER BY bid_count DESC
        LIMIT 10
      `),

      // 7. Name Length vs Bids
      query(`
        SELECT
          LENGTH(name) AS name_length,
          COUNT(*) AS auction_count,
          AVG(bid_count)::numeric(10,1) AS avg_bids,
          AVG(highest_lockup)::numeric AS avg_lockup
        FROM discovered_auctions
        WHERE bid_count > 0
        GROUP BY LENGTH(name)
        ORDER BY LENGTH(name)
      `),

      // 8. Reveal Rate
      query(`
        SELECT
          COALESCE(SUM(CASE WHEN covenant_type = 'BID' THEN 1 ELSE 0 END), 0) AS total_bids,
          COALESCE(SUM(CASE WHEN covenant_type = 'REVEAL' THEN 1 ELSE 0 END), 0) AS total_reveals
        FROM auction_bids
      `),
    ]);

    const revealRow = revealRes.rows[0];
    const totalBids = parseInt(revealRow.total_bids);
    const totalReveals = parseInt(revealRow.total_reveals);

    const result = {
      leaderboard: leaderboardRes.rows.map(r => ({
        address: r.address,
        bidCount: parseInt(r.bid_count),
        namesBidOn: parseInt(r.names_bid_on),
        totalLockupHns: Number(r.total_lockup) / 1e6,
      })),
      nameLengthVsBids: lengthRes.rows.map(r => ({
        length: parseInt(r.name_length),
        auctionCount: parseInt(r.auction_count),
        avgBids: parseFloat(r.avg_bids),
        avgLockupHns: Number(r.avg_lockup) / 1e6,
      })),
      revealRate: {
        totalBids,
        totalReveals,
        rate: totalBids > 0 ? parseFloat((totalReveals / totalBids * 100).toFixed(1)) : 0,
      },
    };

    cache.set('analytics:participants', result, 120);
    res.json(result);
  } catch (err) {
    log.error({ err }, 'Failed to get analytics participants');
    res.status(500).json({ error: 'Failed to get analytics participants' });
  }
});

/**
 * GET /analytics/marketplace
 * Marketplace price trends and conversion funnel.
 */
router.get('/analytics/marketplace', async (req, res) => {
  try {
    const cached = cache.get('analytics:marketplace');
    if (cached) return res.json(cached);

    const [trendsRes, funnelRes] = await Promise.all([
      // 9. Price Trends (30 days)
      query(`
        WITH days AS (
          SELECT generate_series(
            (CURRENT_DATE - INTERVAL '29 days')::date,
            CURRENT_DATE::date,
            '1 day'::interval
          )::date AS day
        )
        SELECT
          d.day::text AS date,
          COALESCE(AVG(l.price_hns)::numeric(18,2), 0) AS avg_price,
          COUNT(l.id) AS listing_count,
          COALESCE(AVG(s.price_hns)::numeric(18,2), 0) AS avg_sale_price,
          COUNT(s.id) AS sale_count
        FROM days d
        LEFT JOIN hns_marketplace_listings l
          ON l.listed_at::date = d.day
        LEFT JOIN hns_marketplace_listings s
          ON s.sold_at::date = d.day AND s.status = 'sold'
        GROUP BY d.day
        ORDER BY d.day
      `),

      // 10. Conversion Funnel
      query(`
        SELECT
          COUNT(*) AS total_auctions,
          COUNT(*) FILTER (WHERE bid_count > 0) AS with_bids,
          COUNT(*) FILTER (WHERE reveal_count > 0) AS with_reveals,
          COUNT(*) FILTER (WHERE state = 'CLOSED' AND winner_address IS NOT NULL) AS completed
        FROM discovered_auctions
      `),
    ]);

    const funnel = funnelRes.rows[0];
    const totalAuctions = parseInt(funnel.total_auctions) || 1;

    const result = {
      priceTrends: trendsRes.rows.map(r => ({
        date: r.date,
        avgPrice: parseFloat(r.avg_price),
        listingCount: parseInt(r.listing_count),
        avgSalePrice: parseFloat(r.avg_sale_price),
        saleCount: parseInt(r.sale_count),
      })),
      funnel: {
        totalAuctions: parseInt(funnel.total_auctions),
        withBids: parseInt(funnel.with_bids),
        withBidsRate: parseFloat((parseInt(funnel.with_bids) / totalAuctions * 100).toFixed(1)),
        withReveals: parseInt(funnel.with_reveals),
        withRevealsRate: parseFloat((parseInt(funnel.with_reveals) / totalAuctions * 100).toFixed(1)),
        completed: parseInt(funnel.completed),
        completedRate: parseFloat((parseInt(funnel.completed) / totalAuctions * 100).toFixed(1)),
      },
    };

    cache.set('analytics:marketplace', result, 120);
    res.json(result);
  } catch (err) {
    log.error({ err }, 'Failed to get analytics marketplace');
    res.status(500).json({ error: 'Failed to get analytics marketplace' });
  }
});

// ============================================================
//  FORMATTERS
// ============================================================

function formatAuction(row) {
  return {
    name: row.name,
    state: row.state,
    openHeight: row.open_height,
    bidCount: row.bid_count,
    highestLockup: row.highest_lockup,
    highestLockupHns: row.highest_lockup ? (Number(row.highest_lockup) / 1e6) : 0,
    revealCount: row.reveal_count,
    highestReveal: row.highest_reveal,
    highestRevealHns: row.highest_reveal ? (Number(row.highest_reveal) / 1e6) : 0,
    winnerAddress: row.winner_address,
    biddingEndsHeight: row.bidding_ends_height,
    revealEndsHeight: row.reveal_ends_height,
    currentHeight: row.current_height,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
  };
}

function formatBid(row) {
  return {
    id: row.id,
    name: row.name,
    txHash: row.tx_hash,
    blockHeight: row.block_height,
    covenantType: row.covenant_type,
    lockupValue: row.lockup_value,
    lockupHns: row.lockup_value ? (Number(row.lockup_value) / 1e6) : null,
    revealValue: row.reveal_value,
    revealHns: row.reveal_value ? (Number(row.reveal_value) / 1e6) : null,
    address: row.address,
    createdAt: row.created_at,
  };
}

function formatListing(row) {
  return {
    id: row.id,
    name: row.name,
    sellerAddress: row.seller_flare_address,
    priceHns: parseFloat(row.price_hns),
    description: row.description,
    status: row.status,
    buyerAddress: row.buyer_flare_address,
    transferTxHash: row.transfer_tx_hash,
    listedAt: row.listed_at,
    soldAt: row.sold_at,
  };
}

// ============================================================
//  AVAILABILITY CHECK — Query HSD for name status (ah-014)
// ============================================================

/**
 * GET /check/:name
 * Checks name availability via HSD. Returns status: available, auction, registered.
 */
router.get('/check/:name', async (req, res) => {
  try {
    const name = req.params.name.toLowerCase().trim();
    if (!name || name.length > 63 || !/^[a-z0-9_-]+$/.test(name)) {
      return res.status(400).json({ error: 'Invalid name' });
    }

    const [nameInfo, auctionRow, listingRow] = await Promise.all([
      hnsService.getNameInfo(name).catch(() => null),
      query('SELECT * FROM discovered_auctions WHERE name = $1 LIMIT 1', [name]).then(r => r.rows[0] || null).catch(() => null),
      query('SELECT * FROM hns_marketplace_listings WHERE name = $1 AND status = $2 LIMIT 1', [name, 'active']).then(r => r.rows[0] || null).catch(() => null),
    ]);

    let status = 'available';
    const result = { name, status: 'available', auction: null, listing: null, owner: null, info: null };

    if (nameInfo?.info) {
      const info = nameInfo.info;
      if (info.state === 'CLOSED' || info.state === 'LOCKED') {
        result.status = 'registered';
        result.owner = info.owner?.hash || null;
        result.info = {
          state: info.state,
          height: info.height,
          renewal: info.renewal,
          value: info.value,
          highest: info.highest,
        };
      } else if (['OPENING', 'BIDDING', 'REVEAL'].includes(info.state)) {
        result.status = 'auction';
        result.info = {
          state: info.state,
          height: info.height,
        };
      }
    }

    if (auctionRow && ['OPENING', 'BIDDING', 'REVEAL'].includes(auctionRow.state)) {
      result.status = 'auction';
      result.auction = formatAuction(auctionRow);
    }

    if (listingRow) {
      result.listing = formatListing(listingRow);
    }

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Name availability check failed');
    res.status(500).json({ error: 'Failed to check name availability' });
  }
});

// ============================================================
//  ACTIVITY HISTORY — User's transaction history (ah-010)
// ============================================================

/**
 * GET /history
 * Paginated activity history for a wallet address.
 * Query: ?address=0x...&page=1&limit=50&type=bid|listing|sale
 */
router.get('/history', async (req, res) => {
  try {
    const { address, page = 1, limit = 50, type } = req.query;
    if (!address) {
      return res.status(400).json({ error: 'Missing address parameter' });
    }

    const addr = address.toLowerCase();
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Build a UNION of all activity sources
    const parts = [];
    const params = [];
    let paramIdx = 1;

    const addrParam = paramIdx++;
    params.push(addr);

    // Bids placed
    if (!type || type === 'bid') {
      parts.push(`
        SELECT 'bid' AS event_type, name, covenant_type AS detail,
               COALESCE(lockup_value, 0) AS amount_raw,
               COALESCE(lockup_value::decimal / 1e6, 0) AS amount_hns,
               tx_hash, block_height, NULL AS listing_id,
               created_at
        FROM auction_bids WHERE LOWER(address) = $${addrParam}
      `);
    }

    // Marketplace activity (listings, sales, delistings, price changes)
    if (!type || type === 'listing' || type === 'sale') {
      parts.push(`
        SELECT event_type, name, event_type AS detail,
               COALESCE(price_hns, 0) AS amount_raw,
               COALESCE(price_hns, 0) AS amount_hns,
               NULL AS tx_hash, NULL AS block_height, listing_id,
               created_at
        FROM hns_marketplace_activity WHERE LOWER(actor_address) = $${addrParam}
        ${type === 'listing' ? "AND event_type IN ('listed', 'cancelled', 'price_changed')" : ''}
        ${type === 'sale' ? "AND event_type IN ('sold')" : ''}
      `);
    }

    if (parts.length === 0) {
      return res.json({ history: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 } });
    }

    const unionQuery = parts.join(' UNION ALL ');

    // Count total
    const countResult = await query(
      `SELECT count(*) AS total FROM (${unionQuery}) AS combined`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Fetch page
    const result = await query(
      `SELECT * FROM (${unionQuery}) AS combined
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limitNum, offset]
    );

    res.json({
      history: result.rows.map(row => ({
        eventType: row.event_type,
        name: row.name,
        detail: row.detail,
        amountHns: parseFloat(row.amount_hns) || 0,
        txHash: row.tx_hash,
        blockHeight: row.block_height,
        listingId: row.listing_id,
        createdAt: row.created_at,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    log.error({ err }, 'Failed to get activity history');
    res.status(500).json({ error: 'Failed to load activity history' });
  }
});

// ============================================================
//  EXPIRING DOMAINS — Names nearing renewal expiry (ah-008)
// ============================================================

const BLOCKS_PER_DAY = 144;         // ~10 min blocks, 144/day
const NAME_EXPIRY_BLOCKS = 105120;  // ~2 years in blocks
const GRACE_PERIOD_BLOCKS = 4320;   // ~30 days grace after expiry

/**
 * GET /expiring
 * Full expiring/expired names browser with filtering, search, and sorting.
 * Uses hns_name_status table (populated by auctionScanner) instead of per-name hsd RPC calls.
 * Query: ?page=1&limit=20&q=crypto&sort=days-left&status=expiring&maxDays=90
 * Cached for 30 minutes.
 */
router.get('/expiring', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      q,
      sort = 'days-left',
      status,       // 'expired' | 'grace' | 'expiring' | 'all' (default: all)
      maxDays,      // only show names expiring within N days
      minLength,
      maxLength,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const cacheKey = 'expiring:domains:v3';
    let expiring = cache.get(cacheKey);

    if (!expiring) {
      // Get current chain height
      const nodeInfo = await hnsService.getInfo();
      const currentHeight = nodeInfo.success ? nodeInfo.data?.chain?.height : null;
      if (!currentHeight) {
        return res.status(503).json({ error: 'Unable to determine current block height' });
      }

      // Query hns_name_status table — all data from auctionScanner, no per-name hsd calls
      const nameStatusResult = await query(
        `SELECT ns.name, ns.state, ns.renewal_block, ns.expiry_block, ns.grace_ends_block,
                ns.owner_hash, ns.value_locked, ns.highest_bid,
                da.state AS auction_state, da.bid_count, da.highest_lockup
         FROM hns_name_status ns
         LEFT JOIN discovered_auctions da ON da.name = ns.name AND da.state IN ('OPENING', 'BIDDING', 'REVEAL')
         WHERE ns.state = 'CLOSED'
           AND ns.expiry_block > 0
           AND ns.expiry_block - $1 <= $2
         ORDER BY ns.expiry_block ASC`,
        [currentHeight, 365 * BLOCKS_PER_DAY] // Within 1 year of expiry
      );

      const enriched = [];
      for (const row of nameStatusResult.rows) {
        const blocksLeft = row.expiry_block - currentHeight;
        const daysLeft = Math.round(blocksLeft * 10 / 1440);
        const graceBlocksLeft = row.grace_ends_block - currentHeight;

        let expiryStatus;
        if (blocksLeft <= 0 && graceBlocksLeft <= 0) {
          expiryStatus = 'expired';
        } else if (blocksLeft <= 0) {
          expiryStatus = 'grace';
        } else if (daysLeft <= 365) {
          expiryStatus = 'expiring';
        } else {
          continue;
        }

        const reAuction = row.auction_state ? {
          state: row.auction_state,
          bidCount: row.bid_count,
          highestLockup: Number(row.highest_lockup) / 1e6,
        } : null;

        enriched.push({
          name: row.name,
          renewal: row.renewal_block,
          expiryHeight: row.expiry_block,
          blocksLeft: Math.max(0, blocksLeft),
          daysLeft: Math.max(0, daysLeft),
          graceEndsHeight: row.grace_ends_block,
          graceDaysLeft: Math.max(0, Math.round(graceBlocksLeft * 10 / 1440)),
          status: expiryStatus,
          state: row.state,
          owner: row.owner_hash || null,
          value: row.value_locked ? Number(row.value_locked) / 1e6 : 0,
          nameLength: row.name.length,
          highestBid: row.highest_bid ? Number(row.highest_bid) / 1e6 : 0,
          reAuction,
        });
      }

      expiring = enriched;
      cache.set(cacheKey, expiring, 1800); // 30-min cache (data from scanner, not live RPC)
    }

    // Apply filters
    let filtered = [...expiring];

    // Status filter
    if (status && status !== 'all') {
      filtered = filtered.filter(d => d.status === status);
    }

    // Name search
    if (q && q.trim()) {
      const search = q.trim().toLowerCase();
      filtered = filtered.filter(d => d.name.toLowerCase().includes(search));
    }

    // Max days filter
    if (maxDays && parseInt(maxDays) > 0) {
      const max = parseInt(maxDays);
      filtered = filtered.filter(d => d.daysLeft <= max || d.status === 'expired' || d.status === 'grace');
    }

    // Name length filters
    if (minLength && parseInt(minLength) > 0) {
      filtered = filtered.filter(d => d.name.length >= parseInt(minLength));
    }
    if (maxLength && parseInt(maxLength) > 0) {
      filtered = filtered.filter(d => d.name.length <= parseInt(maxLength));
    }

    // Sort
    switch (sort) {
      case 'days-left':
        filtered.sort((a, b) => {
          const aPriority = a.status === 'expired' ? -2 : a.status === 'grace' ? -1 : 0;
          const bPriority = b.status === 'expired' ? -2 : b.status === 'grace' ? -1 : 0;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a.daysLeft - b.daysLeft;
        });
        break;
      case 'days-left-desc':
        filtered.sort((a, b) => b.daysLeft - a.daysLeft);
        break;
      case 'name-asc':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'value':
        filtered.sort((a, b) => b.value - a.value);
        break;
      case 'length':
        filtered.sort((a, b) => a.name.length - b.name.length);
        break;
      default:
        filtered.sort((a, b) => a.daysLeft - b.daysLeft);
    }

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limitNum);

    // Stats
    const stats = {
      total: expiring.length,
      expired: expiring.filter(d => d.status === 'expired').length,
      grace: expiring.filter(d => d.status === 'grace').length,
      expiring: expiring.filter(d => d.status === 'expiring').length,
      withReAuction: expiring.filter(d => d.reAuction).length,
    };

    res.json({
      names: paged,
      stats,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    log.error({ err }, 'Failed to get expiring domains');
    res.status(500).json({ error: 'Failed to get expiring domains' });
  }
});

// ============================================================
//  OFFER SYSTEM — Make/accept/cancel offers on names (ah-009)
// ============================================================

// Tables now created via migrate.js (auc-007, auc-008)

/**
 * POST /marketplace/offer
 * Create a binding offer on a name with HNS pre-lock.
 * Offerer's HNS is sent to the escrow wallet and held until accept/reject/cancel/expire.
 * Body: { wallet, signature, nonce, name, listingId?, offerHns, expiresInHours? }
 */
router.post('/marketplace/offer', auth.verifyWallet, async (req, res) => {
  try {
    const { name, listingId, offerHns, expiresInHours = 48, signature } = req.body;
    const offerer = req.authenticatedWallet;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Missing name' });
    }
    const amount = parseFloat(offerHns);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid offer amount' });
    }

    const hours = Math.min(168, Math.max(1, parseInt(expiresInHours) || 48));

    // If listing provided, verify it exists and isn't own listing
    if (listingId) {
      const listing = await query('SELECT * FROM hns_marketplace_listings WHERE id = $1 AND status = $2', [listingId, 'active']);
      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found or no longer active' });
      }
      if (listing.rows[0].seller_flare_address.toLowerCase() === offerer.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot make offer on your own listing' });
      }
    }

    // One active offer per user per name
    const existing = await query(
      `SELECT id FROM hns_marketplace_offers WHERE name = $1 AND LOWER(offerer_address) = $2 AND status = 'active'`,
      [name.toLowerCase(), offerer.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You already have an active offer on this name. Cancel it first.' });
    }

    // Verify offerer has enough HNS balance
    const offererInfo = await hnsWalletService.getWalletInfo(offerer);
    if (!offererInfo.success || (offererInfo.balance?.confirmed || 0) < amount) {
      return res.status(400).json({
        error: 'Insufficient HNS balance to lock for offer',
        required: amount,
        available: offererInfo.balance?.confirmed || 0,
      });
    }

    // Lock offerer's HNS in escrow
    const escrowAddress = await hnsWalletService.getEscrowAddress();
    if (!escrowAddress) {
      return res.status(500).json({ error: 'Failed to get escrow address' });
    }

    const lockResult = await hnsWalletService.sendHns(offerer, escrowAddress, amount, signature);
    if (!lockResult.success) {
      return res.status(500).json({ error: `Failed to lock HNS: ${lockResult.error}` });
    }

    const expiresAt = new Date(Date.now() + hours * 3600000);
    const result = await query(
      `INSERT INTO hns_marketplace_offers (name, listing_id, offerer_address, offer_hns, expires_at, status, escrow_tx, hns_locked, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, true, NOW())
       RETURNING id`,
      [name.toLowerCase(), listingId || null, offerer.toLowerCase(), amount, expiresAt, lockResult.txHash]
    );

    await query(
      `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, price_hns, created_at)
       VALUES ('offer', $1, $2, $3, $4, NOW())`,
      [name.toLowerCase(), listingId || null, offerer.toLowerCase(), amount]
    );

    log.info({ offerId: result.rows[0].id, name, offerer: offerer.slice(0, 10), amount, lockTx: lockResult.txHash }, 'Binding offer created with HNS locked');
    res.json({ success: true, offerId: result.rows[0].id, expiresAt: expiresAt.toISOString(), lockTxHash: lockResult.txHash });
  } catch (err) {
    log.error({ err }, 'Failed to create offer');
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

/**
 * GET /marketplace/offers/:name
 * Get active offers for a name (auto-expires stale offers).
 */
router.get('/marketplace/offers/:name', async (req, res) => {
  try {
    const name = req.params.name.toLowerCase().trim();

    // Expire stale offers
    await query(
      `UPDATE hns_marketplace_offers SET status = 'expired', updated_at = NOW() WHERE name = $1 AND status = 'active' AND expires_at < NOW()`,
      [name]
    );

    const result = await query(
      `SELECT * FROM hns_marketplace_offers WHERE name = $1 AND status = 'active' ORDER BY offer_hns DESC`,
      [name]
    );

    res.json({
      offers: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        listingId: r.listing_id,
        offererAddress: r.offerer_address,
        offerHns: parseFloat(r.offer_hns),
        expiresAt: r.expires_at,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    log.error({ err }, 'Failed to get offers');
    res.status(500).json({ error: 'Failed to get offers' });
  }
});

/**
 * POST /marketplace/offer/cancel
 * Cancel own active offer. Returns locked HNS from escrow to offerer.
 * Body: { wallet, signature, nonce, offerId }
 */
router.post('/marketplace/offer/cancel', auth.verifyWallet, async (req, res) => {
  try {
    const { offerId } = req.body;
    const offerer = req.authenticatedWallet;

    const offerResult = await query(
      `SELECT * FROM hns_marketplace_offers WHERE id = $1 AND status = 'active'`,
      [offerId]
    );
    if (offerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Offer not found or already cancelled' });
    }
    const offer = offerResult.rows[0];
    if (offer.offerer_address.toLowerCase() !== offerer.toLowerCase()) {
      return res.status(403).json({ error: 'Only the offerer can cancel this offer' });
    }

    // Return locked HNS from escrow to offerer
    if (offer.hns_locked) {
      const offererReceive = await hnsWalletService.getReceiveAddress(offerer);
      if (offererReceive.success && offererReceive.address) {
        const returnResult = await hnsWalletService.sendHnsFromEscrow(offererReceive.address, parseFloat(offer.offer_hns));
        if (!returnResult.success) {
          log.error({ offerId, err: returnResult.error }, 'Failed to return locked HNS on cancel');
          return res.status(500).json({ error: `Failed to return locked HNS: ${returnResult.error}` });
        }
        log.info({ offerId, amount: offer.offer_hns, txHash: returnResult.txHash }, 'Returned locked HNS to offerer');
      }
    }

    await query('UPDATE hns_marketplace_offers SET status = $1, hns_locked = false, updated_at = NOW() WHERE id = $2', ['cancelled', offerId]);

    log.info({ offerId, name: offer.name }, 'Offer cancelled');
    res.json({ success: true });
  } catch (err) {
    log.error({ err }, 'Failed to cancel offer');
    res.status(500).json({ error: 'Failed to cancel offer' });
  }
});

/**
 * POST /marketplace/offer/accept
 * Accept an offer on a name you own.
 * If name is in escrow (listed), releases name to offerer + sends locked HNS to seller.
 * If name is not listed, initiates a direct transfer.
 * Body: { wallet, signature, nonce, offerId }
 */
router.post('/marketplace/offer/accept', auth.verifyWallet, async (req, res) => {
  try {
    const { offerId, signature } = req.body;
    const seller = req.authenticatedWallet;

    const offerResult = await query(
      `SELECT * FROM hns_marketplace_offers WHERE id = $1 AND status = 'active'`,
      [offerId]
    );
    if (offerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Offer not found or expired' });
    }
    const offer = offerResult.rows[0];

    // Check if name is in escrow (has an active/escrowed listing)
    const escrowedListing = await query(
      `SELECT id, escrow_status FROM hns_marketplace_listings
       WHERE name = $1 AND status = 'active' AND escrow_status = 'escrowed'
       LIMIT 1`,
      [offer.name]
    );
    const isEscrowed = escrowedListing.rows.length > 0;

    if (!isEscrowed) {
      // Name is not in escrow — verify seller still owns it
      const ownedResult = await hnsWalletService.getOwnedNames(seller);
      if (!ownedResult.success || !ownedResult.names.some(n => n.name.toLowerCase() === offer.name)) {
        return res.status(403).json({ error: 'You do not own this name' });
      }
    }

    // Step 1: Release locked HNS from escrow to seller
    if (offer.hns_locked) {
      const sellerReceive = await hnsWalletService.getReceiveAddress(seller);
      if (!sellerReceive.success || !sellerReceive.address) {
        return res.status(500).json({ error: 'Failed to get seller receive address' });
      }
      const payResult = await hnsWalletService.sendHnsFromEscrow(sellerReceive.address, parseFloat(offer.offer_hns));
      if (!payResult.success) {
        return res.status(500).json({ error: `Failed to release payment: ${payResult.error}` });
      }
      log.info({ offerId, amount: offer.offer_hns, txHash: payResult.txHash }, 'Released locked HNS to seller');
    }

    // Step 2: Transfer name to offerer
    let transferTx = null;
    const buyerReceive = await hnsWalletService.getReceiveAddress(offer.offerer_address);

    if (isEscrowed && buyerReceive?.success && buyerReceive.address) {
      // Name is in escrow — release from escrow to buyer
      const releaseResult = await hnsWalletService.releaseFromEscrow(offer.name, buyerReceive.address);
      transferTx = releaseResult?.success ? releaseResult.txHash : null;

      // Get current block height
      const nodeInfo = await hnsService.getInfo().catch(() => null);
      const currentHeight = nodeInfo?.data?.chain?.height || 0;

      // Update the listing
      await query(
        `UPDATE hns_marketplace_listings
         SET status = 'sold', escrow_status = 'releasing', buyer_flare_address = $1,
             transfer_tx_hash = $2, escrow_block_height = $3, sold_at = NOW()
         WHERE id = $4`,
        [offer.offerer_address.toLowerCase(), transferTx, currentHeight, escrowedListing.rows[0].id]
      );
    } else if (buyerReceive?.success && buyerReceive.address) {
      // Name is not in escrow — direct transfer from seller
      const result = await hnsWalletService.transferName(seller, offer.name, buyerReceive.address, signature);
      transferTx = result?.success ? result.txHash : null;
    }

    // Mark offer accepted, cancel other active offers on this name
    await query('UPDATE hns_marketplace_offers SET status = $1, hns_locked = false, updated_at = NOW() WHERE id = $2', ['accepted', offerId]);

    // Return locked HNS for other cancelled offers
    const otherOffers = await query(
      `SELECT id, offerer_address, offer_hns, hns_locked FROM hns_marketplace_offers
       WHERE name = $1 AND status = 'active' AND id != $2`,
      [offer.name, offerId]
    );
    for (const other of otherOffers.rows) {
      if (other.hns_locked) {
        const otherReceive = await hnsWalletService.getReceiveAddress(other.offerer_address);
        if (otherReceive?.success && otherReceive.address) {
          await hnsWalletService.sendHnsFromEscrow(otherReceive.address, parseFloat(other.offer_hns)).catch(() => {});
        }
      }
    }
    await query(
      `UPDATE hns_marketplace_offers SET status = 'cancelled', hns_locked = false, updated_at = NOW()
       WHERE name = $1 AND status = 'active' AND id != $2`,
      [offer.name, offerId]
    );

    await query(
      `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, price_hns, created_at)
       VALUES ('offer_accepted', $1, $2, $3, $4, NOW())`,
      [offer.name, offer.listing_id, seller.toLowerCase(), offer.offer_hns]
    );

    log.info({ offerId, name: offer.name, seller: seller.slice(0, 10), amount: offer.offer_hns, transferTx }, 'Offer accepted with payment + transfer');
    res.json({
      success: true,
      transferTxHash: transferTx,
      note: transferTx
        ? 'Offer accepted. Payment released and name transfer initiated.'
        : 'Offer accepted. Payment released. Name transfer may need manual completion.',
    });
  } catch (err) {
    log.error({ err }, 'Failed to accept offer');
    res.status(500).json({ error: 'Failed to accept offer' });
  }
});

// ============================================================
//  DOMAIN TRANSFERS — Send/receive HNS names (ah-011)
// ============================================================

/**
 * POST /transfer/deposit-address
 * Get the HNS deposit address for the authenticated wallet.
 * Body: { wallet, signature, nonce }
 */
router.post('/transfer/deposit-address', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const result = await hnsWalletService.getReceiveAddress(wallet);
    if (!result.success || !result.address) {
      return res.status(500).json({ error: 'Failed to get deposit address' });
    }
    res.json({ success: true, address: result.address });
  } catch (err) {
    log.error({ err }, 'Failed to get deposit address');
    res.status(500).json({ error: 'Failed to get deposit address' });
  }
});

/**
 * POST /transfer/send
 * Transfer a name to an external HNS address.
 * Body: { wallet, signature, nonce, name, toAddress }
 */
router.post('/transfer/send', auth.verifyWallet, async (req, res) => {
  try {
    const { name, toAddress } = req.body;
    const sender = req.authenticatedWallet;

    if (!name || typeof name !== 'string' || name.length > 63) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    if (!toAddress || typeof toAddress !== 'string') {
      return res.status(400).json({ error: 'Invalid destination address' });
    }

    // Verify sender owns the name
    const owned = await hnsWalletService.getOwnedNames(sender);
    if (!owned.success || !owned.names.some(n => n.name.toLowerCase() === name.toLowerCase())) {
      return res.status(403).json({ error: 'You do not own this name' });
    }

    // Block transfer if name is actively listed
    const activeListing = await query(
      `SELECT id FROM hns_marketplace_listings WHERE name = $1 AND status = 'active'`,
      [name.toLowerCase()]
    );
    if (activeListing.rows.length > 0) {
      return res.status(409).json({ error: 'Cannot transfer a name that is listed for sale. Delist it first.' });
    }

    // Execute transfer via HSD wallet
    const result = await hnsWalletService.transferName(sender, name.toLowerCase(), toAddress, req.body.signature);
    if (!result.success) {
      return res.status(500).json({ error: `Transfer failed: ${result.error}` });
    }

    await query(
      `INSERT INTO hns_marketplace_activity (event_type, name, actor_address, created_at)
       VALUES ('transfer_out', $1, $2, NOW())`,
      [name.toLowerCase(), sender.toLowerCase()]
    );

    log.info({ name, sender: sender.slice(0, 10), to: toAddress.slice(0, 10), txHash: result.txHash }, 'Name transferred out');
    res.json({
      success: true,
      txHash: result.txHash,
      note: 'Transfer initiated. Finalization takes ~2 days (288 blocks).',
    });
  } catch (err) {
    log.error({ err }, 'Failed to transfer name');
    res.status(500).json({ error: 'Failed to transfer name' });
  }
});

// ============================================================
//  BULK LISTING — List multiple names at once (ah-012)
// ============================================================

/**
 * POST /marketplace/bulk-list
 * List multiple names for sale at once.
 * Body: { wallet, signature, nonce, entries: [{ name, priceHns, description? }] }
 */
router.post('/marketplace/bulk-list', auth.verifyWallet, async (req, res) => {
  try {
    const { entries } = req.body;
    const seller = req.authenticatedWallet;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Missing entries array' });
    }
    if (entries.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 names per bulk listing' });
    }

    // Validate all entries
    const validationErrors = [];
    const validated = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.name || typeof e.name !== 'string' || e.name.length > 63) {
        validationErrors.push({ index: i, name: e.name, error: 'Invalid name' });
        continue;
      }
      const price = parseFloat(e.priceHns);
      if (!price || price <= 0 || price > 1e12) {
        validationErrors.push({ index: i, name: e.name, error: 'Invalid price' });
        continue;
      }
      validated.push({ name: e.name.toLowerCase(), priceHns: price, description: e.description || null });
    }

    if (validated.length === 0) {
      return res.status(400).json({ error: 'No valid entries', validationErrors });
    }

    // Verify ownership
    const ownedResult = await hnsWalletService.getOwnedNames(seller);
    if (!ownedResult.success) {
      return res.status(500).json({ error: 'Failed to verify name ownership' });
    }
    const ownedSet = new Set(ownedResult.names.map(n => n.name.toLowerCase()));

    // Check existing active listings
    const namesArr = validated.map(v => v.name);
    const existingResult = await query(
      `SELECT name FROM hns_marketplace_listings WHERE name = ANY($1) AND status = 'active'`,
      [namesArr]
    );
    const alreadyListed = new Set(existingResult.rows.map(r => r.name));

    const results = [];
    for (const entry of validated) {
      if (!ownedSet.has(entry.name)) {
        results.push({ name: entry.name, success: false, error: 'Not owned' });
        continue;
      }
      if (alreadyListed.has(entry.name)) {
        results.push({ name: entry.name, success: false, error: 'Already listed' });
        continue;
      }
      try {
        const insertResult = await query(
          `INSERT INTO hns_marketplace_listings (name, seller_flare_address, price_hns, description, status, listed_at)
           VALUES ($1, $2, $3, $4, 'active', NOW()) RETURNING id`,
          [entry.name, seller.toLowerCase(), entry.priceHns, entry.description]
        );
        await query(
          `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, price_hns, created_at)
           VALUES ('listed', $1, $2, $3, $4, NOW())`,
          [entry.name, insertResult.rows[0].id, seller.toLowerCase(), entry.priceHns]
        );
        results.push({ name: entry.name, success: true, listingId: insertResult.rows[0].id });
      } catch {
        results.push({ name: entry.name, success: false, error: 'Database error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    log.info({ seller: seller.slice(0, 10), total: entries.length, success: successCount }, 'Bulk listing completed');
    res.json({
      success: true,
      total: entries.length,
      listed: successCount,
      failed: results.length - successCount,
      results,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    });
  } catch (err) {
    log.error({ err }, 'Bulk listing failed');
    res.status(500).json({ error: 'Failed to process bulk listing' });
  }
});

// ============================================================
//  NOTIFICATIONS — Watchlist alerts (ah-013)
// ============================================================

// Tables now created via migrate.js (auc-008, auc-009)

/**
 * POST /notifications/list
 * Get notifications for the authenticated wallet.
 * Body: { wallet, signature, nonce, unreadOnly?, limit? }
 */
router.post('/notifications/list', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet.toLowerCase();
    const { unreadOnly, limit = 50 } = req.body;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));

    let whereClause = 'WHERE LOWER(recipient_address) = $1';
    if (unreadOnly === 'true') whereClause += ' AND read = false';

    const result = await query(
      `SELECT * FROM hns_notifications ${whereClause} ORDER BY created_at DESC LIMIT $2`,
      [wallet, limitNum]
    );

    const countResult = await query(
      `SELECT count(*) AS unread FROM hns_notifications WHERE LOWER(recipient_address) = $1 AND read = false`,
      [wallet]
    );

    res.json({
      notifications: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        eventType: r.event_type,
        message: r.message,
        read: r.read,
        createdAt: r.created_at,
      })),
      unreadCount: parseInt(countResult.rows[0].unread) || 0,
    });
  } catch (err) {
    log.error({ err }, 'Failed to get notifications');
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * POST /notifications/read
 * Mark notification(s) as read.
 * Body: { wallet, signature, nonce, notificationId? | all?: true }
 */
router.post('/notifications/read', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet.toLowerCase();
    const { notificationId, all } = req.body;

    if (all) {
      await query(
        `UPDATE hns_notifications SET read = true WHERE LOWER(recipient_address) = $1 AND read = false`,
        [wallet]
      );
    } else if (notificationId) {
      await query(
        `UPDATE hns_notifications SET read = true WHERE id = $1 AND LOWER(recipient_address) = $2`,
        [notificationId, wallet]
      );
    } else {
      return res.status(400).json({ error: 'Provide notificationId or set all=true' });
    }

    res.json({ success: true });
  } catch (err) {
    log.error({ err }, 'Failed to mark notifications read');
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

/**
 * POST /notifications/check-watchlist
 * Poll watchlist for state changes and generate notifications.
 * Uses a single batch query instead of N individual queries.
 * Called periodically by the frontend.
 * Body: { wallet, signature, nonce }
 */
router.post('/notifications/check-watchlist', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet.toLowerCase();

    const watchResult = await query(
      `SELECT name, last_known_state FROM hns_watchlist WHERE LOWER(flare_address) = $1`,
      [wallet]
    );

    if (watchResult.rows.length === 0) {
      return res.json({ success: true, newNotifications: 0 });
    }

    // Build a map of watchlist entries and collect all names
    const watchMap = new Map();
    const names = [];
    for (const entry of watchResult.rows) {
      watchMap.set(entry.name, entry.last_known_state);
      names.push(entry.name);
    }

    // Single batch query for all watched auction states
    const auctionResult = await query(
      `SELECT name, state, bid_count, highest_lockup FROM discovered_auctions WHERE name = ANY($1)`,
      [names]
    );

    // Build current state map
    const currentStates = new Map();
    for (const row of auctionResult.rows) {
      currentStates.set(row.name, row);
    }

    // Detect changes and batch insert notifications + updates
    let newCount = 0;
    const notificationsToInsert = [];
    const statesToUpdate = [];

    for (const [name, oldState] of watchMap) {
      const current = currentStates.get(name);
      if (!current) continue;

      if (oldState && current.state !== oldState) {
        notificationsToInsert.push({ name, message: `${name}/ moved from ${oldState} to ${current.state}` });
        newCount++;
      }

      if (!oldState || current.state !== oldState) {
        statesToUpdate.push({ name, newState: current.state });
      }
    }

    // Batch insert notifications
    for (const notif of notificationsToInsert) {
      await query(
        `INSERT INTO hns_notifications (recipient_address, name, event_type, message, created_at)
         VALUES ($1, $2, 'state_change', $3, NOW())`,
        [wallet, notif.name, notif.message]
      );
    }

    // Batch update last known states
    for (const update of statesToUpdate) {
      await query(
        `UPDATE hns_watchlist SET last_known_state = $1 WHERE name = $2 AND LOWER(flare_address) = $3`,
        [update.newState, update.name, wallet]
      );
    }

    res.json({ success: true, newNotifications: newCount });
  } catch (err) {
    log.error({ err }, 'Failed to check watchlist notifications');
    res.status(500).json({ error: 'Failed to check watchlist' });
  }
});

export default router;
