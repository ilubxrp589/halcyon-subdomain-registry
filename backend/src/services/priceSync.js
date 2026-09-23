/**
 * Price Sync Service
 * Automatically syncs the on-chain PriceOracle with real FTSO prices
 */

import { ethers } from 'ethers';
import config from '../config/index.js';
import ftsoService from './ftso.js';
import { query } from '../db/index.js';

// Price Oracle ABI (only what we need)
const PRICE_ORACLE_ABI = [
  "function updatePrice(uint256 _newPrice) external",
  "function flrPriceUSD() view returns (uint256)",
  "function lastUpdated() view returns (uint256)",
  "function owner() view returns (address)"
];

class PriceSyncService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.priceOracle = null;
    this.isRunning = false;
    this.intervalId = null;
    this.lastSyncedPrice = null;
    this.syncCount = 0;
    this.lastSyncTime = null;
    this.lastError = null;

    // Config
    this.syncIntervalMs = 5 * 60 * 1000; // 5 minutes
    this.priceChangeThreshold = 0.01; // 1% change triggers update
    this.minTimeBetweenUpdates = 60 * 1000; // 1 minute minimum
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      // Check required config
      if (!config.flare?.rpcUrl) {
        return { success: false, error: 'FLARE_RPC_URL not configured' };
      }

      if (!config.flare?.privateKey) {
        return { success: false, error: 'BACKEND_PRIVATE_KEY not configured' };
      }

      if (!config.contracts?.priceOracle) {
        return { success: false, error: 'CONTRACT_PRICE_ORACLE not configured' };
      }

      // Setup provider and wallet
      this.provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
      this.wallet = new ethers.Wallet(config.flare.privateKey, this.provider);

      // Setup contract
      this.priceOracle = new ethers.Contract(
        config.contracts.priceOracle,
        PRICE_ORACLE_ABI,
        this.wallet
      );

      // Verify we're the owner
      const owner = await this.priceOracle.owner();
      if (owner.toLowerCase() !== this.wallet.address.toLowerCase()) {
        return {
          success: false,
          error: `Not price oracle owner. Owner: ${owner}, Wallet: ${this.wallet.address}`
        };
      }

      // Get current on-chain price
      const currentPrice = await this.priceOracle.flrPriceUSD();
      this.lastSyncedPrice = parseFloat(ethers.formatEther(currentPrice));

      console.log(`[PriceSync] Initialized`);
      console.log(`  Oracle: ${config.contracts.priceOracle}`);
      console.log(`  Wallet: ${this.wallet.address}`);
      console.log(`  Current price: $${this.lastSyncedPrice.toFixed(6)}/FLR`);

      return { success: true };
    } catch (error) {
      console.error('[PriceSync] Initialization failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start automatic price syncing
   */
  start(intervalMs = null) {
    if (this.isRunning) {
      console.log('[PriceSync] Already running');
      return;
    }

    if (intervalMs) {
      this.syncIntervalMs = intervalMs;
    }

    this.isRunning = true;
    console.log(`[PriceSync] Starting (interval: ${this.syncIntervalMs / 1000}s, threshold: ${this.priceChangeThreshold * 100}%)`);

    // Run immediately
    this.syncPrice();

    // Schedule periodic syncs
    this.intervalId = setInterval(() => {
      this.syncPrice();
    }, this.syncIntervalMs);
  }

  /**
   * Stop automatic price syncing
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[PriceSync] Stopped');
  }

  /**
   * Sync price from FTSO to contract
   */
  async syncPrice() {
    try {
      // Get current FTSO price
      const ftsoData = await ftsoService.getFLRPrice();
      const ftsoPrice = ftsoData.price;

      if (!ftsoPrice || ftsoPrice <= 0) {
        console.log('[PriceSync] Invalid FTSO price, skipping');
        return { synced: false, reason: 'Invalid FTSO price' };
      }

      // Get current on-chain price
      const onChainPriceRaw = await this.priceOracle.flrPriceUSD();
      const onChainPrice = parseFloat(ethers.formatEther(onChainPriceRaw));

      // Calculate price difference
      const priceDiff = Math.abs(ftsoPrice - onChainPrice) / onChainPrice;

      console.log(`[PriceSync] FTSO: $${ftsoPrice.toFixed(6)} | On-chain: $${onChainPrice.toFixed(6)} | Diff: ${(priceDiff * 100).toFixed(2)}%`);

      // Check if update needed
      if (priceDiff < this.priceChangeThreshold) {
        return { synced: false, reason: 'Price within threshold', diff: priceDiff };
      }

      // Check minimum time between updates
      if (this.lastSyncTime && Date.now() - this.lastSyncTime < this.minTimeBetweenUpdates) {
        return { synced: false, reason: 'Too soon since last update' };
      }

      // Update on-chain price
      console.log(`[PriceSync] Updating on-chain price to $${ftsoPrice.toFixed(6)}/FLR...`);

      const newPriceWei = ethers.parseEther(ftsoPrice.toFixed(18));
      const tx = await this.priceOracle.updatePrice(newPriceWei);
      const receipt = await tx.wait();

      this.lastSyncedPrice = ftsoPrice;
      this.lastSyncTime = Date.now();
      this.syncCount++;
      this.lastError = null;

      console.log(`[PriceSync] Price updated! TX: ${receipt.hash}`);

      // Log to history table
      try {
        await query(
          'INSERT INTO price_sync_history (old_price, new_price, tx_hash) VALUES ($1, $2, $3)',
          [onChainPrice, ftsoPrice, receipt.hash]
        );
      } catch (dbError) {
        console.error('[PriceSync] Failed to log to history:', dbError.message);
      }

      return {
        synced: true,
        oldPrice: onChainPrice,
        newPrice: ftsoPrice,
        txHash: receipt.hash
      };

    } catch (error) {
      this.lastError = error.message;
      console.error('[PriceSync] Sync failed:', error.message);
      return { synced: false, error: error.message };
    }
  }

  /**
   * Force sync regardless of threshold
   */
  async forceSync() {
    const oldThreshold = this.priceChangeThreshold;
    this.priceChangeThreshold = 0; // Any change triggers update
    const result = await this.syncPrice();
    this.priceChangeThreshold = oldThreshold;
    return result;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      syncIntervalMs: this.syncIntervalMs,
      threshold: this.priceChangeThreshold,
      priceChangeThreshold: this.priceChangeThreshold,
      lastSyncedPrice: this.lastSyncedPrice,
      currentOnChainPrice: this.lastSyncedPrice,
      currentDifference: 0, // Will be calculated in real-time by getPriceComparison
      lastSyncTime: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : null,
      syncCount: this.syncCount,
      lastError: this.lastError,
      oracleAddress: config.contracts?.priceOracle,
      walletAddress: this.wallet?.address,
    };
  }
}

// Singleton instance
const priceSyncService = new PriceSyncService();

export { priceSyncService as priceSync };
export default priceSyncService;
