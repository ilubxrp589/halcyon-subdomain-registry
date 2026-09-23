import { loggers } from '../utils/logger.js';
import { query } from '../db/index.js';
import hnsService from './hns.js';
import { hnsWalletService } from './hnsWallet.js';

const log = loggers.hns;

const POLL_INTERVAL = 60000;    // 60 seconds
const TRANSFER_LOCKUP = 288;    // ~2 days in blocks

/**
 * Escrow Finalizer Service
 *
 * Background job that monitors escrow state transitions:
 *   transferring → escrowed (finalize seller→escrow transfer, listing becomes active)
 *   releasing → released (finalize escrow→buyer transfer after purchase)
 *   returning → returned (finalize escrow→seller transfer after delist)
 */
class EscrowFinalizer {
  constructor() {
    this._interval = null;
    this._running = false;
    this._processing = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    log.info('Escrow finalizer starting...');

    // Initial check
    this._poll();

    this._interval = setInterval(() => this._poll(), POLL_INTERVAL);
    log.info('Escrow finalizer started');
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._running = false;
    log.info('Escrow finalizer stopped');
  }

  async _poll() {
    if (this._processing) return;
    this._processing = true;

    try {
      const info = await hnsService.nodeClient.getInfo();
      const currentHeight = info.chain?.height;
      if (!currentHeight) {
        log.warn('Escrow finalizer: could not get chain height');
        return;
      }

      await this._processTransferring(currentHeight);
      await this._processReleasing(currentHeight);
      await this._processReturning(currentHeight);
    } catch (err) {
      log.error({ err: err.message }, 'Escrow finalizer poll error');
    } finally {
      this._processing = false;
    }
  }

  /**
   * Process listings where name is transferring to escrow.
   * After ~288 blocks, call createFinalize on the seller's wallet.
   */
  async _processTransferring(currentHeight) {
    const result = await query(
      `SELECT id, name, seller_flare_address, escrow_block_height
       FROM hns_marketplace_listings
       WHERE escrow_status = 'transferring'
         AND escrow_block_height IS NOT NULL
         AND escrow_block_height + $1 <= $2`,
      [TRANSFER_LOCKUP, currentHeight]
    );

    for (const listing of result.rows) {
      try {
        // We can't finalize without the seller's signature for encrypted wallets.
        // For the escrow model, the seller provided their signature at list-time.
        // We store the transfer tx and rely on the hsd wallet's auto-finalize behavior,
        // OR we try to finalize without a signature (works for unencrypted/legacy wallets).
        // For encrypted wallets, the seller must re-sign to finalize.
        // We attempt the finalize — if it fails due to locked wallet, mark as 'pending_finalize'.
        const finalizeResult = await hnsWalletService.finalizeEscrowTransfer(
          listing.seller_flare_address,
          listing.name,
          null // No signature available — works for legacy unencrypted wallets
        ).catch(() => null);

        if (finalizeResult?.success) {
          await query(
            `UPDATE hns_marketplace_listings
             SET escrow_status = 'escrowed', escrow_finalize_tx = $1, status = 'active'
             WHERE id = $2`,
            [finalizeResult.txHash, listing.id]
          );

          // Log activity
          await query(
            `INSERT INTO hns_marketplace_activity (event_type, name, listing_id, actor_address, created_at)
             VALUES ('escrow_complete', $1, $2, $3, NOW())`,
            [listing.name, listing.id, listing.seller_flare_address]
          );

          log.info({ listingId: listing.id, name: listing.name, txHash: finalizeResult.txHash }, 'Escrow transfer finalized — listing now active');
        } else {
          // Mark as needing seller re-auth to finalize
          await query(
            `UPDATE hns_marketplace_listings SET escrow_status = 'pending_finalize' WHERE id = $1`,
            [listing.id]
          );
          log.warn({ listingId: listing.id, name: listing.name }, 'Escrow finalize needs seller re-auth');
        }
      } catch (err) {
        log.error({ err: err.message, listingId: listing.id, name: listing.name }, 'Failed to finalize escrow transfer');
      }
    }
  }

  /**
   * Process listings where name is being released from escrow to buyer.
   * After ~288 blocks, call createFinalize on the escrow wallet.
   */
  async _processReleasing(currentHeight) {
    const result = await query(
      `SELECT id, name, buyer_flare_address, escrow_block_height
       FROM hns_marketplace_listings
       WHERE escrow_status = 'releasing'
         AND escrow_block_height IS NOT NULL
         AND escrow_block_height + $1 <= $2`,
      [TRANSFER_LOCKUP, currentHeight]
    );

    for (const listing of result.rows) {
      try {
        const finalizeResult = await hnsWalletService.finalizeEscrowRelease(listing.name);

        if (finalizeResult?.success) {
          await query(
            `UPDATE hns_marketplace_listings
             SET escrow_status = 'released', escrow_finalize_tx = $1
             WHERE id = $2`,
            [finalizeResult.txHash, listing.id]
          );

          log.info({ listingId: listing.id, name: listing.name }, 'Escrow release finalized — name delivered to buyer');
        }
      } catch (err) {
        log.error({ err: err.message, listingId: listing.id }, 'Failed to finalize escrow release');
      }
    }
  }

  /**
   * Process listings where name is being returned from escrow to seller (delist).
   * After ~288 blocks, call createFinalize on the escrow wallet.
   */
  async _processReturning(currentHeight) {
    const result = await query(
      `SELECT id, name, seller_flare_address, escrow_block_height
       FROM hns_marketplace_listings
       WHERE escrow_status = 'returning'
         AND escrow_block_height IS NOT NULL
         AND escrow_block_height + $1 <= $2`,
      [TRANSFER_LOCKUP, currentHeight]
    );

    for (const listing of result.rows) {
      try {
        const finalizeResult = await hnsWalletService.finalizeEscrowReturn(listing.name);

        if (finalizeResult?.success) {
          await query(
            `UPDATE hns_marketplace_listings
             SET escrow_status = 'returned', status = 'cancelled', escrow_finalize_tx = $1
             WHERE id = $2`,
            [finalizeResult.txHash, listing.id]
          );

          log.info({ listingId: listing.id, name: listing.name }, 'Escrow return finalized — name returned to seller');
        }
      } catch (err) {
        log.error({ err: err.message, listingId: listing.id }, 'Failed to finalize escrow return');
      }
    }
  }
}

const escrowFinalizer = new EscrowFinalizer();
export default escrowFinalizer;
