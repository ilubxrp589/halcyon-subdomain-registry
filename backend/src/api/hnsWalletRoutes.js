import { Router } from 'express';
import auth from '../middleware/auth.js';
import { hnsWalletService, walletIdFromFlare } from '../services/hnsWallet.js';
import hnsSwapService from '../services/hnsSwap.js';
import hnsService from '../services/hns.js';
import { query } from '../db/index.js';
import { loggers } from '../utils/logger.js';

const log = loggers.api;
const router = Router();

function sendError(res, error, statusCode = 500, userMessage) {
  log.error({ err: error, statusCode }, userMessage || 'Request failed');
  res.status(statusCode).json({ error: userMessage || 'Internal error' });
}

// =============================================================
//                     WALLET INFO
// =============================================================

/**
 * POST /hns-wallet/info
 * Get or create HNS wallet for the authenticated user.
 */
router.post('/info', auth.verifyWallet, async (req, res) => {
  try {
    const result = await hnsWalletService.getOrCreateWallet(req.authenticatedWallet, req.body.signature);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get wallet info');
  }
});

/**
 * POST /hns-wallet/names
 * Get TLDs owned by this wallet.
 */
router.post('/names', auth.verifyWallet, async (req, res) => {
  try {
    const result = await hnsWalletService.getOwnedNames(req.authenticatedWallet);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get owned names');
  }
});

/**
 * POST /hns-wallet/auctions
 * Get auctions this wallet participates in.
 */
router.post('/auctions', auth.verifyWallet, async (req, res) => {
  try {
    const result = await hnsWalletService.getAuctions(req.authenticatedWallet);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get auctions');
  }
});

/**
 * POST /hns-wallet/history
 * Get transaction history.
 */
router.post('/history', auth.verifyWallet, async (req, res) => {
  try {
    const { limit } = req.body;
    const result = await hnsWalletService.getHistory(req.authenticatedWallet, limit || 50);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get history');
  }
});

/**
 * POST /hns-wallet/address
 * Get receive address for deposits.
 */
router.post('/address', auth.verifyWallet, async (req, res) => {
  try {
    const result = await hnsWalletService.getReceiveAddress(req.authenticatedWallet);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get receive address');
  }
});

/**
 * POST /hns-wallet/export
 * Export wallet master key for backup/self-custody.
 */
router.post('/export', auth.verifyWallet, async (req, res) => {
  try {
    const result = await hnsWalletService.exportWallet(req.authenticatedWallet, req.body.signature);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to export wallet');
  }
});

// =============================================================
//                     AUCTION OPERATIONS
// =============================================================

/**
 * POST /hns-wallet/auction/open
 * Open an auction for a name.
 */
router.post('/auction/open', auth.verifyWallet, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await hnsWalletService.openAuction(req.authenticatedWallet, name.toLowerCase(), req.body.signature);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to open auction');
  }
});

/**
 * POST /hns-wallet/auction/bid
 * Place a bid on an auction.
 */
router.post('/auction/bid', auth.verifyWallet, async (req, res) => {
  try {
    const { name, bid, lockup } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!bid || bid <= 0) {
      return res.status(400).json({ error: 'Bid amount must be > 0' });
    }
    if (!lockup || lockup <= 0) {
      return res.status(400).json({ error: 'Lockup amount must be > 0' });
    }

    const result = await hnsWalletService.placeBid(
      req.authenticatedWallet,
      name.toLowerCase(),
      bid,
      lockup,
      req.body.signature
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to place bid');
  }
});

/**
 * POST /hns-wallet/auction/reveal
 * Reveal a bid.
 */
router.post('/auction/reveal', auth.verifyWallet, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await hnsWalletService.revealBid(req.authenticatedWallet, name.toLowerCase(), req.body.signature);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to reveal bid');
  }
});

/**
 * POST /hns-wallet/auction/redeem
 * Redeem a winning bid.
 */
router.post('/auction/redeem', auth.verifyWallet, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await hnsWalletService.redeemBid(req.authenticatedWallet, name.toLowerCase(), req.body.signature);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to redeem bid');
  }
});

/**
 * POST /hns-wallet/auction/finalize
 * Finalize an auction.
 */
router.post('/auction/finalize', auth.verifyWallet, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await hnsWalletService.finalizeAuction(req.authenticatedWallet, name.toLowerCase(), req.body.signature);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to finalize auction');
  }
});

// =============================================================
//                     NAME MANAGEMENT
// =============================================================

/**
 * POST /hns-wallet/dns/update
 * Update DNS records on a TLD.
 */
router.post('/dns/update', auth.verifyWallet, async (req, res) => {
  try {
    const { name, records } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Records array is required' });
    }

    const result = await hnsWalletService.updateDnsRecords(
      req.authenticatedWallet,
      name.toLowerCase(),
      records,
      req.body.signature
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to update DNS records');
  }
});

/**
 * POST /hns-wallet/dns/set-flare
 * Auto-set flr:0x... TXT record on a TLD.
 */
router.post('/dns/set-flare', auth.verifyWallet, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await hnsWalletService.setFlareAddress(
      req.authenticatedWallet,
      name.toLowerCase(),
      req.body.signature
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to set Flare address');
  }
});

/**
 * POST /hns-wallet/transfer
 * Transfer a TLD to another HNS address.
 */
router.post('/transfer', auth.verifyWallet, async (req, res) => {
  try {
    const { name, toAddress } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!toAddress || typeof toAddress !== 'string') {
      return res.status(400).json({ error: 'Destination address is required' });
    }

    const result = await hnsWalletService.transferName(
      req.authenticatedWallet,
      name.toLowerCase(),
      toAddress,
      req.body.signature
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to transfer name');
  }
});

/**
 * POST /hns-wallet/renew
 * Renew a TLD.
 */
router.post('/renew', auth.verifyWallet, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await hnsWalletService.renewName(req.authenticatedWallet, name.toLowerCase(), req.body.signature);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to renew name');
  }
});

/**
 * POST /hns-wallet/send
 * Send HNS to an address.
 */
router.post('/send', auth.verifyWallet, async (req, res) => {
  try {
    const { address, amount } = req.body;
    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Destination address is required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be > 0' });
    }

    const result = await hnsWalletService.sendHns(
      req.authenticatedWallet,
      address,
      amount,
      req.body.signature
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to send HNS');
  }
});

// =============================================================
//                   BATCH OPERATIONS (hsd-004)
// =============================================================

/**
 * POST /hns-wallet/batch/renew
 * Batch renew multiple names.
 */
router.post('/batch/renew', auth.verifyWallet, async (req, res) => {
  try {
    const { names } = req.body;
    if (!names || !Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'Names array is required' });
    }
    if (names.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 names per batch' });
    }

    const result = await hnsWalletService.batchRenew(
      req.authenticatedWallet,
      names.map(n => n.toLowerCase()),
      req.body.signature
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to batch renew');
  }
});

/**
 * POST /hns-wallet/batch/finalize
 * Batch finalize multiple auctions.
 */
router.post('/batch/finalize', auth.verifyWallet, async (req, res) => {
  try {
    const { names } = req.body;
    if (!names || !Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'Names array is required' });
    }
    if (names.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 names per batch' });
    }

    const result = await hnsWalletService.batchFinalize(
      req.authenticatedWallet,
      names.map(n => n.toLowerCase()),
      req.body.signature
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to batch finalize');
  }
});

/**
 * POST /hns-wallet/batch/reveal
 * Batch reveal bids for multiple names.
 */
router.post('/batch/reveal', auth.verifyWallet, async (req, res) => {
  try {
    const { names } = req.body;
    if (!names || !Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'Names array is required' });
    }
    if (names.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 names per batch' });
    }

    const result = await hnsWalletService.batchReveal(
      req.authenticatedWallet,
      names.map(n => n.toLowerCase()),
      req.body.signature
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to batch reveal');
  }
});

// =============================================================
//                 NAME STATE MACHINE (hsd-006)
// =============================================================

/**
 * POST /hns-wallet/name-state
 * Get detailed state info for a single name.
 */
router.post('/name-state', auth.verifyWallet, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await hnsWalletService.getNameState(
      req.authenticatedWallet,
      name.toLowerCase()
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get name state');
  }
});

/**
 * POST /hns-wallet/names-detailed
 * Get all names with state details.
 */
router.post('/names-detailed', auth.verifyWallet, async (req, res) => {
  try {
    const result = await hnsWalletService.getNamesWithState(req.authenticatedWallet);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get detailed names');
  }
});

// =============================================================
//                    HSD NODE INFO (hsd-016)
// =============================================================

/**
 * POST /hns-wallet/node-info
 * Get hsd node status (sync, peers, mempool).
 */
router.post('/node-info', auth.verifyWallet, async (req, res) => {
  try {
    const result = await hnsWalletService.getNodeInfo();
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get node info');
  }
});

// =============================================================
//                RENEWAL MONITORING (hsd-019)
// =============================================================

/**
 * POST /hns-wallet/expiring
 * Get names approaching renewal deadline.
 */
router.post('/expiring', auth.verifyWallet, async (req, res) => {
  try {
    const result = await hnsWalletService.getExpiringNames(req.authenticatedWallet);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get expiring names');
  }
});

// =============================================================
//              NAME LOOKUP (public, auc-004)
// =============================================================

/**
 * GET /hns-wallet/lookup/:name
 * Public — look up any HNS name on the blockchain.
 * Returns state, phase, owner, countdown, DNS records.
 */
router.get('/lookup/:name', async (req, res) => {
  try {
    const name = req.params.name.toLowerCase().replace(/[^a-z0-9\-_]/g, '');
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const [nameResult, resourceResult] = await Promise.allSettled([
      hnsService.getNameInfo(name),
      hnsService.getNameResource(name),
    ]);

    const nameInfo = nameResult.status === 'fulfilled' ? nameResult.value : { success: false };
    const resource = resourceResult.status === 'fulfilled' ? resourceResult.value : { success: false };

    // Name not found on chain — available
    if (!nameInfo.success || !nameInfo.data?.info) {
      return res.json({
        success: true,
        name,
        available: true,
        state: 'AVAILABLE',
        phase: 'Available',
        owner: null,
        records: [],
      });
    }

    const info = nameInfo.data.info;
    const records = resource.success ? (resource.data?.records || []) : [];

    // Get current chain height for timer calculation
    const chainInfo = await hnsService.nodeClient.getInfo().catch(() => null);
    const currentHeight = chainInfo?.chain?.height || 0;

    // Compute phase + timers (reuse hnsWallet constants)
    const BLOCKS_PER_DAY = 144;
    const AUCTION_OPEN_PERIOD = 37;
    const AUCTION_BID_PERIOD = 720;
    const AUCTION_REVEAL_PERIOD = 1440;
    const NAME_EXPIRY = 2 * 365 * BLOCKS_PER_DAY;
    const RENEWAL_WINDOW = 4320;
    const TRANSFER_LOCKUP = 288;

    const state = info.state || 'UNKNOWN';
    const height = info.height || 0;
    const renewal = info.renewal || 0;
    const transfer = info.transfer || 0;

    let phase = state;
    let blocksRemaining = 0;
    let nextAction = null;
    let actionUrgency = 'none';

    switch (state) {
      case 'OPENING':
        blocksRemaining = Math.max(0, (height + AUCTION_OPEN_PERIOD) - currentHeight);
        nextAction = 'wait_for_bidding';
        phase = 'Opening';
        actionUrgency = 'low';
        break;
      case 'BIDDING':
        blocksRemaining = Math.max(0, (height + AUCTION_OPEN_PERIOD + AUCTION_BID_PERIOD) - currentHeight);
        nextAction = blocksRemaining > 0 ? 'place_bid' : 'wait_for_reveal';
        phase = 'Bidding';
        actionUrgency = blocksRemaining < BLOCKS_PER_DAY ? 'high' : 'medium';
        break;
      case 'REVEAL':
        blocksRemaining = Math.max(0, (height + AUCTION_OPEN_PERIOD + AUCTION_BID_PERIOD + AUCTION_REVEAL_PERIOD) - currentHeight);
        nextAction = 'reveal_bid';
        phase = 'Reveal';
        actionUrgency = blocksRemaining < BLOCKS_PER_DAY ? 'critical' : 'high';
        break;
      case 'CLOSED': {
        const baseHeight = renewal > 0 ? renewal : height;
        const expiryHeight = baseHeight + NAME_EXPIRY;
        const renewStart = expiryHeight - RENEWAL_WINDOW;
        if (currentHeight >= renewStart) {
          blocksRemaining = Math.max(0, expiryHeight - currentHeight);
          nextAction = 'renew';
          phase = 'Renewal Window';
          actionUrgency = blocksRemaining < BLOCKS_PER_DAY * 7 ? 'critical' : 'high';
        } else {
          phase = 'Owned';
          nextAction = 'none';
        }
        break;
      }
      case 'TRANSFER':
        blocksRemaining = Math.max(0, (transfer + TRANSFER_LOCKUP) - currentHeight);
        nextAction = blocksRemaining > 0 ? 'wait_for_finalize' : 'finalize_transfer';
        phase = 'Transferring';
        actionUrgency = blocksRemaining <= 0 ? 'medium' : 'low';
        break;
      case 'REVOKE':
        phase = 'Revoked';
        break;
    }

    const timeRemainingMs = blocksRemaining * 10 * 60 * 1000;
    const formatDuration = (ms) => {
      if (ms <= 0) return 'now';
      const hours = Math.floor(ms / 3600000);
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      if (days > 0) return `${days}d ${remainingHours}h`;
      if (hours > 0) return `${hours}h`;
      return '<1h';
    };

    // Extract owner address from coin info
    const owner = info.owner?.hash || null;

    res.json({
      success: true,
      name,
      available: false,
      state,
      phase,
      owner,
      height,
      renewal,
      transfer,
      blocksRemaining,
      timeRemainingMs,
      timeRemainingHuman: formatDuration(timeRemainingMs),
      nextAction,
      actionUrgency,
      records,
      stats: info.stats || null,
    });
  } catch (err) {
    sendError(res, err, 500, 'Failed to lookup name');
  }
});

// =============================================================
//                   WATCHLIST (auc-008/009)
// =============================================================

/**
 * POST /hns-wallet/watchlist/add
 * Add a name to the user's watchlist.
 */
router.post('/watchlist/add', auth.verifyWallet, async (req, res) => {
  try {
    const { name, note } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    await query(
      `INSERT INTO hns_watchlist (flare_address, name, note)
       VALUES ($1, $2, $3)
       ON CONFLICT (flare_address, name) DO UPDATE SET note = $3`,
      [req.authenticatedWallet.toLowerCase(), name.toLowerCase(), note || null]
    );

    res.json({ success: true, message: `Added ${name} to watchlist` });
  } catch (err) {
    sendError(res, err, 500, 'Failed to add to watchlist');
  }
});

/**
 * POST /hns-wallet/watchlist/remove
 * Remove a name from the user's watchlist.
 */
router.post('/watchlist/remove', auth.verifyWallet, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    await query(
      `DELETE FROM hns_watchlist WHERE flare_address = $1 AND name = $2`,
      [req.authenticatedWallet.toLowerCase(), name.toLowerCase()]
    );

    res.json({ success: true, message: `Removed ${name} from watchlist` });
  } catch (err) {
    sendError(res, err, 500, 'Failed to remove from watchlist');
  }
});

/**
 * POST /hns-wallet/watchlist/list
 * Get user's watchlist, enriched with live blockchain state.
 */
router.post('/watchlist/list', auth.verifyWallet, async (req, res) => {
  try {
    const result = await query(
      `SELECT name, note, created_at FROM hns_watchlist
       WHERE flare_address = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.authenticatedWallet.toLowerCase()]
    );

    // Enrich each entry with live blockchain state (max 20 parallel lookups)
    const entries = result.rows.slice(0, 20);
    const enriched = await Promise.allSettled(
      entries.map(async (row) => {
        const nameResult = await hnsService.getNameInfo(row.name);
        if (!nameResult.success || !nameResult.data?.info) {
          return { name: row.name, note: row.note, createdAt: row.created_at, state: 'AVAILABLE', phase: 'Available' };
        }
        const info = nameResult.data.info;

        // Basic state info — full timer computation delegated to frontend via /lookup/:name
        return {
          name: row.name,
          note: row.note,
          createdAt: row.created_at,
          state: info.state || 'UNKNOWN',
          phase: info.state || 'Unknown',
          owner: info.owner?.hash || null,
          height: info.height || 0,
        };
      })
    );

    const watchlist = enriched.map(r =>
      r.status === 'fulfilled' ? r.value : { name: 'unknown', state: 'ERROR' }
    );

    res.json({ success: true, entries: watchlist });
  } catch (err) {
    sendError(res, err, 500, 'Failed to get watchlist');
  }
});

// =============================================================
//                          SWAP
// =============================================================

/**
 * GET /hns-wallet/swap/rate
 * Public — current HNS/FLR swap rate.
 */
router.get('/swap/rate', async (req, res) => {
  try {
    const rate = await hnsSwapService.getSwapRate();
    res.json({ success: true, ...rate });
  } catch (err) {
    sendError(res, err, 500, 'Failed to get swap rate');
  }
});

/**
 * POST /hns-wallet/swap/quote
 * Get a locked swap quote (rate locked 60s).
 */
router.post('/swap/quote', auth.verifyWallet, async (req, res) => {
  try {
    const { direction, amount } = req.body;
    if (!['buy_hns', 'sell_hns'].includes(direction)) {
      return res.status(400).json({ error: 'Direction must be buy_hns or sell_hns' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be > 0' });
    }

    const quote = await hnsSwapService.quoteSwap(direction, amount);
    res.json({ success: true, ...quote });
  } catch (err) {
    sendError(res, err, 500, 'Failed to generate swap quote');
  }
});

/**
 * POST /hns-wallet/swap/execute
 * Execute a swap from a locked quote.
 */
router.post('/swap/execute', auth.verifyWallet, async (req, res) => {
  try {
    const { quoteId, flrTxHash } = req.body;
    if (!quoteId) {
      return res.status(400).json({ error: 'Quote ID is required' });
    }

    // Look up the quote to determine direction
    const quote = hnsSwapService._activeQuotes.get(quoteId);
    if (!quote) {
      return res.json({ success: false, error: 'Quote not found or expired' });
    }

    let result;
    if (quote.direction === 'buy_hns') {
      if (!flrTxHash) {
        return res.status(400).json({ error: 'FLR transaction hash is required for buy_hns' });
      }
      result = await hnsSwapService.executeBuyHns(quoteId, req.authenticatedWallet, flrTxHash);
    } else {
      result = await hnsSwapService.executeSellHns(quoteId, req.authenticatedWallet, req.body.signature);
    }

    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to execute swap');
  }
});

/**
 * POST /hns-wallet/swap/history
 * Get swap history for the authenticated user.
 */
router.post('/swap/history', auth.verifyWallet, async (req, res) => {
  try {
    const { limit } = req.body;
    const result = await hnsSwapService.getSwapHistory(req.authenticatedWallet, limit || 20);
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get swap history');
  }
});

/**
 * POST /hns-wallet/swap/pool
 * Admin only — get swap pool balances.
 */
router.post('/swap/pool', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    const result = await hnsSwapService.getSwapPoolBalance();
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'Failed to get pool balance');
  }
});

export default router;
