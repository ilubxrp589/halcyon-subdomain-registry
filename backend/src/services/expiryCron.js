import { ethers } from 'ethers';
import config from '../config/index.js';
import { query } from '../db/index.js';

/**
 * Expiry Cron Service
 * Runs every hour to:
 * 1. Update domain statuses based on expiration dates
 * 2. Reclaim expired domains past grace period (on-chain)
 * 3. Manage treasury auctions for reclaimed domains
 */

const NFT_ABI = [
  'function reclaimExpired(uint256 tokenId) external',
  'function subdomains(uint256) view returns (string tld, string subdomain, uint256 registeredAt, uint256 expiresAt, bool dnsActive, uint256 pricePaidFLR, uint256 pricePaidUSD)',
];

const MARKETPLACE_ABI = [
  'function listAuction(uint256 tokenId, uint256 startingPrice, uint256 duration) external',
];

class ExpiryCronService {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.provider = null;
    this.nftContract = null;
    this.marketplaceContract = null;
    this.operatorWallet = null;
    this.treasuryWallet = null;
  }

  async initialize() {
    try {
      this.provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);

      // Set up operator wallet for reclaimExpired
      if (config.operatorPrivateKey && config.contracts.nft) {
        this.operatorWallet = new ethers.Wallet(config.operatorPrivateKey, this.provider);
        this.nftContract = new ethers.Contract(
          config.contracts.nft,
          NFT_ABI,
          this.operatorWallet
        );
        console.log('  ✓ Expiry cron: operator wallet configured');
      } else {
        console.log('  ⚠ Expiry cron: operator wallet not configured (reclaim disabled)');
      }

      // Set up treasury wallet for listAuction
      if (config.treasuryPrivateKey && config.contracts.marketplace) {
        this.treasuryWallet = new ethers.Wallet(config.treasuryPrivateKey, this.provider);
        this.marketplaceContract = new ethers.Contract(
          config.contracts.marketplace,
          MARKETPLACE_ABI,
          this.treasuryWallet
        );
        console.log('  ✓ Expiry cron: treasury wallet configured');
      } else {
        console.log('  ⚠ Expiry cron: treasury wallet not configured (auction listing disabled)');
      }

      return { success: true };
    } catch (error) {
      console.error('Expiry cron init error:', error.message);
      return { success: false, error: error.message };
    }
  }

  start(intervalMs = 3600000) {
    if (this.interval) {
      clearInterval(this.interval);
    }

    // Run immediately, then on interval
    this.runAll();
    this.interval = setInterval(() => this.runAll(), intervalMs);
    console.log(`🔄 Expiry cron started (every ${intervalMs / 60000} minutes)`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('Expiry cron stopped');
  }

  async runAll() {
    if (this.isRunning) {
      console.log('Expiry cron already running, skipping');
      return;
    }

    this.isRunning = true;
    try {
      await this.updateDomainStatuses();
      await this.reclaimExpiredDomains();
      await this.cleanupExpiredV2Slds();
      await this.manageAuctions();
    } catch (error) {
      console.error('Expiry cron error:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Job 1: Update domain statuses based on expiration dates
   */
  async updateDomainStatuses() {
    try {
      const graceDays = config.gracePeriod.days;

      // Set grace_ends_at if not already set
      await query(`
        UPDATE domains
        SET grace_ends_at = expiration_date + INTERVAL '1 day' * $1
        WHERE expiration_date IS NOT NULL
          AND grace_ends_at IS NULL
          AND status != 'released'
      `, [graceDays]);

      // Update to expiring_soon (<=90 days remaining)
      const expiringSoon = await query(`
        UPDATE domains
        SET status = 'expiring_soon', updated_at = NOW()
        WHERE expiration_date IS NOT NULL
          AND expiration_date > NOW()
          AND expiration_date <= NOW() + INTERVAL '90 days'
          AND status = 'active'
          AND reclaimed_at IS NULL
        RETURNING fqdn
      `);

      // Update to grace_period (past expiration, within grace)
      const gracePeriod = await query(`
        UPDATE domains
        SET status = 'grace_period', updated_at = NOW()
        WHERE expiration_date IS NOT NULL
          AND expiration_date <= NOW()
          AND grace_ends_at > NOW()
          AND status IN ('active', 'expiring_soon')
          AND reclaimed_at IS NULL
        RETURNING fqdn
      `);

      // Update to expired (past grace period)
      const expired = await query(`
        UPDATE domains
        SET status = 'expired', updated_at = NOW()
        WHERE grace_ends_at IS NOT NULL
          AND grace_ends_at <= NOW()
          AND status IN ('active', 'expiring_soon', 'grace_period')
          AND reclaimed_at IS NULL
        RETURNING fqdn
      `);

      // Reset back to active if renewed (expiration pushed forward)
      await query(`
        UPDATE domains
        SET status = 'active', updated_at = NOW()
        WHERE expiration_date IS NOT NULL
          AND expiration_date > NOW() + INTERVAL '90 days'
          AND status IN ('expiring_soon', 'grace_period')
          AND reclaimed_at IS NULL
      `);

      const total = expiringSoon.rowCount + gracePeriod.rowCount + expired.rowCount;
      if (total > 0) {
        console.log(`📋 Status updates: ${expiringSoon.rowCount} expiring soon, ${gracePeriod.rowCount} grace period, ${expired.rowCount} expired`);
      }
    } catch (error) {
      console.error('Status update error:', error.message);
    }
  }

  /**
   * Job 2: Reclaim expired domains on-chain
   */
  async reclaimExpiredDomains() {
    if (!this.nftContract) return;

    try {
      const result = await query(`
        SELECT token_id, fqdn, owner_wallet
        FROM domains
        WHERE status = 'expired'
          AND reclaimed_at IS NULL
          AND token_id IS NOT NULL
        ORDER BY grace_ends_at ASC
        LIMIT 10
      `);

      for (const domain of result.rows) {
        try {
          console.log(`🔄 Reclaiming expired domain: ${domain.fqdn} (token ${domain.token_id})`);

          const tx = await this.nftContract.reclaimExpired(domain.token_id);
          console.log(`   ⏳ TX submitted: ${tx.hash}`);
          const receipt = await tx.wait(2);

          if (receipt.status === 1) {
            await query(`
              UPDATE domains
              SET reclaimed_at = NOW(),
                  status = 'reclaimed',
                  owner_wallet = $1,
                  updated_at = NOW()
              WHERE token_id = $2
            `, [config.gracePeriod.treasuryAddress, domain.token_id]);

            console.log(`   ✓ Domain ${domain.fqdn} reclaimed to treasury`);

            await query(`
              INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
              VALUES ('domain_reclaimed_cron', 'domain', $1, $2, $3)
            `, [domain.fqdn, domain.owner_wallet, JSON.stringify({
              tokenId: domain.token_id,
              txHash: receipt.hash,
            })]);
          } else {
            console.error(`   ✗ TX reverted for ${domain.fqdn}`);
          }
        } catch (err) {
          console.error(`   ✗ Reclaim failed for ${domain.fqdn}: ${err.message}`);
        }
      }
    } catch (error) {
      console.error('Reclaim job error:', error.message);
    }
  }

  /**
   * Job 2b: Cleanup expired V2 SLDs
   * V2 SLDs don't have status/grace columns — they simply expire when expiry_time passes.
   * This removes DNS records and deletes the expired slds_v2 rows.
   */
  async cleanupExpiredV2Slds() {
    try {
      const result = await query(`
        SELECT s.id, s.label, s.full_name, s.token_id, s.owner_address, s.expiry_time,
               t.label AS tld_label
        FROM slds_v2 s
        JOIN tlds_v2 t ON s.tld_id = t.id
        WHERE s.expiry_time < NOW()
        LIMIT 20
      `);

      if (result.rows.length === 0) return;

      console.log(`🔄 Found ${result.rows.length} expired V2 SLD(s) to clean up`);

      for (const sld of result.rows) {
        try {
          // Remove from slds_v2
          await query('DELETE FROM slds_v2 WHERE id = $1', [sld.id]);

          // Audit log
          await query(`
            INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
            VALUES ('v2_sld_expired_cleanup', 'sld_v2', $1, $2, $3)
          `, [sld.full_name, sld.owner_address, JSON.stringify({
            tokenId: sld.token_id,
            expiredAt: sld.expiry_time,
            tld: sld.tld_label,
          })]);

          console.log(`   ✓ Cleaned up expired V2 SLD: ${sld.full_name} (expired ${sld.expiry_time})`);
        } catch (err) {
          console.error(`   ✗ Cleanup failed for ${sld.full_name}: ${err.message}`);
        }
      }
    } catch (error) {
      console.error('V2 SLD cleanup error:', error.message);
    }
  }

  /**
   * Job 3: Manage treasury auctions for reclaimed domains
   */
  async manageAuctions() {
    if (!this.marketplaceContract) return;

    try {
      // Sub-job A: List newly reclaimed domains that have no active auction
      await this.listNewReclaims();

      // Sub-job B: Re-list expired auctions with price drop
      await this.relistExpiredAuctions();
    } catch (error) {
      console.error('Auction management error:', error.message);
    }
  }

  async listNewReclaims() {
    try {
      const result = await query(`
        SELECT d.token_id, d.fqdn, d.registration_price_flr
        FROM domains d
        WHERE d.status = 'reclaimed'
          AND d.reclaimed_at IS NOT NULL
          AND d.auction_round = 0
          AND NOT EXISTS (
            SELECT 1 FROM marketplace_listings ml
            WHERE ml.token_id::text = d.token_id::text
              AND ml.status = 'active'
          )
        LIMIT 5
      `);

      for (const domain of result.rows) {
        try {
          const price = domain.registration_price_flr || '0';
          const priceWei = ethers.parseEther(price.toString());
          const duration = config.gracePeriod.auctionDurationDays * 24 * 3600;

          console.log(`🏷️ Listing reclaimed domain: ${domain.fqdn} at ${price} FLR`);

          const tx = await this.marketplaceContract.listAuction(
            domain.token_id,
            priceWei,
            duration
          );
          const receipt = await tx.wait(2);

          if (receipt.status === 1) {
            await query(`
              UPDATE domains
              SET auction_round = 1,
                  current_auction_price = $1,
                  updated_at = NOW()
              WHERE token_id = $2
            `, [price, domain.token_id]);

            console.log(`   ✓ Auction listed for ${domain.fqdn}`);
          }
        } catch (err) {
          console.error(`   ✗ Auction listing failed for ${domain.fqdn}: ${err.message}`);
        }
      }
    } catch (error) {
      console.error('New reclaim listing error:', error.message);
    }
  }

  async relistExpiredAuctions() {
    try {
      // Find reclaimed domains with expired auctions (no sale)
      const result = await query(`
        SELECT d.token_id, d.fqdn, d.registration_price_flr,
               d.current_auction_price, d.auction_round
        FROM domains d
        JOIN marketplace_listings ml ON ml.token_id::text = d.token_id::text
        WHERE d.status = 'reclaimed'
          AND d.auction_round > 0
          AND ml.status = 'cancelled'
          AND ml.end_time < NOW()
          AND NOT EXISTS (
            SELECT 1 FROM marketplace_listings ml2
            WHERE ml2.token_id::text = d.token_id::text
              AND ml2.status = 'active'
          )
        LIMIT 5
      `);

      const dropPct = config.gracePeriod.priceDropPercent;
      const floorPct = config.gracePeriod.priceFloorPercent;

      for (const domain of result.rows) {
        try {
          const originalPrice = parseFloat(domain.registration_price_flr || '0');
          const currentPrice = parseFloat(domain.current_auction_price || originalPrice);
          const floor = originalPrice * (floorPct / 100);

          let newPrice = currentPrice * (1 - dropPct / 100);
          if (newPrice < floor) newPrice = floor;

          const priceWei = ethers.parseEther(newPrice.toFixed(18));
          const duration = config.gracePeriod.auctionDurationDays * 24 * 3600;

          console.log(`🔄 Re-listing ${domain.fqdn}: ${currentPrice} → ${newPrice.toFixed(4)} FLR (round ${domain.auction_round + 1})`);

          const tx = await this.marketplaceContract.listAuction(
            domain.token_id,
            priceWei,
            duration
          );
          const receipt = await tx.wait(2);

          if (receipt.status === 1) {
            await query(`
              UPDATE domains
              SET auction_round = $1,
                  current_auction_price = $2,
                  updated_at = NOW()
              WHERE token_id = $3
            `, [domain.auction_round + 1, newPrice.toFixed(18), domain.token_id]);

            console.log(`   ✓ Re-listed ${domain.fqdn} at ${newPrice.toFixed(4)} FLR`);
          }
        } catch (err) {
          console.error(`   ✗ Re-list failed for ${domain.fqdn}: ${err.message}`);
        }
      }
    } catch (error) {
      console.error('Re-list expired auctions error:', error.message);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      hasOperatorWallet: !!this.operatorWallet,
      hasTreasuryWallet: !!this.treasuryWallet,
      gracePeriodDays: config.gracePeriod.days,
      auctionDurationDays: config.gracePeriod.auctionDurationDays,
      priceDropPercent: config.gracePeriod.priceDropPercent,
      priceFloorPercent: config.gracePeriod.priceFloorPercent,
    };
  }
}

export const expiryCron = new ExpiryCronService();
export default expiryCron;
