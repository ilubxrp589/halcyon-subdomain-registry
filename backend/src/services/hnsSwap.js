import crypto from 'crypto';
import { ethers } from 'ethers';
import config from '../config/index.js';
import { loggers } from '../utils/logger.js';
import { query } from '../db/index.js';
import ftsoService from './ftso.js';
import { hnsWalletService, walletIdFromFlare } from './hnsWallet.js';
import hnsService from './hns.js';

const log = loggers.hns;

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=handshake&vs_currencies=usd';
const HNS_SWAP_WALLET_ID = 'hsr-swap-pool';
const SWAP_FEE_PCT = 2.5;
const PRICE_CACHE_TTL = 30000;   // 30 seconds
const QUOTE_LOCK_TTL = 60000;    // 60 seconds
const STALE_CACHE_MAX = 5 * 60 * 1000; // 5 minutes

class HNSSwapService {
  constructor() {
    this._hnsUsdCache = { price: null, ts: 0 };
    this._activeQuotes = new Map();

    // FLR swap wallet — loaded from env
    this._flrSwapKey = process.env.FLR_SWAP_PRIVATE_KEY || '';
    this._flrSwapWallet = null;
    if (this._flrSwapKey) {
      try {
        const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
        this._flrSwapWallet = new ethers.Wallet(this._flrSwapKey, provider);
        log.info({ address: this._flrSwapWallet.address }, 'FLR swap wallet loaded');
      } catch (err) {
        log.warn({ err }, 'Failed to load FLR swap wallet — sell_hns will be unavailable');
      }
    }
  }

  /**
   * Ensure the HNS swap pool wallet exists in hsd.
   */
  async ensureSwapWallet() {
    try {
      const client = hnsService.walletClient;
      const wallet = client.wallet(HNS_SWAP_WALLET_ID);
      await wallet.getInfo();
      log.info('HNS swap pool wallet exists');
    } catch (err) {
      if (err.message?.includes('not found') || err.code === 404 || err.statusCode === 404) {
        try {
          await hnsService.walletClient.createWallet(HNS_SWAP_WALLET_ID, {
            type: 'pubkeyhash',
            witness: false,
          });
          log.info('Created HNS swap pool wallet');
        } catch (createErr) {
          log.error({ err: createErr }, 'Failed to create swap pool wallet');
        }
      }
    }
  }

  // =========================================================
  //                     PRICING
  // =========================================================

  /**
   * Fetch HNS/USD price from CoinGecko (cached 30s).
   */
  async getHnsUsdPrice() {
    const age = Date.now() - this._hnsUsdCache.ts;

    if (this._hnsUsdCache.price && age < PRICE_CACHE_TTL) {
      return this._hnsUsdCache.price;
    }

    try {
      const response = await fetch(COINGECKO_URL);
      if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);

      const data = await response.json();
      const price = data?.handshake?.usd;

      if (!price || price <= 0) throw new Error('Invalid HNS price from CoinGecko');

      this._hnsUsdCache = { price, ts: Date.now() };
      return price;
    } catch (err) {
      // Return stale cache if within 5 minutes
      if (this._hnsUsdCache.price && age < STALE_CACHE_MAX) {
        log.warn({ err, staleDurationMs: age }, 'CoinGecko fetch failed, returning stale cache');
        return this._hnsUsdCache.price;
      }
      log.error({ err }, 'CoinGecko fetch failed with no usable cache');
      throw err;
    }
  }

  /**
   * Get the full swap rate: HNS/USD, FLR/USD, cross-rates, fee.
   */
  async getSwapRate() {
    const [hnsUsd, flrData] = await Promise.all([
      this.getHnsUsdPrice(),
      ftsoService.getFLRPrice(),
    ]);

    const flrUsd = flrData.price;
    const hnsPerFlr = flrUsd / hnsUsd;
    const flrPerHns = hnsUsd / flrUsd;

    return {
      hnsUsd,
      flrUsd,
      hnsPerFlr: parseFloat(hnsPerFlr.toFixed(6)),
      flrPerHns: parseFloat(flrPerHns.toFixed(6)),
      feePct: SWAP_FEE_PCT,
    };
  }

  /**
   * Generate a locked quote for a swap.
   * @param {string} direction - 'buy_hns' or 'sell_hns'
   * @param {number} amount - HNS amount
   */
  async quoteSwap(direction, amount) {
    if (!['buy_hns', 'sell_hns'].includes(direction)) {
      throw new Error('Invalid direction — must be buy_hns or sell_hns');
    }
    if (!amount || amount <= 0) {
      throw new Error('Amount must be > 0');
    }

    const rate = await this.getSwapRate();
    const quoteId = crypto.randomUUID();
    const expiresAt = Date.now() + QUOTE_LOCK_TTL;

    let flrAmount;
    if (direction === 'buy_hns') {
      // User sends FLR, receives HNS
      flrAmount = (amount * rate.flrPerHns) * (1 + SWAP_FEE_PCT / 100);
    } else {
      // User sends HNS, receives FLR
      flrAmount = (amount * rate.flrPerHns) * (1 - SWAP_FEE_PCT / 100);
    }

    const quote = {
      quoteId,
      direction,
      hnsAmount: amount,
      flrAmount: parseFloat(flrAmount.toFixed(6)),
      hnsUsdRate: rate.hnsUsd,
      flrUsdRate: rate.flrUsd,
      feePct: SWAP_FEE_PCT,
      expiresAt,
    };

    this._activeQuotes.set(quoteId, quote);

    // Auto-cleanup expired quotes
    setTimeout(() => this._activeQuotes.delete(quoteId), QUOTE_LOCK_TTL + 5000);

    return quote;
  }

  // =========================================================
  //                     EXECUTION
  // =========================================================

  /**
   * Execute a buy_hns swap: user sent FLR, we send HNS.
   */
  async executeBuyHns(quoteId, flareAddress, flrTxHash) {
    const quote = this._activeQuotes.get(quoteId);
    if (!quote) return { success: false, error: 'Quote not found or expired' };
    if (Date.now() > quote.expiresAt) {
      this._activeQuotes.delete(quoteId);
      return { success: false, error: 'Quote expired' };
    }
    if (quote.direction !== 'buy_hns') {
      return { success: false, error: 'Quote is not a buy_hns quote' };
    }

    try {
      // Verify FLR tx on chain
      const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
      const tx = await provider.getTransaction(flrTxHash);
      if (!tx) return { success: false, error: 'FLR transaction not found' };

      // Get user's receive address
      const userWalletId = walletIdFromFlare(flareAddress);
      const userWallet = hnsService.walletClient.wallet(userWalletId);
      const account = await userWallet.getAccount('default');
      if (!account?.receiveAddress) return { success: false, error: 'User wallet account not ready' };
      const receiveAddr = account.receiveAddress;

      // Send HNS from swap pool to user
      const swapWallet = hnsService.walletClient.wallet(HNS_SWAP_WALLET_ID);
      const dollarydoos = Math.round(quote.hnsAmount * 1e6);
      const sendResult = await swapWallet.send({ address: receiveAddr, value: dollarydoos });

      // Record in database
      await this._recordSwap(flareAddress, quote, sendResult.hash, flrTxHash);

      this._activeQuotes.delete(quoteId);

      log.info({
        quoteId, flareAddress: flareAddress.slice(0, 10),
        hnsAmount: quote.hnsAmount, hnsTxHash: sendResult.hash,
      }, 'Buy HNS swap completed');

      return { success: true, hnsTxHash: sendResult.hash, hnsAmount: quote.hnsAmount };
    } catch (err) {
      log.error({ err, quoteId }, 'executeBuyHns failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Execute a sell_hns swap: user sent HNS from their wallet, we send FLR.
   */
  async executeSellHns(quoteId, flareAddress, signature) {
    const quote = this._activeQuotes.get(quoteId);
    if (!quote) return { success: false, error: 'Quote not found or expired' };
    if (Date.now() > quote.expiresAt) {
      this._activeQuotes.delete(quoteId);
      return { success: false, error: 'Quote expired' };
    }
    if (quote.direction !== 'sell_hns') {
      return { success: false, error: 'Quote is not a sell_hns quote' };
    }
    if (!this._flrSwapWallet) {
      return { success: false, error: 'FLR swap wallet not configured' };
    }

    try {
      // Send HNS from user's wallet to swap pool
      const userWalletId = walletIdFromFlare(flareAddress);
      await hnsWalletService._unlockWallet(userWalletId, signature);
      const userWallet = hnsService.walletClient.wallet(userWalletId);
      const swapWallet = hnsService.walletClient.wallet(HNS_SWAP_WALLET_ID);
      const swapAccount = await swapWallet.getAccount('default');
      if (!swapAccount?.receiveAddress) return { success: false, error: 'Swap pool account not ready' };

      const dollarydoos = Math.round(quote.hnsAmount * 1e6);
      const hnsResult = await userWallet.send({
        address: swapAccount.receiveAddress,
        value: dollarydoos,
      });

      // Send FLR from swap wallet to user's Flare address
      const flrWei = ethers.parseEther(quote.flrAmount.toString());
      const flrTx = await this._flrSwapWallet.sendTransaction({
        to: flareAddress,
        value: flrWei,
      });
      await flrTx.wait(1);

      // Record in database
      await this._recordSwap(flareAddress, quote, hnsResult.hash, flrTx.hash);

      this._activeQuotes.delete(quoteId);

      log.info({
        quoteId, flareAddress: flareAddress.slice(0, 10),
        flrAmount: quote.flrAmount, flrTxHash: flrTx.hash,
      }, 'Sell HNS swap completed');

      return { success: true, flrTxHash: flrTx.hash, flrAmount: quote.flrAmount };
    } catch (err) {
      log.error({ err, quoteId }, 'executeSellHns failed');
      return { success: false, error: err.message };
    }
  }

  // =========================================================
  //                   POOL & HISTORY
  // =========================================================

  /**
   * Get swap pool balances (admin).
   */
  async getSwapPoolBalance() {
    try {
      const swapWallet = hnsService.walletClient.wallet(HNS_SWAP_WALLET_ID);
      const balance = await swapWallet.getBalance();
      const hnsBalance = (balance.confirmed || 0) / 1e6;

      let flrBalance = 0;
      if (this._flrSwapWallet) {
        const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
        const raw = await provider.getBalance(this._flrSwapWallet.address);
        flrBalance = parseFloat(ethers.formatEther(raw));
      }

      const hnsUsd = await this.getHnsUsdPrice().catch(() => 0);
      const flrData = await ftsoService.getFLRPrice().catch(() => ({ price: 0 }));

      return {
        success: true,
        hnsBalance,
        flrBalance,
        hnsValueUsd: hnsBalance * (hnsUsd || 0),
        flrValueUsd: flrBalance * (flrData.price || 0),
        flrSwapAddress: this._flrSwapWallet?.address || null,
      };
    } catch (err) {
      log.error({ err }, 'getSwapPoolBalance failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Get swap history for a user.
   */
  async getSwapHistory(flareAddress, limit = 20) {
    try {
      const result = await query(
        `SELECT id, direction, hns_amount, flr_amount, hns_usd_rate, flr_usd_rate,
                fee_pct, status, flr_tx_hash, hns_tx_hash, created_at, completed_at
         FROM swaps
         WHERE flare_address = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [flareAddress.toLowerCase(), limit]
      );

      return {
        success: true,
        swaps: result.rows.map(row => ({
          id: row.id,
          direction: row.direction,
          hnsAmount: Number(row.hns_amount) / 1e6,
          flrAmount: row.flr_amount,
          hnsUsdRate: parseFloat(row.hns_usd_rate),
          flrUsdRate: parseFloat(row.flr_usd_rate),
          feePct: parseFloat(row.fee_pct),
          status: row.status,
          flrTxHash: row.flr_tx_hash,
          hnsTxHash: row.hns_tx_hash,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        })),
      };
    } catch (err) {
      log.error({ err }, 'getSwapHistory failed');
      return { success: false, error: err.message, swaps: [] };
    }
  }

  // =========================================================
  //                     INTERNAL
  // =========================================================

  async _recordSwap(flareAddress, quote, hnsTxHash, flrTxHash) {
    try {
      await query(
        `INSERT INTO swaps (flare_address, direction, hns_amount, flr_amount,
          hns_usd_rate, flr_usd_rate, fee_pct, status, flr_tx_hash, hns_tx_hash, quote_id, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10, NOW())`,
        [
          flareAddress.toLowerCase(),
          quote.direction,
          Math.round(quote.hnsAmount * 1e6),
          quote.flrAmount.toString(),
          quote.hnsUsdRate,
          quote.flrUsdRate,
          quote.feePct,
          flrTxHash || null,
          hnsTxHash || null,
          quote.quoteId,
        ]
      );
    } catch (err) {
      log.error({ err }, 'Failed to record swap in database');
    }
  }
}

export const hnsSwapService = new HNSSwapService();
export default hnsSwapService;
