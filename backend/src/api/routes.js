import { Router } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { query } from '../db/index.js';
import config from '../config/index.js';
import hnsService from '../services/hns.js';
import hsdClient from '../services/hsdClient.js';
import pdnsService from '../services/pdns.js';
import watcherService from '../services/watcher.js';
import ftsoService from '../services/ftso.js';
import contractListener from '../services/contractListener.js';
import nftService from '../services/nft.js';
import nftStorageService from '../services/nftStorage.js';
import priceSyncService from '../services/priceSync.js';
import imageCache from '../services/imageCache.js';
import fluxMultiGPUService, { getActiveModelConfig, setActiveModel, getAvailableModels, gpuHealthWatcher, WATERMARK_STYLES, DEFAULT_WATERMARK_STYLE, addDomainWatermark } from '../services/fluxMultiGPU.js';
import fs from 'fs';
import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import comfyuiManager from '../services/comfyuiManager.js';
import cacheService from '../services/cache.js';
import gpuFanControl from '../services/gpuFanControl.js';
import { loggers } from '../utils/logger.js';

const log = loggers.api;
import ollamaService from '../services/ollama.js';
import * as artStyles from '../data/styles/index.js';
import auth from '../middleware/auth.js';
import validation from '../middleware/validation.js';
import { findSimilar } from '../utils/fuzzy.js';
import { findDomainByFqdn, verifyDomainOwnership, findTldByName, checkAvailability, findDomainOwnerForAuth } from './domainLookup.js';
import notificationRoutes from './notificationRoutes.js';
import emailRoutes from './emailRoutes.js';
import defaultsRoutes from './defaultsRoutes.js';

const router = Router();

/**
 * Return a safe error response - never leak internal details to clients.
 * Logs the full error server-side, returns a generic message to the user.
 */
function sendError(res, error, statusCode = 500, userMessage) {
  log.error({ err: error, statusCode }, userMessage || 'Request failed');
  const message = userMessage || 'An internal error occurred. Please try again later.';
  res.status(statusCode).json({ error: message });
}

// =============================================================
//                     AUTHENTICATION
// =============================================================

/**
 * Get a nonce for wallet signature authentication
 * GET /auth/nonce?wallet=0x...
 */
router.get('/auth/nonce', auth.getNonce);

/**
 * Verify a signed message (for testing)
 * POST /auth/verify
 * Body: { wallet, signature, nonce }
 */
router.post('/auth/verify', auth.verifyWallet, (req, res) => {
  res.json({
    success: true,
    wallet: req.authenticatedWallet,
    message: 'Authentication successful',
  });
});

// =============================================================
//                      HEALTH & STATUS
// =============================================================

router.get('/health', async (req, res) => {
  const hnsStatus = await hnsService.isReady();
  const dbStatus = await query('SELECT 1').then(() => true).catch(() => false);
  const pdnsStatus = await pdnsService.healthCheck();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus ? 'connected' : 'disconnected',
      hns: hnsStatus.connected ? (hnsStatus.synced ? 'synced' : 'syncing') : 'disconnected',
      hnsHeight: hnsStatus.height,
      dns: pdnsStatus.success ? 'healthy' : 'unhealthy',
    },
  });
});

router.get('/hns/status', async (req, res) => {
  const status = await hnsService.isReady();
  const info = await hnsService.getInfo();
  res.json({ ...status, info: info.data });
});

// =============================================================
//                      WATCHER STATUS
// =============================================================

router.get('/watcher', (req, res) => {
  res.json(watcherService.getStatus());
});

router.get('/watcher/propagation', (req, res) => {
  res.json(watcherService.getPropagationSummary());
});

router.post('/watcher/start', auth.verifyWallet, auth.verifyAdmin, (req, res) => {
  if (watcherService.isRunning) {
    return res.json({ message: 'Watcher already running', status: watcherService.getStatus() });
  }
  watcherService.start();
  res.json({ message: 'Watcher started', status: watcherService.getStatus() });
});

router.post('/watcher/stop', auth.verifyWallet, auth.verifyAdmin, (req, res) => {
  watcherService.stop();
  res.json({ message: 'Watcher stopped' });
});

// =============================================================
//                    CONTRACT LISTENER
// =============================================================

router.get('/listener', (req, res) => {
  res.json(contractListener.getStatus());
});

// =============================================================
//                    GPU STATUS (Public)
// =============================================================

/**
 * GET /gpu/status
 * Get ComfyUI GPU status - generation counts and health
 * Public endpoint for monitoring
 */
router.get('/gpu/status', async (req, res) => {
  try {
    const status = await comfyuiManager.getStatus();
    res.json(status);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /gpu/counts
 * Get generation counts only (lightweight)
 */
router.get('/gpu/counts', (req, res) => {
  try {
    const counts = comfyuiManager.getGenerationCounts();
    res.json(counts);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /gpu/fans
 * Get GPU fan control status
 */
router.get('/gpu/fans', async (req, res) => {
  try {
    const status = await gpuFanControl.getStatus();
    res.json(status);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /gpu/fans/speed
 * Set GPU fan speed manually (admin only)
 * Body: { speed: 0-100 }
 */
router.post('/gpu/fans/speed', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    const { speed } = req.body;
    if (typeof speed !== 'number' || speed < 0 || speed > 100) {
      return res.status(400).json({ error: 'Speed must be a number between 0 and 100' });
    }
    const success = await gpuFanControl.setFanSpeed(speed);
    res.json({ success, speed });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /gpu/fans/working
 * Set fans to working speed (100%)
 */
router.post('/gpu/fans/working', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    const success = await gpuFanControl.forceWorkingSpeed();
    res.json({ success, speed: 100 });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /gpu/fans/idle
 * Set fans to idle speed (10%)
 */
router.post('/gpu/fans/idle', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    const success = await gpuFanControl.forceIdleSpeed();
    res.json({ success, speed: 10 });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /gpu/fans/auto
 * Return fans to automatic control
 */
router.post('/gpu/fans/auto', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    const success = await gpuFanControl.disableManualControl();
    res.json({ success, mode: 'automatic' });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/listener/catchup', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  let { fromBlock } = req.body;

  // Validate fromBlock parameter
  if (fromBlock !== undefined) {
    fromBlock = parseInt(fromBlock, 10);
    if (isNaN(fromBlock) || fromBlock < 0) {
      return res.status(400).json({ error: 'Invalid fromBlock parameter' });
    }
  } else {
    fromBlock = 0;
  }

  const result = await contractListener.catchupEvents(fromBlock);
  res.json(result);
});

// =============================================================
//                         TLDs
// =============================================================

router.get('/tlds', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        t.id,
        t.name,
        t.is_active,
        t.registration_open,
        t.description,
        t.icon_url,
        t.base_price_usd,
        t.price_multiplier_ultra,
        t.price_multiplier_premium,
        t.price_multiplier_standard_plus,
        t.renewal_price_multiplier,
        t.display_order,
        t.featured,
        (SELECT COUNT(*) FROM domains d WHERE d.tld_id = t.id) +
        COALESCE((SELECT COUNT(*) FROM slds_v2 s JOIN tlds_v2 t2 ON s.tld_id = t2.id WHERE t2.label = t.name AND s.expiry_time > NOW()), 0) as domain_count
      FROM tlds t
      WHERE t.is_active = true
      ORDER BY t.display_order ASC, t.name ASC
    `);

    // Get current FLR price for USD conversion
    let flrPriceUSD = 0.05;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUSD = priceData.price || 0.05;
    } catch (e) {
      log.warn({ err: e }, 'Failed to get FLR price for TLD list, using fallback');
    }

    // Add computed pricing tiers to each TLD
    const tldsWithPricing = result.rows.map(tld => {
      const basePriceUSD = parseFloat(tld.base_price_usd) || 10;
      return {
        ...tld,
        pricing: {
          flrPriceUSD,
          tiers: {
            ultra_premium: {
              criteria: '1 character',
              priceUSD: basePriceUSD * (parseFloat(tld.price_multiplier_ultra) || 50),
              priceFLR: Math.ceil((basePriceUSD * (parseFloat(tld.price_multiplier_ultra) || 50)) / flrPriceUSD),
            },
            premium: {
              criteria: '2 characters',
              priceUSD: basePriceUSD * (parseFloat(tld.price_multiplier_premium) || 20),
              priceFLR: Math.ceil((basePriceUSD * (parseFloat(tld.price_multiplier_premium) || 20)) / flrPriceUSD),
            },
            standard_plus: {
              criteria: '3 characters',
              priceUSD: basePriceUSD * (parseFloat(tld.price_multiplier_standard_plus) || 8),
              priceFLR: Math.ceil((basePriceUSD * (parseFloat(tld.price_multiplier_standard_plus) || 8)) / flrPriceUSD),
            },
            standard: {
              criteria: '4+ characters',
              priceUSD: basePriceUSD,
              priceFLR: Math.ceil(basePriceUSD / flrPriceUSD),
            },
          },
        },
      };
    });

    res.json({ tlds: tldsWithPricing, flrPriceUSD });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/tlds/owned', async (req, res) => {
  try {
    const owned = await hnsService.getOwnedTLDs();
    res.json(owned);
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                   TLD STAKING (V2)
// =============================================================

/**
 * GET /tld/verify/:tldLabel?address=0x...
 * Pre-validation for FDC staking: checks HNS state, expiry, and flr: TXT record.
 */
router.get('/tld/verify/:tldLabel', async (req, res) => {
  try {
    const { tldLabel } = req.params;
    const { address } = req.query;

    if (!tldLabel || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(tldLabel.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid TLD label' });
    }

    // If address provided, do full ownership verification
    if (address) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid Flare address' });
      }
      const result = await hsdClient.verifyTldOwnership(tldLabel, address);
      return res.json(result);
    }

    // Otherwise, return name info with TXT records
    const info = await hsdClient.getNameInfo(tldLabel);
    if (!info.success) {
      return res.status(404).json({ error: info.error });
    }

    const flareAddress = await hsdClient.getFlareAddress(tldLabel);
    res.json({
      ...info.data,
      flareAddress,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /tld/txt/:tldLabel
 * Get all TXT records for a TLD.
 */
router.get('/tld/txt/:tldLabel', async (req, res) => {
  try {
    const { tldLabel } = req.params;
    const records = await hsdClient.getTxtRecords(tldLabel);
    res.json({ tldLabel, records });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                        SEARCH
// =============================================================

router.get('/search', async (req, res) => {
  const { subdomain, tld } = req.query;

  if (!subdomain || !tld) {
    return res.status(400).json({ error: 'subdomain and tld are required' });
  }

  try {
    // Validate subdomain format using validation middleware
    const subdomainResult = validation.isValidSubdomain(subdomain);
    if (!subdomainResult.valid) {
      return res.json({
        available: false,
        error: subdomainResult.error,
        subdomain,
        tld,
      });
    }

    // Validate TLD exists
    const tldResult = await validation.isValidTLD(tld);
    if (!tldResult.valid) {
      return res.json({
        available: false,
        error: tldResult.error,
        subdomain,
        tld,
      });
    }

    // Build FQDN from validated values
    const fqdn = `${subdomainResult.normalized}.${tldResult.normalized}`;
    const avail = await checkAvailability(fqdn);

    if (!avail.available) {
      const owner = avail.owner;
      return res.json({
        available: false,
        subdomain,
        tld,
        fqdn,
        owner: `${owner.slice(0, 6)}...${owner.slice(-4)}`,
        tokenId: avail.tokenId,
      });
    }

    // Check for pending purchase
    const pendingCheck = await query(
      "SELECT wallet_address FROM pending_purchases WHERE fqdn = $1 AND status = 'pending'",
      [fqdn]
    );

    if (pendingCheck.rows.length > 0) {
      return res.json({
        available: false,
        subdomain,
        tld,
        fqdn,
        status: 'pending_registration',
      });
    }

    // Get per-TLD pricing
    const length = subdomain.length;
    let pricing;

    try {
      // Get TLD pricing config (V1 first, V2 fallback)
      let tldPricingRow;
      if (!tldResult.isV2) {
        const tldConfig = await query(
          `SELECT base_price_usd, price_multiplier_ultra, price_multiplier_premium,
                  price_multiplier_standard_plus, renewal_price_multiplier
           FROM tlds WHERE id = $1`,
          [tldResult.tldId]
        );
        tldPricingRow = tldConfig.rows[0];
      }

      if (!tldPricingRow) {
        // Try V2 pricing
        const v2Pricing = await query(
          'SELECT length_prices FROM tld_pricing_v2 WHERE tld_id = $1',
          [tldResult.tldId]
        );
        if (v2Pricing.rows.length > 0 && v2Pricing.rows[0].length_prices) {
          const lp = v2Pricing.rows[0].length_prices;
          tldPricingRow = {
            base_price_usd: (lp[3] || 1000) / 100,
            price_multiplier_ultra: lp[0] ? lp[0] / (lp[3] || 1000) : 50,
            price_multiplier_premium: lp[1] ? lp[1] / (lp[3] || 1000) : 20,
            price_multiplier_standard_plus: lp[2] ? lp[2] / (lp[3] || 1000) : 8,
          };
        }
      }

      // Get FLR/USD rate
      let flrPriceUSD = 0.05;
      let priceSource = 'fallback';
      let priceTimestamp = null;

      try {
        const priceData = await ftsoService.getFLRPrice();
        flrPriceUSD = priceData.price || 0.05;
        priceSource = priceData.source || 'ftso';
        priceTimestamp = priceData.timestamp;
      } catch (e) {
        log.warn({ err: e }, 'FTSO price error, using fallback');
      }

      // Calculate tier and price based on TLD config
      const tldPricing = tldPricingRow || {};
      const basePriceUSD = parseFloat(tldPricing.base_price_usd) || 10;
      const multiplierUltra = parseFloat(tldPricing.price_multiplier_ultra) || 50;
      const multiplierPremium = parseFloat(tldPricing.price_multiplier_premium) || 20;
      const multiplierStandardPlus = parseFloat(tldPricing.price_multiplier_standard_plus) || 8;

      let tier, priceUSD;
      if (length === 1) {
        tier = 'ultra_premium';
        priceUSD = basePriceUSD * multiplierUltra;
      } else if (length === 2) {
        tier = 'premium';
        priceUSD = basePriceUSD * multiplierPremium;
      } else if (length === 3) {
        tier = 'standard_plus';
        priceUSD = basePriceUSD * multiplierStandardPlus;
      } else {
        tier = 'standard';
        priceUSD = basePriceUSD;
      }

      // For testnet, use 1 FLR for easy testing
      const isTestnet = process.env.FLARE_CHAIN_ID === '114' || !process.env.FLARE_CHAIN_ID;
      const priceFLR = isTestnet ? 1 : Math.ceil(priceUSD / flrPriceUSD);

      pricing = {
        tier,
        priceUSD: isTestnet ? priceFLR * flrPriceUSD : priceUSD,
        priceFLR,
        flrPriceUSD,
        priceSource,
        priceTimestamp,
        basePriceUSD,
      };
    } catch (e) {
      // Fallback pricing
      log.warn({ err: e }, 'Pricing error, using fallback');
      const tier = length === 1 ? 'ultra_premium' : length === 2 ? 'premium' : length === 3 ? 'standard_plus' : 'standard';
      pricing = {
        tier,
        priceUSD: 1 * 0.05,
        priceFLR: 1,
        flrPriceUSD: 0.05,
        priceSource: 'fallback',
      };
    }

    res.json({
      available: true,
      subdomain,
      tld,
      fqdn,
      tier: pricing.tier,
      price: {
        usd: pricing.priceUSD,
        flr: pricing.priceFLR,
        flrPriceUSD: pricing.flrPriceUSD,
        source: pricing.priceSource,
        timestamp: pricing.priceTimestamp,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/search/bulk', async (req, res) => {
  const { subdomains, tld } = req.body;

  if (!Array.isArray(subdomains) || !tld) {
    return res.status(400).json({ error: 'subdomains array and tld are required' });
  }

  if (subdomains.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 subdomains per request' });
  }

  try {
    const results = await Promise.all(
      subdomains.map(async (subdomain) => {
        const fqdn = `${subdomain.toLowerCase()}.${tld.toLowerCase()}`;
        const avail = await checkAvailability(fqdn);

        const available = avail.available;
        const length = subdomain.length;
        let tier = length === 1 ? 'ultra_premium' : length === 2 ? 'premium' : length === 3 ? 'standard_plus' : 'standard';

        return {
          subdomain,
          fqdn,
          available,
          tier,
        };
      })
    );

    res.json({ results });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                       PRICING
// =============================================================

router.get('/pricing', async (req, res) => {
  try {
    const { tld: tldName } = req.query;

    // Get real-time FLR price from FTSO oracle
    let flrPriceUSD, priceSource, priceTimestamp;

    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUSD = priceData.price;
      priceSource = priceData.source || (priceData.cached ? 'cached' : 'unknown');
      priceTimestamp = priceData.timestamp;
    } catch (e) {
      log.warn({ err: e }, 'FTSO pricing error, using fallback');
      flrPriceUSD = 0.05;
      priceSource = 'fallback';
      priceTimestamp = null;
    }

    // Get TLD-specific pricing if TLD is specified
    let tldPricing = {
      base_price_usd: 10,
      price_multiplier_ultra: 50,
      price_multiplier_premium: 20,
      price_multiplier_standard_plus: 8,
      renewal_price_multiplier: 0.8,
    };

    if (tldName) {
      const tldResult = await query(
        `SELECT base_price_usd, price_multiplier_ultra, price_multiplier_premium,
                price_multiplier_standard_plus, renewal_price_multiplier
         FROM tlds WHERE name = $1 AND is_active = true`,
        [tldName.toLowerCase()]
      );
      if (tldResult.rows.length > 0) {
        tldPricing = tldResult.rows[0];
      } else {
        // Fallback: check V2 tlds_v2 + tld_pricing_v2
        const v2Tld = await findTldByName(tldName);
        if (v2Tld && v2Tld.source === 'v2' && v2Tld.length_prices) {
          // V2 uses per-length price array (USD cents): [1char, 2char, ..., 10char]
          const lp = v2Tld.length_prices;
          tldPricing = {
            base_price_usd: (lp[3] || 1000) / 100,                    // 4+ char base
            price_multiplier_ultra: lp[0] ? lp[0] / (lp[3] || 1000) : 50,
            price_multiplier_premium: lp[1] ? lp[1] / (lp[3] || 1000) : 20,
            price_multiplier_standard_plus: lp[2] ? lp[2] / (lp[3] || 1000) : 8,
            renewal_price_multiplier: 0.8,
          };
        }
      }
    }

    const basePriceUSD = parseFloat(tldPricing.base_price_usd) || 10;
    const multiplierUltra = parseFloat(tldPricing.price_multiplier_ultra) || 50;
    const multiplierPremium = parseFloat(tldPricing.price_multiplier_premium) || 20;
    const multiplierStandardPlus = parseFloat(tldPricing.price_multiplier_standard_plus) || 8;
    const renewalMultiplier = parseFloat(tldPricing.renewal_price_multiplier) || 0.8;

    // For testnet, use 1 FLR for easy testing
    const isTestnet = process.env.FLARE_CHAIN_ID === '114' || !process.env.FLARE_CHAIN_ID;

    const calculateTier = (priceUSD) => {
      const priceFLR = isTestnet ? 1 : Math.ceil(priceUSD / flrPriceUSD);
      const renewalUSD = priceUSD * renewalMultiplier;
      const renewalFLR = isTestnet ? 1 : Math.ceil(renewalUSD / flrPriceUSD);
      return {
        priceUSD: isTestnet ? priceFLR * flrPriceUSD : priceUSD,
        priceFLR,
        renewalUSD: isTestnet ? renewalFLR * flrPriceUSD : renewalUSD,
        renewalFLR,
      };
    };

    const tiers = {
      ultra_premium: {
        criteria: '1 character',
        ...calculateTier(basePriceUSD * multiplierUltra),
      },
      premium: {
        criteria: '2 characters',
        ...calculateTier(basePriceUSD * multiplierPremium),
      },
      standard_plus: {
        criteria: '3 characters',
        ...calculateTier(basePriceUSD * multiplierStandardPlus),
      },
      standard: {
        criteria: '4+ characters',
        ...calculateTier(basePriceUSD),
      },
    };

    res.json({
      flrPriceUSD,
      priceSource,
      priceTimestamp,
      tiers,
      tld: tldName || null,
      basePriceUSD,
      isTestnet,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get bulk pricing with bonus credits (instead of discounts)
 * POST /pricing/bulk
 * Body: { tld: string, subdomains: string[] }
 * Returns: { items: [...], subtotal, total, bonusCredits, count }
 *
 * Bonus Credits System:
 * - 2 domains = 15 free preview credits
 * - 3 domains = 20 free preview credits
 * - 4 domains = 25 free preview credits
 * - 5 domains = 30 free preview credits (max)
 */
router.post('/pricing/bulk', async (req, res) => {
  try {
    const { tld: tldName, subdomains } = req.body;

    if (!tldName || !Array.isArray(subdomains) || subdomains.length === 0) {
      return res.status(400).json({ error: 'TLD and subdomains array required' });
    }

    if (subdomains.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 domains per bulk registration' });
    }

    // Check if bulk registration is enabled
    const settingResult = await query(
      `SELECT value FROM system_settings WHERE key = 'bulk_registration_enabled'`
    );
    const bulkEnabled = settingResult.rows.length === 0 || settingResult.rows[0].value === 'true';

    if (!bulkEnabled) {
      return res.status(400).json({ error: 'Bulk registration is currently disabled' });
    }

    // Get real-time FLR price from FTSO oracle
    let flrPriceUSD;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUSD = priceData.price;
    } catch (e) {
      log.warn({ err: e }, 'FTSO pricing error, using fallback');
      flrPriceUSD = 0.05;
    }

    // Get TLD-specific pricing
    let tldPricing = {
      base_price_usd: 10,
      price_multiplier_ultra: 50,
      price_multiplier_premium: 20,
      price_multiplier_standard_plus: 8,
    };

    const tldResult = await query(
      `SELECT base_price_usd, price_multiplier_ultra, price_multiplier_premium,
              price_multiplier_standard_plus
       FROM tlds WHERE name = $1 AND is_active = true`,
      [tldName.toLowerCase()]
    );

    if (tldResult.rows.length > 0) {
      tldPricing = tldResult.rows[0];
    } else {
      // Fallback: check V2 tlds_v2 + tld_pricing_v2
      const v2Tld = await findTldByName(tldName);
      if (v2Tld && v2Tld.source === 'v2' && v2Tld.length_prices) {
        const lp = v2Tld.length_prices;
        tldPricing = {
          base_price_usd: (lp[3] || 1000) / 100,
          price_multiplier_ultra: lp[0] ? lp[0] / (lp[3] || 1000) : 50,
          price_multiplier_premium: lp[1] ? lp[1] / (lp[3] || 1000) : 20,
          price_multiplier_standard_plus: lp[2] ? lp[2] / (lp[3] || 1000) : 8,
        };
      }
    }

    const basePriceUSD = parseFloat(tldPricing.base_price_usd) || 10;
    const multiplierUltra = parseFloat(tldPricing.price_multiplier_ultra) || 50;
    const multiplierPremium = parseFloat(tldPricing.price_multiplier_premium) || 20;
    const multiplierStandardPlus = parseFloat(tldPricing.price_multiplier_standard_plus) || 8;

    const isTestnet = process.env.FLARE_CHAIN_ID === '114' || !process.env.FLARE_CHAIN_ID;

    // Calculate price for each subdomain
    const items = subdomains.map(subdomain => {
      const len = subdomain.length;
      let tier, multiplier;

      if (len === 1) {
        tier = 'ultra_premium';
        multiplier = multiplierUltra;
      } else if (len === 2) {
        tier = 'premium';
        multiplier = multiplierPremium;
      } else if (len === 3) {
        tier = 'standard_plus';
        multiplier = multiplierStandardPlus;
      } else {
        tier = 'standard';
        multiplier = 1;
      }

      const priceUSD = basePriceUSD * multiplier;
      const priceFLR = isTestnet ? 1 : Math.ceil(priceUSD / flrPriceUSD);

      return {
        subdomain,
        tier,
        priceUSD: isTestnet ? priceFLR * flrPriceUSD : priceUSD,
        priceFLR,
      };
    });

    // Calculate totals (no discount - total equals subtotal)
    const totalUSD = items.reduce((sum, item) => sum + item.priceUSD, 0);
    const totalFLR = items.reduce((sum, item) => sum + item.priceFLR, 0);

    // Calculate bonus credits based on domain count (using unified credit calculation)
    const bonusCredits = nftService.calculatePurchaseCredits(subdomains.length);

    res.json({
      items,
      subtotal: {
        usd: Math.round(totalUSD * 100) / 100,
        flr: totalFLR,
      },
      total: {
        usd: Math.round(totalUSD * 100) / 100,
        flr: totalFLR,
      },
      bonusCredits,
      count: subdomains.length,
      tld: tldName,
      flrPriceUSD,
      isTestnet,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get bulk pricing for multiple TLDs (multi-TLD cart)
 * POST /pricing/bulk-multi
 * Body: { items: Array<{ subdomain: string, tld: string }> }
 * Returns: { items: [...], subtotal, total, bonusCredits, count }
 */
router.post('/pricing/bulk-multi', async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array required' });
    }

    if (items.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 domains per bulk registration' });
    }

    // Check if bulk registration is enabled
    const settingResult = await query(
      `SELECT value FROM system_settings WHERE key = 'bulk_registration_enabled'`
    );
    const bulkEnabled = settingResult.rows.length === 0 || settingResult.rows[0].value === 'true';

    if (!bulkEnabled) {
      return res.status(400).json({ error: 'Bulk registration is currently disabled' });
    }

    // Get real-time FLR price from FTSO oracle
    let flrPriceUSD;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUSD = priceData.price;
    } catch (e) {
      log.warn({ err: e }, 'FTSO pricing error, using fallback');
      flrPriceUSD = 0.05;
    }

    const isTestnet = process.env.FLARE_CHAIN_ID === '114' || !process.env.FLARE_CHAIN_ID;

    // Get all unique TLDs
    const uniqueTlds = [...new Set(items.map(item => item.tld.toLowerCase()))];

    // Fetch pricing for all TLDs at once
    const tldPricingMap = {};
    for (const tldName of uniqueTlds) {
      const tldResult = await query(
        `SELECT base_price_usd, price_multiplier_ultra, price_multiplier_premium,
                price_multiplier_standard_plus
         FROM tlds WHERE name = $1 AND is_active = true`,
        [tldName]
      );

      if (tldResult.rows.length > 0) {
        tldPricingMap[tldName] = tldResult.rows[0];
      } else {
        // Fallback: check V2 tlds_v2 + tld_pricing_v2
        const v2Tld = await findTldByName(tldName);
        if (v2Tld && v2Tld.source === 'v2' && v2Tld.length_prices) {
          const lp = v2Tld.length_prices;
          tldPricingMap[tldName] = {
            base_price_usd: (lp[3] || 1000) / 100,
            price_multiplier_ultra: lp[0] ? lp[0] / (lp[3] || 1000) : 50,
            price_multiplier_premium: lp[1] ? lp[1] / (lp[3] || 1000) : 20,
            price_multiplier_standard_plus: lp[2] ? lp[2] / (lp[3] || 1000) : 8,
          };
        } else {
          // Default pricing
          tldPricingMap[tldName] = {
            base_price_usd: 10,
            price_multiplier_ultra: 50,
            price_multiplier_premium: 20,
            price_multiplier_standard_plus: 8,
          };
        }
      }
    }

    // Calculate price for each item
    const pricedItems = items.map(item => {
      const subdomain = item.subdomain.toLowerCase();
      const tld = item.tld.toLowerCase();
      const tldPricing = tldPricingMap[tld];

      const basePriceUSD = parseFloat(tldPricing.base_price_usd) || 10;
      const multiplierUltra = parseFloat(tldPricing.price_multiplier_ultra) || 50;
      const multiplierPremium = parseFloat(tldPricing.price_multiplier_premium) || 20;
      const multiplierStandardPlus = parseFloat(tldPricing.price_multiplier_standard_plus) || 8;

      const len = subdomain.length;
      let tier, multiplier;

      if (len === 1) {
        tier = 'ultra_premium';
        multiplier = multiplierUltra;
      } else if (len === 2) {
        tier = 'premium';
        multiplier = multiplierPremium;
      } else if (len === 3) {
        tier = 'standard_plus';
        multiplier = multiplierStandardPlus;
      } else {
        tier = 'standard';
        multiplier = 1;
      }

      const priceUSD = basePriceUSD * multiplier;
      const priceFLR = isTestnet ? 1 : Math.ceil(priceUSD / flrPriceUSD);

      return {
        subdomain,
        tld,
        tier,
        priceUSD: isTestnet ? priceFLR * flrPriceUSD : priceUSD,
        priceFLR,
      };
    });

    // Calculate totals
    const totalUSD = pricedItems.reduce((sum, item) => sum + item.priceUSD, 0);
    const totalFLR = pricedItems.reduce((sum, item) => sum + item.priceFLR, 0);

    // Calculate bonus credits based on domain count (using unified credit calculation)
    const bonusCredits = nftService.calculatePurchaseCredits(items.length);

    res.json({
      items: pricedItems,
      subtotal: {
        usd: Math.round(totalUSD * 100) / 100,
        flr: totalFLR,
      },
      total: {
        usd: Math.round(totalUSD * 100) / 100,
        flr: totalFLR,
      },
      bonusCredits,
      count: items.length,
      flrPriceUSD,
      isTestnet,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Complete bulk purchase - add bonus credits and generate default NFTs
 * POST /bulk-purchase/complete
 * Body: { wallet: string, domains: string[], txHash: string }
 * Credits are calculated automatically based on domain count
 */
router.post('/bulk-purchase/complete', async (req, res) => {
  try {
    const { wallet, domains, txHash } = req.body;

    if (!wallet || !Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ error: 'Wallet and domains array required' });
    }

    const walletLower = wallet.toLowerCase();

    // Calculate credits based on domain count (new credit system)
    const creditsToAward = nftService.calculatePurchaseCredits(domains.length);

    // Sync domains from blockchain to database
    for (const fqdn of domains) {
      try {
        const [subdomain, tld] = fqdn.toLowerCase().split('.');
        if (!subdomain || !tld) continue;

        // Check if domain already exists
        const existing = await query('SELECT id FROM domains WHERE fqdn = $1', [fqdn.toLowerCase()]);
        if (existing.rows.length > 0) {
          console.log(`[Bulk] Domain ${fqdn} already in database`);
          continue;
        }

        // Get TLD ID
        const tldResult = await query('SELECT id FROM tlds WHERE name = $1', [tld]);
        const tldId = tldResult.rows.length > 0 ? tldResult.rows[0].id : null;

        // Get token ID from blockchain
        let tokenId = null;
        try {
          const { ethers } = await import('ethers');
          const provider = new ethers.JsonRpcProvider(process.env.FLARE_RPC_URL);
          const nftAbi = ['function domainToTokenId(bytes32) view returns (uint256)'];
          const nft = new ethers.Contract(process.env.CONTRACT_NFT, nftAbi, provider);
          const domainHash = ethers.keccak256(ethers.toUtf8Bytes(fqdn.toLowerCase()));
          tokenId = await nft.domainToTokenId(domainHash);
          tokenId = Number(tokenId);
          if (tokenId === 0) tokenId = null;
        } catch (e) {
          console.warn(`[Bulk] Could not get token ID for ${fqdn}:`, e.message);
        }

        // Determine tier based on subdomain length
        let tier = 'standard';
        if (subdomain.length === 1) tier = 'ultra_premium';
        else if (subdomain.length === 2) tier = 'premium';
        else if (subdomain.length === 3) tier = 'standard_plus';

        // Insert domain into database with nft_status = 'placeholder'
        await query(`
          INSERT INTO domains (token_id, subdomain, tld_id, fqdn, owner_wallet, original_buyer,
                              registration_price_flr, registration_date, status, tier, metadata_uri, nft_status)
          VALUES ($1, $2, $3, $4, $5, $5, 1, NOW(), 'active', $6, $7, 'placeholder')
          ON CONFLICT (fqdn) DO NOTHING
        `, [tokenId, subdomain, tldId, fqdn.toLowerCase(), walletLower, tier, `pending:bulk:${fqdn.toLowerCase()}`]);

        console.log(`[Bulk] Synced domain ${fqdn} (token ${tokenId}) to database with placeholder status`);
      } catch (syncError) {
        log.warn({ err: syncError, fqdn }, 'Bulk domain sync failed');
      }
    }

    // Add bonus credits to the wallet
    if (creditsToAward > 0) {
      try {
        // Add bonus credits
        await query(`
          INSERT INTO preview_credits (wallet_address, used_count, bonus_credits, updated_at)
          VALUES ($1, 0, $2, NOW())
          ON CONFLICT (wallet_address) DO UPDATE SET
            bonus_credits = COALESCE(preview_credits.bonus_credits, 0) + $2,
            updated_at = NOW()
        `, [walletLower, creditsToAward]);

        // Log to credit_transactions table (new audit trail)
        await nftService.logCreditTransaction(
          walletLower,
          creditsToAward,
          'purchase_bonus',
          `bulk:${domains.length}:${domains.join(',')}`.slice(0, 255),
          txHash || null
        );

        // Also log to credit_audit_log for backwards compatibility
        try {
          await query(`
            INSERT INTO credit_audit_log (wallet_address, credit_type, amount, reason, tx_hash, created_at)
            VALUES ($1, 'preview_bonus', $2, 'bulk_registration', $3, NOW())
          `, [walletLower, creditsToAward, txHash || null]);
        } catch (logError) {
          console.warn('Failed to log bonus credit addition:', logError.message);
        }

        console.log(`[Bulk] Added ${creditsToAward} credits to ${walletLower} for ${domains.length} domains`);
      } catch (creditError) {
        log.error({ err: creditError }, 'Failed to add bonus credits');
      }
    }

    // Generate default NFT metadata for each domain (async, don't wait)
    // The actual NFT generation will happen in the background
    for (const fqdn of domains) {
      try {
        const [subdomain, tld] = fqdn.split('.');
        if (subdomain && tld) {
          // Queue default NFT generation (don't await to keep response fast)
          nftService.generateDefaultNFT(subdomain, tld).then(result => {
            if (result.success) {
              console.log(`[Bulk] Generated default NFT for ${fqdn}: ${result.metadataURI}`);
              // Update the domain record with the metadata URI
              query(`
                UPDATE domains SET
                  metadata_uri = $2,
                  nft_image_cid = $3,
                  nft_metadata_cid = $4,
                  updated_at = NOW()
                WHERE fqdn = $1
              `, [fqdn, result.metadataURI, result.imageCID, result.metadataCID]).catch(err => {
                console.warn(`Failed to update domain ${fqdn} with NFT data:`, err.message);
              });
            } else {
              console.warn(`[Bulk] Failed to generate default NFT for ${fqdn}:`, result.error);
            }
          }).catch(err => {
            console.warn(`[Bulk] Default NFT generation error for ${fqdn}:`, err.message);
          });
        }
      } catch (nftError) {
        console.warn(`Error processing NFT for ${fqdn}:`, nftError.message);
      }
    }

    res.json({
      success: true,
      message: `Bulk purchase completed for ${domains.length} domains`,
      creditsAwarded: creditsToAward,
      bonusCreditsAdded: creditsToAward, // backwards compatibility
      domains,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get feature flags (public endpoint)
 * GET /features
 */
router.get('/features', async (req, res) => {
  try {
    const result = await query(
      `SELECT key, value FROM system_settings WHERE key IN ('bulk_registration_enabled')`
    );

    const features = {
      bulkRegistration: true, // Default enabled
    };

    for (const row of result.rows) {
      if (row.key === 'bulk_registration_enabled') {
        features.bulkRegistration = row.value === 'true';
      }
    }

    res.json(features);
  } catch (error) {
    // If table doesn't exist, return defaults
    res.json({
      bulkRegistration: true,
    });
  }
});

// =============================================================
//                       STATS
// =============================================================

router.get('/stats', async (req, res) => {
  try {
    const [tldsV1, tldsV2, domainsV1, domainsV2, recentV1, recentV2] = await Promise.all([
      query('SELECT COUNT(*) FROM tlds WHERE is_active = true'),
      query('SELECT COUNT(*) FROM tlds_v2'),
      query('SELECT COUNT(*) FROM domains'),
      query('SELECT COUNT(*) FROM slds_v2'),
      query('SELECT fqdn, created_at FROM domains ORDER BY created_at DESC LIMIT 10'),
      query('SELECT full_name AS fqdn, created_at FROM slds_v2 ORDER BY created_at DESC LIMIT 10'),
    ]);

    // Combine and sort recent registrations
    const allRecent = [...recentV1.rows, ...recentV2.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

    res.json({
      tldCount: parseInt(tldsV1.rows[0].count) + parseInt(tldsV2.rows[0].count),
      totalDomains: parseInt(domainsV1.rows[0].count) + parseInt(domainsV2.rows[0].count),
      recentRegistrations: allRecent,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                    DOMAIN DETAILS
// =============================================================

router.get('/domains/:fqdn', async (req, res) => {
  const { fqdn } = req.params;

  try {
    const domain = await findDomainByFqdn(fqdn);

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.json({ domain });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                   FLR ADDRESS RESOLUTION
// Enables sending FLR to username.cryptofans instead of 0x...
// =============================================================

// HSR Resolver contract ABI (minimal for resolution)
const HSR_RESOLVER_ABI = [
  "function resolveAddress(string calldata fqdn) external view returns (address)",
  "function addr(bytes32 node) external view returns (address)",
  "function text(bytes32 node, string calldata key) external view returns (string memory)",
];

// HSR Registry contract ABI (minimal)
const HSR_REGISTRY_ABI = [
  "function getRecordByFQDN(string calldata fqdn) external view returns (address owner, address resolver, uint256 tokenId)",
  "function computeNamehash(string calldata fqdn) external pure returns (bytes32)",
];

// SubdomainNFT ABI (for ownerOf lookups)
const HSR_NFT_ABI = [
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

// Contract addresses (Coston2)
const HSR_RESOLVER_ADDRESS = process.env.HSR_RESOLVER_ADDRESS || "0x7C0eA7094Be2caCB238D042b386B11ec24892Fb1";
const HSR_REGISTRY_ADDRESS = process.env.HSR_REGISTRY_ADDRESS || "0x6fF3B2dC6D0F03053D330714427eC7A6555f93fa";
const HSR_NFT_ADDRESS = process.env.CONTRACT_NFT || "0x900C2f2f9a89Cb62Af702611FF77c9F6Ef8dfd38";
const RPC_URL = process.env.FLARE_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";

/**
 * Resolve an FQDN to a wallet address
 * GET /resolve/:fqdn
 *
 * Example: GET /resolve/alice.cryptofans
 * Returns: { address: "0x...", source: "on-chain"|"database", verified: true }
 */
router.get('/resolve/:fqdn', async (req, res) => {
  const { fqdn } = req.params;
  const normalizedFqdn = fqdn.toLowerCase();

  try {
    // First check database for cached resolution (V1 + V2)
    const result = await query(`
      SELECT d.wallet_address, d.resolver_address, d.owner_wallet, d.fqdn, d.token_id,
             am.wallet_address as resolved_address, am.updated_at as resolution_updated
      FROM domains d
      LEFT JOIN address_mappings am ON d.fqdn = am.fqdn
      WHERE d.fqdn = $1
    `, [normalizedFqdn]);

    // If not in V1, check V2 tables
    if (result.rows.length === 0) {
      const v2Domain = await findDomainByFqdn(normalizedFqdn);
      if (v2Domain && v2Domain.source === 'v2') {
        // V2 domain found — check address_mappings for resolved address
        const amResult = await query(
          'SELECT wallet_address, updated_at FROM address_mappings WHERE fqdn = $1',
          [normalizedFqdn]
        );
        const resolvedAddress = amResult.rows.length > 0 ? amResult.rows[0].wallet_address : null;
        const finalAddress = resolvedAddress || v2Domain.owner_wallet;

        return res.json({
          fqdn: normalizedFqdn,
          address: finalAddress,
          source: resolvedAddress ? 'on-chain' : 'owner',
          verified: !!resolvedAddress,
          resolver: v2Domain.resolver_address || null,
          tokenId: v2Domain.token_id ? parseInt(v2Domain.token_id, 10) : null,
          lastUpdated: amResult.rows[0]?.updated_at || null,
        });
      }
    }

    if (result.rows.length === 0) {
      // Domain not in either database - try on-chain resolution as fallback
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const resolver = new ethers.Contract(HSR_RESOLVER_ADDRESS, HSR_RESOLVER_ABI, provider);
        const registry = new ethers.Contract(HSR_REGISTRY_ADDRESS, HSR_REGISTRY_ABI, provider);

        // Check if domain exists in on-chain registry
        const [owner, resolverAddr, tokenId] = await registry.getRecordByFQDN(normalizedFqdn);

        if (owner === ethers.ZeroAddress) {
          return res.status(404).json({
            error: 'Domain not found',
            fqdn: normalizedFqdn,
            address: null,
          });
        }

        // Resolve address from on-chain
        const resolvedAddress = await resolver.resolveAddress(normalizedFqdn);
        const finalAddress = resolvedAddress !== ethers.ZeroAddress ? resolvedAddress : owner;

        return res.json({
          fqdn: normalizedFqdn,
          address: finalAddress,
          source: resolvedAddress !== ethers.ZeroAddress ? 'on-chain' : 'owner',
          verified: resolvedAddress !== ethers.ZeroAddress,
          resolver: resolverAddr,
          tokenId: Number(tokenId),
          lastUpdated: null,
          note: 'Resolved from blockchain (not in database)',
        });
      } catch (chainError) {
        log.warn({ err: chainError }, 'On-chain resolution fallback failed');
        return res.status(404).json({
          error: 'Domain not found',
          fqdn: normalizedFqdn,
          address: null,
        });
      }
    }

    const domain = result.rows[0];

    // Priority: resolved_address > wallet_address > on-chain owner
    if (domain.resolved_address || domain.wallet_address) {
      const resolvedAddress = domain.resolved_address || domain.wallet_address;
      return res.json({
        fqdn: normalizedFqdn,
        address: resolvedAddress,
        source: domain.resolved_address ? 'on-chain' : 'database',
        verified: !!domain.resolved_address,
        resolver: domain.resolver_address,
        tokenId: domain.token_id ? parseInt(domain.token_id, 10) : null,
        lastUpdated: domain.resolution_updated || null,
      });
    }

    // No explicit address set — verify current NFT owner on-chain (DB owner_wallet may be stale after transfers)
    if (domain.token_id) {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const nftContract = new ethers.Contract(HSR_NFT_ADDRESS, HSR_NFT_ABI, provider);
        const currentOwner = await nftContract.ownerOf(domain.token_id);

        if (currentOwner && currentOwner !== ethers.ZeroAddress) {
          // Update stale DB if owner changed
          if (domain.owner_wallet && domain.owner_wallet.toLowerCase() !== currentOwner.toLowerCase()) {
            log.info({ fqdn: normalizedFqdn, oldOwner: domain.owner_wallet, newOwner: currentOwner }, 'Updating stale owner_wallet from on-chain ownerOf');
            await query('UPDATE domains SET owner_wallet = $1, updated_at = NOW() WHERE fqdn = $2', [currentOwner, normalizedFqdn]);
          }

          return res.json({
            fqdn: normalizedFqdn,
            address: currentOwner,
            source: 'owner',
            verified: false,
            resolver: domain.resolver_address,
            tokenId: parseInt(domain.token_id, 10),
            lastUpdated: null,
          });
        }
      } catch (chainErr) {
        log.warn({ err: chainErr, fqdn: normalizedFqdn }, 'On-chain ownerOf check failed, falling back to DB');
      }
    }

    // Final fallback to DB owner_wallet
    res.json({
      fqdn: normalizedFqdn,
      address: domain.owner_wallet,
      source: 'owner',
      verified: false,
      resolver: domain.resolver_address,
      tokenId: domain.token_id ? parseInt(domain.token_id, 10) : null,
      lastUpdated: null,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Resolve multiple FQDNs in a single request
 * POST /resolve/batch
 * Body: { fqdns: ["alice.cryptofans", "bob.cryptofans"] }
 */
router.post('/resolve/batch', async (req, res) => {
  const { fqdns } = req.body;

  if (!Array.isArray(fqdns) || fqdns.length === 0) {
    return res.status(400).json({ error: 'fqdns array is required' });
  }

  if (fqdns.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 FQDNs per batch request' });
  }

  try {
    const normalizedFqdns = fqdns.map(f => f.toLowerCase());

    // Query V1
    const v1Result = await query(`
      SELECT d.fqdn, d.wallet_address, d.owner_wallet,
             am.wallet_address as resolved_address
      FROM domains d
      LEFT JOIN address_mappings am ON d.fqdn = am.fqdn
      WHERE d.fqdn = ANY($1)
    `, [normalizedFqdns]);

    // Query V2 for any not found in V1
    const v1Fqdns = new Set(v1Result.rows.map(r => r.fqdn));
    const missingFqdns = normalizedFqdns.filter(f => !v1Fqdns.has(f));

    let v2Rows = [];
    if (missingFqdns.length > 0) {
      const v2Result = await query(`
        SELECT s.full_name AS fqdn, s.owner_address AS owner_wallet
        FROM slds_v2 s
        WHERE s.full_name = ANY($1)
      `, [missingFqdns]);
      v2Rows = v2Result.rows;
    }

    // Create a map for quick lookup
    const domainMap = new Map();
    v1Result.rows.forEach(row => {
      const address = row.resolved_address || row.wallet_address || row.owner_wallet;
      domainMap.set(row.fqdn, address);
    });
    v2Rows.forEach(row => {
      domainMap.set(row.fqdn, row.owner_wallet);
    });

    // Build results array maintaining order
    const results = normalizedFqdns.map(fqdn => ({
      fqdn,
      address: domainMap.get(fqdn) || null,
      found: domainMap.has(fqdn),
    }));

    res.json({ results });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Set wallet address for a domain (requires ownership)
 * POST /resolve/:fqdn/set
 * Body: { address: "0x..." } (requires wallet signature auth)
 */
router.post('/resolve/:fqdn/set', auth.verifyWallet, async (req, res) => {
  const { fqdn } = req.params;
  const { address } = req.body;
  const authenticatedWallet = req.authenticatedWallet;
  const normalizedFqdn = fqdn.toLowerCase();

  // Validate address format
  if (!address || !ethers.isAddress(address)) {
    return res.status(400).json({ error: 'Invalid wallet address format' });
  }

  try {
    // Check ownership (V1 + V2)
    const domain = await findDomainOwnerForAuth(normalizedFqdn);

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.owner_wallet.toLowerCase() !== authenticatedWallet.toLowerCase()) {
      return res.status(403).json({ error: 'Not the domain owner' });
    }

    // Update domain wallet address (V1 table, if row exists)
    if (domain.source === 'v1') {
      await query(
        'UPDATE domains SET wallet_address = $1, updated_at = NOW() WHERE fqdn = $2',
        [address, normalizedFqdn]
      );
    }

    // Upsert address mapping (works for both V1 and V2)
    await query(`
      INSERT INTO address_mappings (domain_id, token_id, fqdn, namehash, wallet_address, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (namehash, coin_type)
      DO UPDATE SET wallet_address = $5, updated_at = NOW(), updated_by = $6
    `, [
      domain.id,
      domain.token_id,
      normalizedFqdn,
      computeNamehash(normalizedFqdn),
      address,
      authenticatedWallet
    ]);

    // Log the change
    await query(`
      INSERT INTO resolution_audit (domain_id, fqdn, old_address, new_address, changed_by)
      VALUES ($1, $2, NULL, $3, $4)
    `, [domain.id, normalizedFqdn, address, authenticatedWallet]).catch(() => {});

    res.json({
      success: true,
      fqdn: normalizedFqdn,
      address,
      message: 'Wallet address updated successfully',
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get text records for a domain
 * GET /resolve/:fqdn/text
 */
router.get('/resolve/:fqdn/text', async (req, res) => {
  const { fqdn } = req.params;
  const { key } = req.query;
  const normalizedFqdn = fqdn.toLowerCase();

  try {
    let result;
    if (key) {
      result = await query(
        'SELECT record_key, record_value FROM domain_text_records WHERE namehash = $1 AND record_key = $2',
        [computeNamehash(normalizedFqdn), key]
      );
    } else {
      result = await query(
        'SELECT record_key, record_value FROM domain_text_records WHERE namehash = $1',
        [computeNamehash(normalizedFqdn)]
      );
    }

    const records = {};
    result.rows.forEach(row => {
      records[row.record_key] = row.record_value;
    });

    res.json({ fqdn: normalizedFqdn, records });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Set text record for a domain (requires ownership)
 * POST /resolve/:fqdn/text
 * Body: { key: "avatar", value: "https://..." }
 */
router.post('/resolve/:fqdn/text', auth.verifyWallet, async (req, res) => {
  const { fqdn } = req.params;
  const { key, value } = req.body;
  const authenticatedWallet = req.authenticatedWallet;
  const normalizedFqdn = fqdn.toLowerCase();

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'key is required' });
  }

  if (key.length > 100) {
    return res.status(400).json({ error: 'key too long (max 100 characters)' });
  }

  try {
    // Check ownership (V1 + V2)
    const domain = await findDomainOwnerForAuth(normalizedFqdn);

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.owner_wallet.toLowerCase() !== authenticatedWallet.toLowerCase()) {
      return res.status(403).json({ error: 'Not the domain owner' });
    }

    const namehash = computeNamehash(normalizedFqdn);

    if (value === null || value === '') {
      // Delete the record
      await query(
        'DELETE FROM domain_text_records WHERE namehash = $1 AND record_key = $2',
        [namehash, key]
      );
    } else {
      // Upsert the record
      await query(`
        INSERT INTO domain_text_records (domain_id, namehash, record_key, record_value)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (namehash, record_key)
        DO UPDATE SET record_value = $4, updated_at = NOW()
      `, [domain.id, namehash, key, value]);
    }

    res.json({
      success: true,
      fqdn: normalizedFqdn,
      key,
      value: value || null,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Helper: Compute namehash for FQDN (ENS-compatible)
function computeNamehash(fqdn) {
  const labels = fqdn.toLowerCase().split('.').reverse();
  let node = '0x' + '00'.repeat(32);

  for (const label of labels) {
    const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
    node = ethers.keccak256(ethers.concat([node, labelHash]));
  }

  return node;
}

/**
 * Get domains owned by a specific wallet (PUBLIC - read-only)
 * Domain ownership is public on the blockchain, so no auth needed for reading
 * GET /domains/owner/:wallet
 */
router.get('/domains/owner/:wallet', async (req, res) => {
  const { wallet } = req.params;

  try {
    const result = await query(`
      SELECT d.*, t.name as tld_name
      FROM domains d
      JOIN tlds t ON d.tld_id = t.id
      WHERE LOWER(d.owner_wallet) = LOWER($1)
      ORDER BY d.created_at DESC
    `, [wallet]);

    const domains = result.rows.map(d => ({
      ...d,
      token_id: parseInt(d.token_id, 10) || 0
    }));

    res.json({ domains });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get domains owned by a specific wallet (AUTHENTICATED)
 * Requires wallet authentication - users can only view their own domains
 * POST /domains/owner/:wallet
 */
router.post('/domains/owner/:wallet', auth.verifyWallet, async (req, res) => {
  const { wallet } = req.params;
  const authenticatedWallet = req.authenticatedWallet;

  // Security: Users can only query their own domains
  // This prevents wallet enumeration attacks
  if (wallet.toLowerCase() !== authenticatedWallet.toLowerCase()) {
    return res.status(403).json({
      error: 'Forbidden: You can only view your own domains',
    });
  }

  try {
    const result = await query(`
      SELECT d.*, t.name as tld_name
      FROM domains d
      JOIN tlds t ON d.tld_id = t.id
      WHERE LOWER(d.owner_wallet) = LOWER($1)
      ORDER BY d.created_at DESC
    `, [wallet]);

    // Convert token_id to number (PostgreSQL returns NUMERIC as string)
    const domains = result.rows.map(d => ({
      ...d,
      token_id: parseInt(d.token_id, 10) || 0
    }));

    res.json({ domains });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                    DOMAIN TRANSFER & BULK OPERATIONS
// =============================================================

/**
 * Transfer domain ownership (after on-chain transfer)
 * POST /domains/transfer
 * Body: { wallet, signature, nonce, fqdn, toAddress, txHash }
 */
router.post('/domains/transfer', auth.verifyWallet, async (req, res) => {
  const { fqdn, toAddress, txHash } = req.body;
  const authenticatedWallet = req.authenticatedWallet;

  if (!fqdn || !toAddress || !txHash) {
    return res.status(400).json({ error: 'Missing required fields: fqdn, toAddress, txHash' });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
    return res.status(400).json({ error: 'Invalid recipient address' });
  }

  try {
    // Verify caller is current owner (V1 + V2)
    const domain = await findDomainOwnerForAuth(fqdn);

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.owner_wallet.toLowerCase() !== authenticatedWallet.toLowerCase()) {
      return res.status(403).json({ error: 'You are not the owner of this domain' });
    }

    // Update owner in the appropriate table
    if (domain.source === 'v1') {
      await query(
        'UPDATE domains SET owner_wallet = $1 WHERE id = $2',
        [toAddress.toLowerCase(), domain.id]
      );
    } else {
      await query(
        'UPDATE slds_v2 SET owner_address = $1, updated_at = NOW() WHERE id = $2',
        [toAddress.toLowerCase(), domain.id]
      );
    }

    // Audit log
    await query(
      `INSERT INTO audit_log (action, domain_id, fqdn, from_wallet, to_wallet, tx_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      ['transfer', domain.id, fqdn, authenticatedWallet.toLowerCase(), toAddress.toLowerCase(), txHash]
    ).catch(() => {
      // audit_log table may not exist yet - non-critical
    });

    res.json({ success: true, fqdn });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Bulk update DNS records for multiple domains
 * POST /domains/bulk-dns
 * Body: { wallet, signature, nonce, fqdns: string[], records: {} }
 */
router.post('/domains/bulk-dns', auth.verifyWallet, async (req, res) => {
  const { fqdns, records } = req.body;
  const authenticatedWallet = req.authenticatedWallet;

  if (!Array.isArray(fqdns) || fqdns.length === 0) {
    return res.status(400).json({ error: 'fqdns must be a non-empty array' });
  }

  if (fqdns.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 domains per request' });
  }

  if (!records || typeof records !== 'object') {
    return res.status(400).json({ error: 'records must be an object' });
  }

  try {
    // Verify caller owns all domains (V1 + V2)
    const v1Result = await query(
      'SELECT fqdn, owner_wallet FROM domains WHERE fqdn = ANY($1)',
      [fqdns]
    );
    const v2Result = await query(
      'SELECT full_name AS fqdn, owner_address AS owner_wallet FROM slds_v2 WHERE full_name = ANY($1)',
      [fqdns]
    );

    const ownedFqdns = new Set(
      [...v1Result.rows, ...v2Result.rows]
        .filter(d => d.owner_wallet.toLowerCase() === authenticatedWallet.toLowerCase())
        .map(d => d.fqdn)
    );

    const results = [];

    for (const fqdn of fqdns) {
      if (!ownedFqdns.has(fqdn)) {
        results.push({ fqdn, success: false, error: 'Not owned by caller' });
        continue;
      }

      try {
        const parts = fqdn.split('.');
        const subdomain = parts[0];
        const tld = parts.slice(1).join('.');
        await pdnsService.updateSubdomainRecords(subdomain, tld, records);
        results.push({ fqdn, success: true });
      } catch (err) {
        results.push({ fqdn, success: false, error: err.message });
      }
    }

    res.json({ results });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Bulk transfer domains (after on-chain transfers)
 * POST /domains/bulk-transfer
 * Body: { wallet, signature, nonce, fqdns: string[], toAddress, txHash }
 */
router.post('/domains/bulk-transfer', auth.verifyWallet, async (req, res) => {
  const { fqdns, toAddress, txHash } = req.body;
  const authenticatedWallet = req.authenticatedWallet;

  if (!Array.isArray(fqdns) || fqdns.length === 0) {
    return res.status(400).json({ error: 'fqdns must be a non-empty array' });
  }

  if (fqdns.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 domains per request' });
  }

  if (!toAddress || !txHash) {
    return res.status(400).json({ error: 'Missing required fields: toAddress, txHash' });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
    return res.status(400).json({ error: 'Invalid recipient address' });
  }

  try {
    // Verify caller owns all domains (V1 + V2)
    const v1Result = await query(
      'SELECT id, fqdn, owner_wallet FROM domains WHERE fqdn = ANY($1)',
      [fqdns]
    );
    const v2Result = await query(
      `SELECT id, full_name AS fqdn, owner_address AS owner_wallet FROM slds_v2 WHERE full_name = ANY($1)`,
      [fqdns]
    );

    const domainMap = new Map();
    v1Result.rows.forEach(d => domainMap.set(d.fqdn, { ...d, source: 'v1' }));
    v2Result.rows.forEach(d => { if (!domainMap.has(d.fqdn)) domainMap.set(d.fqdn, { ...d, source: 'v2' }); });

    const results = [];

    for (const fqdn of fqdns) {
      const domain = domainMap.get(fqdn);
      if (!domain) {
        results.push({ fqdn, success: false, error: 'Domain not found' });
        continue;
      }
      if (domain.owner_wallet.toLowerCase() !== authenticatedWallet.toLowerCase()) {
        results.push({ fqdn, success: false, error: 'Not owned by caller' });
        continue;
      }

      try {
        if (domain.source === 'v1') {
          await query(
            'UPDATE domains SET owner_wallet = $1 WHERE id = $2',
            [toAddress.toLowerCase(), domain.id]
          );
        } else {
          await query(
            'UPDATE slds_v2 SET owner_address = $1, updated_at = NOW() WHERE id = $2',
            [toAddress.toLowerCase(), domain.id]
          );
        }

        await query(
          `INSERT INTO audit_log (action, domain_id, fqdn, from_wallet, to_wallet, tx_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          ['bulk_transfer', domain.id, fqdn, authenticatedWallet.toLowerCase(), toAddress.toLowerCase(), txHash]
        ).catch(() => {});

        results.push({ fqdn, success: true });
      } catch (err) {
        results.push({ fqdn, success: false, error: err.message });
      }
    }

    res.json({ results });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                    DNS MANAGEMENT
// =============================================================

/**
 * Check DNS setup status for a specific domain
 * Used by the frontend after registration to show propagation progress
 * GET /dns/status/:subdomain/:tld
 */
router.get('/dns/status/:subdomain/:tld', async (req, res) => {
  const { subdomain, tld } = req.params;
  const fqdn = `${subdomain}.${tld}`;

  try {
    // 1. Check if domain exists in database (V1 + V2)
    const domainResult = await query(
      'SELECT dns_active, status, registration_date FROM domains WHERE fqdn = $1',
      [fqdn]
    );

    let domain;
    if (domainResult.rows.length > 0) {
      domain = domainResult.rows[0];
    } else {
      // Check V2
      const v2Result = await query(
        'SELECT registration_time AS registration_date FROM slds_v2 WHERE full_name = $1',
        [fqdn]
      );
      if (v2Result.rows.length > 0) {
        domain = { dns_active: true, status: 'active', registration_date: v2Result.rows[0].registration_date };
      }
    }

    if (!domain) {
      return res.json({
        fqdn,
        status: 'not_found',
        dnsConfigured: false,
        resolving: false,
      });
    }

    // 2. Check if DNS records exist in PowerDNS
    const dnsResult = await pdnsService.getSubdomainRecords(subdomain, tld);
    const dnsConfigured = dnsResult.success && dnsResult.records && dnsResult.records.length > 0;

    // 3. Check if domain resolves locally via PDNS
    let resolving = false;
    try {
      const resolver = new dns.Resolver();
      resolver.setServers(['127.0.0.1']);
      resolving = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 3000);
        resolver.resolveSoa(tld, (err, soa) => {
          clearTimeout(timeout);
          resolve(!err && !!soa);
        });
      });
    } catch {
      resolving = false;
    }

    // Determine overall status
    let status = 'pending';
    if (dnsConfigured && resolving) {
      status = 'ready';
    } else if (dnsConfigured) {
      status = 'propagating';
    } else {
      status = 'configuring';
    }

    res.json({
      fqdn,
      status,
      dnsConfigured,
      dnsActive: domain.dns_active,
      resolving,
      registeredAt: domain.registration_date,
      recordCount: dnsResult.records?.length || 0,
    });
  } catch (error) {
    log.error({ err: error, fqdn }, 'DNS status check failed');
    res.status(500).json({ error: 'Failed to check DNS status' });
  }
});

/**
 * Get ALL DNS records for a domain, including sub-subdomains.
 * Returns flat rows: [{ host: '@'|prefix, type, value, ttl }]
 * GET /dns/:subdomain/:tld/all
 */
router.get('/dns/:subdomain/:tld/all', async (req, res) => {
  const { subdomain, tld } = req.params;
  try {
    const result = await pdnsService.getAllDomainRecords(subdomain, tld);
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    res.json({ entries: result.entries });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/dns/:subdomain/:tld', async (req, res) => {
  const { subdomain, tld } = req.params;
  const host = req.query.host;

  // Optional host prefix for sub-subdomains (e.g., host=api → api.clawedbawt in zone file)
  if (host && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) {
    return res.status(400).json({ error: 'Invalid host prefix' });
  }
  const dnsLabel = host ? `${host.toLowerCase()}.${subdomain}` : subdomain;

  try {
    const result = await pdnsService.getSubdomainRecords(dnsLabel, tld);
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    res.json({ records: result.records });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Update DNS records for a domain
 * Requires wallet signature authentication + ownership verification
 */
router.post('/dns/:subdomain/:tld',
  auth.verifyWallet,
  validation.validateDomain('params'),
  validation.validateDNS,
  async (req, res) => {
    const { subdomain, tld, fqdn } = req.validatedDomain;
    const { records, host } = req.body;

    // Optional host prefix for sub-subdomains (e.g., host: "api" → api.clawedbawt in zone file)
    if (host && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) {
      return res.status(400).json({ error: 'Invalid host prefix' });
    }
    const dnsLabel = host ? `${host.toLowerCase()}.${subdomain}` : subdomain;

    try {
      // Verify ownership of parent domain (V1 + V2)
      const domain = await findDomainOwnerForAuth(fqdn);

      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      if (domain.owner_wallet.toLowerCase() !== req.authenticatedWallet) {
        return res.status(403).json({ error: 'Not authorized to modify this domain' });
      }

      // Update DNS records (uses dnsLabel which may include host prefix)
      const result = await pdnsService.updateSubdomainRecords(dnsLabel, tld, records);
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Update dns_active flag (V1 only — V2 doesn't have this column)
      if (domain.source === 'v1') {
        await query(
          'UPDATE domains SET dns_active = true, updated_at = NOW() WHERE fqdn = $1',
          [fqdn]
        );
      }

      res.json({ success: true, message: 'DNS records updated' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * Delete DNS records for a domain
 * Requires wallet signature authentication + ownership verification
 * Body: { host?, recordType?, recordValue? }
 *   - If recordType+recordValue provided: deletes just that one record
 *   - Otherwise: deletes ALL records for the host/label
 */
router.delete('/dns/:subdomain/:tld',
  auth.verifyWallet,
  validation.validateDomain('params'),
  async (req, res) => {
    const { subdomain, tld, fqdn } = req.validatedDomain;
    const host = req.body.host || req.query.host;
    const { recordType, recordValue } = req.body;

    // Optional host prefix for sub-subdomains
    if (host && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) {
      return res.status(400).json({ error: 'Invalid host prefix' });
    }
    const dnsLabel = host ? `${host.toLowerCase()}.${subdomain}` : subdomain;

    try {
      // Verify ownership of parent domain (V1 + V2)
      const domain = await findDomainOwnerForAuth(fqdn);

      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      if (domain.owner_wallet.toLowerCase() !== req.authenticatedWallet) {
        return res.status(403).json({ error: 'Not authorized to modify this domain' });
      }

      let result;
      if (recordType && recordValue) {
        // Delete a single record (type+value match)
        result = await pdnsService.deleteSingleRecord(dnsLabel, tld, recordType, recordValue);
      } else {
        // Delete ALL records for this label
        result = await pdnsService.deleteSubdomainRecords(dnsLabel, tld);
      }

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Update dns_active flag (V1 only — only when deleting all root records)
      if (!host && !recordType && domain.source === 'v1') {
        await query(
          'UPDATE domains SET dns_active = false, updated_at = NOW() WHERE fqdn = $1',
          [fqdn]
        );
      }

      res.json({ success: true, message: 'DNS records deleted' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// =============================================================
//                    URL FORWARDING
// =============================================================

/**
 * Get URL forward config for a domain (public)
 * GET /dns/:subdomain/:tld/forward
 */
router.get('/dns/:subdomain/:tld/forward',
  validation.validateDomain('params'),
  async (req, res) => {
    const { fqdn } = req.validatedDomain;
    try {
      const result = await query(
        'SELECT target_url, redirect_type, path_forwarding, enabled FROM url_forwards WHERE fqdn = $1',
        [fqdn]
      );
      if (result.rows.length === 0) {
        return res.json({ configured: false });
      }
      res.json({ configured: true, forward: result.rows[0] });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * Create/update URL forward for a domain
 * POST /dns/:subdomain/:tld/forward
 * Body: { wallet, signature, nonce, target_url, redirect_type, path_forwarding, enabled }
 */
router.post('/dns/:subdomain/:tld/forward',
  auth.verifyWallet,
  validation.validateDomain('params'),
  validation.validateUrlForward,
  async (req, res) => {
    const { subdomain, tld, fqdn } = req.validatedDomain;
    const { target_url, redirect_type, path_forwarding, enabled } = req.body;

    try {
      // Verify ownership (V1 + V2)
      const domain = await findDomainOwnerForAuth(fqdn);

      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      if (domain.owner_wallet.toLowerCase() !== req.authenticatedWallet) {
        return res.status(403).json({ error: 'Not authorized to modify this domain' });
      }

      const domainId = domain.id;

      // Upsert forward rule
      await query(
        `INSERT INTO url_forwards (domain_id, fqdn, target_url, redirect_type, path_forwarding, enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (fqdn) DO UPDATE SET
           target_url = EXCLUDED.target_url,
           redirect_type = EXCLUDED.redirect_type,
           path_forwarding = EXCLUDED.path_forwarding,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [domainId, fqdn, target_url, redirect_type, path_forwarding, enabled]
      );

      // Auto-set A record to redirect server IP if configured
      const redirectServerIP = process.env.REDIRECT_SERVER_IP;
      if (redirectServerIP && enabled) {
        await pdnsService.updateSubdomainRecords(subdomain, tld, { ipv4: redirectServerIP });
        if (domain.source === 'v1') {
          await query(
            'UPDATE domains SET dns_active = true, updated_at = NOW() WHERE fqdn = $1',
            [fqdn]
          );
        }
      }

      res.json({ success: true, message: 'URL forward configured' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * Delete URL forward for a domain
 * DELETE /dns/:subdomain/:tld/forward
 * Body: { wallet, signature, nonce }
 */
router.delete('/dns/:subdomain/:tld/forward',
  auth.verifyWallet,
  validation.validateDomain('params'),
  async (req, res) => {
    const { fqdn } = req.validatedDomain;

    try {
      // Verify ownership (V1 + V2)
      const domain = await findDomainOwnerForAuth(fqdn);

      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      if (domain.owner_wallet.toLowerCase() !== req.authenticatedWallet) {
        return res.status(403).json({ error: 'Not authorized to modify this domain' });
      }

      await query('DELETE FROM url_forwards WHERE fqdn = $1', [fqdn]);

      res.json({ success: true, message: 'URL forward removed' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// =============================================================
//                    IPFS CONTENTHASH
// =============================================================

/**
 * Get contenthash for a domain (public)
 * GET /dns/:subdomain/:tld/contenthash
 */
router.get('/dns/:subdomain/:tld/contenthash',
  validation.validateDomain('params'),
  async (req, res) => {
    const { subdomain, tld, fqdn } = req.validatedDomain;
    try {
      // Check V1 first
      const result = await query(
        'SELECT contenthash FROM domains WHERE fqdn = $1',
        [fqdn]
      );
      let cid = null;
      if (result.rows.length > 0 && result.rows[0].contenthash) {
        cid = result.rows[0].contenthash;
      } else {
        // Check V2 artwork for IPFS CID as contenthash equivalent
        const v2Result = await query(
          `SELECT a.ipfs_cid FROM slds_v2 s
           JOIN sld_artwork_v2 a ON a.sld_id = s.id AND a.status = 'completed'
           WHERE s.full_name = $1
           ORDER BY a.completed_at DESC LIMIT 1`,
          [fqdn]
        );
        if (v2Result.rows.length > 0 && v2Result.rows[0].ipfs_cid) {
          cid = v2Result.rows[0].ipfs_cid;
        }
      }

      if (!cid) {
        return res.json({ configured: false });
      }

      // Check if dnslink TXT record exists
      const dnsRecords = await pdnsService.getSubdomainRecords(`_dnslink.${subdomain}`, tld);
      const hasDnslink = dnsRecords.success && dnsRecords.records?.some(
        r => r.type === 'TXT' && r.records?.some(rec => rec.content?.includes('dnslink=/ipfs/'))
      );

      res.json({
        configured: true,
        cid,
        dnslink: hasDnslink,
        gateway_url: `https://gateway.pinata.cloud/ipfs/${cid}`,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * Set contenthash for a domain
 * POST /dns/:subdomain/:tld/contenthash
 * Body: { wallet, signature, nonce, cid }
 */
router.post('/dns/:subdomain/:tld/contenthash',
  auth.verifyWallet,
  validation.validateDomain('params'),
  validation.validateContenthash,
  async (req, res) => {
    const { subdomain, tld, fqdn } = req.validatedDomain;
    const { cid } = req.body;

    try {
      // Verify ownership (V1 + V2)
      const domain = await findDomainOwnerForAuth(fqdn);

      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      if (domain.owner_wallet.toLowerCase() !== req.authenticatedWallet) {
        return res.status(403).json({ error: 'Not authorized to modify this domain' });
      }

      // Store in database (V1 table if exists)
      if (domain.source === 'v1') {
        await query(
          'UPDATE domains SET contenthash = $1, updated_at = NOW() WHERE fqdn = $2',
          [cid, fqdn]
        );
      }

      // Create dnslink TXT record
      await pdnsService.setDnslink(subdomain, tld, cid);

      res.json({ success: true, message: 'Contenthash configured', cid });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * Delete contenthash for a domain
 * DELETE /dns/:subdomain/:tld/contenthash
 * Body: { wallet, signature, nonce }
 */
router.delete('/dns/:subdomain/:tld/contenthash',
  auth.verifyWallet,
  validation.validateDomain('params'),
  async (req, res) => {
    const { subdomain, tld, fqdn } = req.validatedDomain;

    try {
      // Verify ownership (V1 + V2)
      const domain = await findDomainOwnerForAuth(fqdn);

      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      if (domain.owner_wallet.toLowerCase() !== req.authenticatedWallet) {
        return res.status(403).json({ error: 'Not authorized to modify this domain' });
      }

      // Clear from database (V1 only)
      if (domain.source === 'v1') {
        await query(
          'UPDATE domains SET contenthash = NULL, updated_at = NOW() WHERE fqdn = $1',
          [fqdn]
        );
      }

      // Remove dnslink TXT record
      await pdnsService.removeDnslink(subdomain, tld);

      res.json({ success: true, message: 'Contenthash removed' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// =============================================================
//                    HNS OPERATIONS
// =============================================================

router.post('/hns/register', async (req, res) => {
  const { tld, subdomain, escrowId, tokenId, ownerWallet, dnsRecords } = req.body;

  if (!tld || !subdomain || !escrowId) {
    return res.status(400).json({ error: 'tld, subdomain, and escrowId are required' });
  }

  try {
    const fqdn = `${subdomain}.${tld}`;

    // Create DNS records in PowerDNS
    const dnsResult = await pdnsService.createSubdomainRecords(
      subdomain,
      tld,
      dnsRecords || {}
    );

    if (!dnsResult.success) {
      log.error({ error: dnsResult.error }, 'Failed to create DNS records');
      // Continue anyway - DNS can be set up later
    }

    // Store in pending purchases
    await query(`
      INSERT INTO pending_purchases (escrow_id, wallet_address, subdomain, fqdn, price_flr, token_id, status)
      SELECT $1, $2, $3, $4, 0, $5, 'pending'
      WHERE NOT EXISTS (SELECT 1 FROM pending_purchases WHERE escrow_id = $1)
    `, [escrowId, ownerWallet || '', subdomain, fqdn, tokenId || null]);

    res.json({
      success: true,
      subdomain: fqdn,
      dnsConfigured: dnsResult.success,
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/hns/verify/:tld/:subdomain', async (req, res) => {
  const { tld, subdomain } = req.params;

  try {
    // Check DNS records exist in PowerDNS
    const dnsResult = await pdnsService.getSubdomainRecords(subdomain, tld);

    res.json({
      subdomain: `${subdomain}.${tld}`,
      dnsConfigured: dnsResult.success && dnsResult.records && dnsResult.records.length > 0,
      records: dnsResult.records || [],
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                    REGISTRATION COMPLETE
// =============================================================

/**
 * Complete domain registration after blockchain escrow
 * Wallet address provided in body - verified by on-chain escrow event
 */
router.post('/register/complete',
  validation.validateRegistration,
  async (req, res) => {
    const { escrowId, tokenId, subdomain, tld, priceFLR, priceUSD, wallet } = req.body;

    // Use wallet from body - the contract listener independently verifies via on-chain events
    const ownerWallet = wallet?.toLowerCase()?.trim();
    if (!ownerWallet || !/^0x[a-fA-F0-9]{40}$/.test(ownerWallet)) {
      return res.status(400).json({ error: 'Valid wallet address is required' });
    }

    try {
      // Get or create TLD (matches contractListener behavior)
      let tldResult = await validation.isValidTLD(tld);
      if (!tldResult.valid) {
        // Auto-create TLD if it doesn't exist yet (on-chain contract already accepted it)
        const normalized = tld.toLowerCase().trim();
        if (/^[a-z0-9]+$/.test(normalized) && normalized.length <= 63) {
          const insertResult = await query(
            'INSERT INTO tlds (name, is_active) VALUES ($1, true) ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING id',
            [normalized]
          );
          tldResult = { valid: true, normalized, tldId: insertResult.rows[0].id };
        } else {
          return res.status(400).json({ error: tldResult.error });
        }
      }

      const fqdn = `${subdomain}.${tldResult.normalized}`;

      // Check if domain already exists with different owner
      const existingDomain = await query(
        'SELECT owner_wallet, token_id FROM domains WHERE fqdn = $1',
        [fqdn]
      );

      if (existingDomain.rows.length > 0) {
        const existing = existingDomain.rows[0];
        // Only allow if same token or same owner
        if (existing.token_id !== tokenId && existing.owner_wallet.toLowerCase() !== ownerWallet) {
          return res.status(409).json({ error: 'Domain already registered to another user' });
        }
      }

      // Determine tier
      const length = subdomain.length;
      const tier = length === 1 ? 'ultra_premium' : length === 2 ? 'premium' : length === 3 ? 'standard_plus' : 'standard';

      // Insert domain record with nft_status = 'placeholder'
      await query(`
        INSERT INTO domains (
          token_id, subdomain, tld_id, fqdn, owner_wallet, original_buyer,
          registration_price_flr, registration_price_usd, registration_date,
          status, tier, dns_active, nft_status
        ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, NOW(), 'active', $8, true, 'placeholder')
        ON CONFLICT (fqdn) DO UPDATE SET
          owner_wallet = EXCLUDED.owner_wallet,
          token_id = EXCLUDED.token_id,
          nft_status = COALESCE(domains.nft_status, 'placeholder'),
          updated_at = NOW()
      `, [tokenId, subdomain, tldResult.tldId, fqdn, ownerWallet, priceFLR || 0, priceUSD || 0, tier]);

      // Update pending purchase
      await query(`
        UPDATE pending_purchases
        SET status = 'completed', completed_at = NOW(), token_id = $1
        WHERE escrow_id = $2
      `, [tokenId, escrowId]);

      // Create DNS records
      await pdnsService.createSubdomainRecords(subdomain, tldResult.normalized, {});

      // Award credits for single domain purchase (10 credits)
      const creditsToAward = nftService.calculatePurchaseCredits(1);
      try {
        await query(`
          INSERT INTO preview_credits (wallet_address, used_count, bonus_credits, updated_at)
          VALUES ($1, 0, $2, NOW())
          ON CONFLICT (wallet_address) DO UPDATE SET
            bonus_credits = COALESCE(preview_credits.bonus_credits, 0) + $2,
            updated_at = NOW()
        `, [ownerWallet.toLowerCase(), creditsToAward]);

        // Log to credit_transactions
        await nftService.logCreditTransaction(
          ownerWallet,
          creditsToAward,
          'purchase_bonus',
          fqdn,
          null
        );

        console.log(`[Register] Awarded ${creditsToAward} credits to ${ownerWallet} for ${fqdn}`);
      } catch (creditError) {
        log.error({ err: creditError }, 'Failed to award credits');
        // Don't fail registration for credit errors
      }

      res.json({ success: true, fqdn, tokenId, creditsAwarded: creditsToAward });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// =============================================================
//                    NFT METADATA & IMAGES
// =============================================================

/**
 * Get NFT metadata (OpenSea compatible)
 * GET /nft/metadata/:fqdn
 */
router.get('/nft/metadata/:fqdn', async (req, res) => {
  const { fqdn } = req.params;

  try {
    const domainData = await nftService.getDomainData(fqdn);

    if (!domainData) {
      return res.status(404).json({
        error: 'Domain not found',
        name: fqdn,
        description: 'This domain is not registered.',
        image: `${req.protocol}://${req.get('host')}/api/v1/nft/image/${fqdn}`,
      });
    }

    // Use IPFS URL if available, otherwise fall back to API URL
    let imageUrl;
    if (domainData.nft_image_cid) {
      imageUrl = `ipfs://${domainData.nft_image_cid}`;
    } else {
      // Check nft_preparations as fallback
      const prepResult = await query(
        'SELECT image_cid FROM nft_preparations WHERE fqdn = $1',
        [fqdn.toLowerCase()]
      );
      if (prepResult.rows.length > 0 && prepResult.rows[0].image_cid) {
        imageUrl = `ipfs://${prepResult.rows[0].image_cid}`;
      } else {
        imageUrl = `${req.protocol}://${req.get('host')}/api/v1/nft/image/${fqdn}`;
      }
    }

    const metadata = await nftService.generateMetadata(domainData, imageUrl);

    res.json(metadata);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get NFT metadata by token ID
 * GET /nft/token/:tokenId
 */
router.get('/nft/token/:tokenId', async (req, res) => {
  const { tokenId } = req.params;

  try {
    const result = await query(`
      SELECT d.*, t.name as tld_name
      FROM domains d
      JOIN tlds t ON d.tld_id = t.id
      WHERE d.token_id = $1
    `, [tokenId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const domainData = result.rows[0];

    // Use IPFS URL if available, otherwise fall back to API URL
    let imageUrl;
    if (domainData.nft_image_cid) {
      imageUrl = `ipfs://${domainData.nft_image_cid}`;
    } else {
      // Check nft_preparations as fallback
      const prepResult = await query(
        'SELECT image_cid FROM nft_preparations WHERE fqdn = $1',
        [domainData.fqdn.toLowerCase()]
      );
      if (prepResult.rows.length > 0 && prepResult.rows[0].image_cid) {
        imageUrl = `ipfs://${prepResult.rows[0].image_cid}`;
      } else {
        imageUrl = `${req.protocol}://${req.get('host')}/api/v1/nft/image/${domainData.fqdn}`;
      }
    }

    const metadata = await nftService.generateMetadata(domainData, imageUrl);

    res.json(metadata);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get NFT image (PNG)
 * GET /nft/image/:fqdn
 * Query params:
 *   - size: 'small' (400), 'medium' (800), 'large' (1200)
 *   - fallback: 'true' to force canvas-based fallback
 */
router.get('/nft/image/:fqdn', async (req, res) => {
  const { fqdn } = req.params;
  const { size = 'large', fallback } = req.query;
  const targetSize = ['small', 'medium', 'large'].includes(size) ? size : 'large';

  try {
    const domainData = await nftService.getDomainData(fqdn);
    let imageBuffer;

    // Try to get image CID from domains table first, then nft_preparations as fallback
    let imageCid = domainData?.nft_image_cid;

    // If CID missing from domains, check nft_preparations table
    if (!imageCid && fallback !== 'true') {
      const prepResult = await query(
        'SELECT image_cid FROM nft_preparations WHERE fqdn = $1',
        [fqdn.toLowerCase()]
      );
      if (prepResult.rows.length > 0) {
        imageCid = prepResult.rows[0].image_cid;
        console.log(`[NFT] Using image CID from nft_preparations for ${fqdn}`);
      }
    }

    // Check if this is a bulk purchase with pending metadata - use placeholder instead of generating
    const isPendingBulk = domainData?.metadata_uri?.startsWith('pending:bulk:');

    if (isPendingBulk) {
      // Return a simple placeholder for bulk purchases (no AI generation)
      imageBuffer = await nftService.generatePlaceholder(fqdn);
    } else if (imageCid && fallback !== 'true') {
      const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${imageCid}`;
      try {
        const ipfsResponse = await fetch(ipfsUrl);
        if (ipfsResponse.ok) {
          const originalBuffer = Buffer.from(await ipfsResponse.arrayBuffer());
          // Resize IPFS images using Sharp for proper thumbnails
          imageBuffer = await imageCache.processImage(fqdn, originalBuffer, targetSize);
        } else {
          const dimension = imageCache.SIZES[targetSize];
          imageBuffer = await nftService.generateImage(domainData, { width: dimension, height: dimension });
        }
      } catch {
        const dimension = imageCache.SIZES[targetSize];
        imageBuffer = await nftService.generateImage(domainData, { width: dimension, height: dimension });
      }
    } else if (domainData) {
      // No image CID - show placeholder, user can customize from dashboard
      imageBuffer = await nftService.generatePlaceholder(fqdn);
    } else {
      imageBuffer = await nftService.generatePlaceholder(fqdn);
    }

    const maxAge = targetSize === 'small' ? 86400 : 3600;
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${maxAge}`,
    });
    res.send(imageBuffer);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Generate creative prompt suggestions based on subdomain name and optional description
 * GET /nft/suggest-prompt/:subdomain?description=...&tld=...
 *
 * Uses LLM (Ollama) for smart suggestions with TLD context, falls back to static word associations
 */
router.get('/nft/suggest-prompt/:subdomain', async (req, res) => {
  const { subdomain } = req.params;
  const { description, tld, refresh } = req.query;

  if (!subdomain || subdomain.length < 1) {
    return res.status(400).json({ error: 'subdomain is required' });
  }

  // refresh=true bypasses cache for fresh suggestions
  const skipCache = refresh === 'true' || refresh === '1';

  try {
    // Try LLM-powered suggestions first (with TLD context)
    const llmSuggestions = await ollamaService.generateSuggestions(subdomain, tld, description, skipCache);

    if (llmSuggestions && llmSuggestions.length >= 3) {
      return res.json({
        subdomain,
        tld: tld || null,
        description: description || null,
        suggestions: llmSuggestions,
        source: 'llm',
        tip: "AI-generated prompts based on your domain. Click to use or edit!"
      });
    }

    // Fall back to static suggestions
    const suggestions = generatePromptSuggestions(subdomain, description);
    res.json({
      subdomain,
      tld: tld || null,
      description: description || null,
      suggestions,
      source: 'static',
      tip: "Pick one or use as inspiration for your own idea!"
    });
  } catch (error) {
    log.error({ err: error }, 'Prompt suggestion error');
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

/**
 * Generate creative prompt suggestions based on a subdomain name and optional description
 * Uses word patterns, description context, common meanings, and creative associations
 * Optimized for Playground v2.5 with quality boosters and lighting keywords
 */
function generatePromptSuggestions(subdomain, description = '') {
  const name = subdomain.toLowerCase().trim();
  const desc = (description || '').toLowerCase().trim();
  const suggestions = [];

  // Playground v2.5 2026 Standard - Quality boosters and style modifiers
  const qualityBoosters = ['highly detailed', '8k resolution', 'ultra-detailed', 'sharp focus', 'photorealistic'];
  const textureOptions = ['detailed skin texture', 'subsurface scattering', 'micro-pores', 'tactile fabric weave'];
  const opticsOptions = ['sigma 85mm f/1.4 lens', 'RAW photo', 'analog film grain', 'Kodak Portra 400'];

  // Lighting categories
  const cinematicLighting = ['rim lighting', 'volumetric fog', 'dramatic shadows', 'golden hour glow'];
  const studioLighting = ['softbox lighting', 'high-key lighting', 'octa-light', 'reflector disc catchlights'];
  const futuristicLighting = ['neon accents', 'cyberpunk palette', 'bioluminescent lighting', 'ray-traced reflections'];

  // Composition options
  const compositionOptions = ['centered composition', 'rule of thirds', 'cinematic wide shot', 'low-angle hero shot', 'dynamic angle'];
  const backgroundOptions = ['bokeh', 'out-of-focus background', 'solid black background'];

  // Helper to add quality modifiers to prompts
  const enhancePrompt = (basePrompt) => {
    const lighting = cinematicLighting[Math.floor(Math.random() * cinematicLighting.length)];
    const texture = textureOptions[Math.floor(Math.random() * textureOptions.length)];
    const quality = qualityBoosters.slice(0, 2).join(', ');
    return `${basePrompt}, ${lighting}, ${texture}, ${quality}`;
  };

  // If user provided a description, generate prompts based on that
  if (desc) {
    suggestions.push(
      // Cinematic style
      `${desc}, rim lighting, volumetric fog, detailed texture, subsurface scattering, sigma 85mm f/1.4 lens, 8k resolution, ultra-detailed, cinematic digital art`,
      // Studio style
      `${desc}, softbox lighting, high-key lighting, micro-pores detail, RAW photo quality, sharp focus, centered composition, photorealistic`,
      // Futuristic style
      `${desc}, neon accents, ray-traced reflections, cyberpunk palette, tactile fabric weave, 8k resolution, low-angle hero shot, digital art`,
      // Film style
      `${desc}, golden hour glow, analog film grain, Kodak Portra 400, detailed skin texture, rule of thirds, ultra-detailed, professional photography`,
      // Fantasy style
      `${desc}, bioluminescent lighting, dramatic shadows, subsurface scattering, 8k resolution, sharp focus, centered composition, fantasy illustration`
    );

    // Combine subdomain + description for more specific prompts
    if (name !== desc.split(' ')[0]) {
      suggestions.push(`"${name}" representing ${desc}, rim lighting, detailed texture, sigma 85mm f/1.4 lens, 8k, cinematic digital art`);
    }

    // Return early if we have description-based suggestions
    return suggestions.slice(0, 5);
  }

  // Word association maps for common terms - Playground v2.5 2026 Standard
  const wordAssociations = {
    // Animals - enhanced with 2026 texture and optics
    dragon: [
      'majestic dragon soaring through storm clouds, rim lighting, volumetric fog, detailed scale texture, subsurface scattering, sigma 85mm f/1.4 lens, 8k resolution, cinematic fantasy art',
      'ancient dragon guarding treasure in a crystal cave, ray-traced reflections, golden hour glow, micro-detail scales, sharp focus, photorealistic digital art',
      'baby dragon hatching from a glowing egg, bioluminescent lighting, tactile shell texture, soft ambient occlusion, 8k, magical atmosphere'
    ],
    wolf: [
      'lone wolf howling at full moon on snowy mountain, rim lighting, volumetric fog, detailed fur texture, subsurface scattering, 8k resolution, RAW photo quality, cinematic',
      'pack of wolves running through enchanted forest, golden hour glow, motion blur, detailed fur micro-texture, sharp focus, photorealistic',
      'spirit wolf made of starlight, neon accents, ray-traced reflections, centered composition, ultra-detailed, 8k, fantasy digital art'
    ],
    cat: [
      'mystical cat with glowing eyes in magical library, softbox lighting, volumetric dust, detailed fur texture, micro-pores, 8k resolution, fantasy art',
      'cosmic cat walking among stars and galaxies, bioluminescent lighting, ray-traced reflections, sharp focus, cinematic wide shot',
      'elegant cat in sunlit garden, golden hour glow, sigma 85mm f/1.4 lens, Kodak Portra 400 film grain, rule of thirds, photorealistic'
    ],
    dog: [
      'loyal dog standing guard at sunset, golden hour glow, rim lighting, detailed fur texture, subsurface scattering, 8k resolution, cinematic',
      'playful puppy in field of flowers, softbox lighting, sharp focus, micro-detail fur, RAW photo quality, photorealistic',
      'majestic wolf-dog hybrid in winter landscape, volumetric fog, dramatic shadows, detailed fur texture, ultra-detailed, cinematic art'
    ],
    fox: [
      'clever fox in an autumn forest with falling leaves, golden hour sunlight, volumetric light rays, highly detailed, 8k resolution',
      'nine-tailed fox spirit with magical flames, neon glow, dramatic rim lighting, sharp focus, fantasy digital art',
      'arctic fox in a northern lights display, bioluminescent aurora, soft ambient occlusion, highly detailed, cinematic'
    ],
    bear: [
      'powerful bear standing in a rushing river catching salmon, golden hour sunlight, water splashes, highly detailed, 8k, photorealistic',
      'cosmic bear constellation coming to life, neon starlight glow, volumetric nebula, sharp focus, fantasy art',
      'gentle bear in a peaceful meadow, soft natural lighting, rule of thirds, highly detailed, professional photography'
    ],
    lion: [
      'majestic lion with a golden mane at sunset on the savanna, dramatic rim lighting, golden hour, highly detailed, 8k resolution, cinematic',
      'lion king surveying their kingdom from pride rock, volumetric fog, epic lighting, sharp focus, photorealistic digital art',
      'celestial lion made of fire and light, neon glow, centered composition, highly detailed, fantasy illustration'
    ],
    tiger: [
      'tiger prowling through a misty bamboo forest, volumetric fog, soft ambient lighting, highly detailed, 8k, photorealistic',
      'white tiger in a snowy mountain temple, golden hour sunlight, dramatic rim lighting, sharp focus, cinematic art',
      'neon tiger in a cyberpunk city, neon glow, rain reflections, highly detailed, 8k resolution, cyberpunk style'
    ],
    eagle: [
      'eagle soaring above mountain peaks at sunrise, golden hour lighting, dramatic rim light, highly detailed feathers, 8k, cinematic',
      'golden eagle diving through clouds, volumetric fog, motion blur, sharp focus, photorealistic, professional photography',
      'phoenix-eagle hybrid rising from flames, neon fire glow, dramatic lighting, highly detailed, fantasy digital art'
    ],
    owl: [
      'wise owl in a magical library at midnight, soft candlelight, volumetric dust, highly detailed, 8k resolution, fantasy art',
      'snowy owl flying through northern lights, bioluminescent aurora, soft ambient light, sharp focus, cinematic',
      'mechanical steampunk owl with glowing eyes, golden ambient lighting, highly detailed brass gears, 8k, concept art'
    ],
    phoenix: [
      'phoenix rising from ashes in a burst of flames, dramatic rim lighting, volumetric fire, highly detailed, 8k, epic fantasy art',
      'ice phoenix with crystalline feathers, soft bioluminescent glow, sharp focus, centered composition, digital art',
      'cosmic phoenix made of nebula colors, neon glow, volumetric space dust, highly detailed, 8k resolution, cinematic'
    ],

    // Nature - enhanced with Playground v2.5 optimization
    moon: [
      'full moon rising over a misty lake, volumetric fog, soft ambient lighting, highly detailed reflection, 8k resolution, cinematic photography',
      'lunar eclipse with cosmic energy beams, dramatic rim lighting, neon purple glow, sharp focus, fantasy digital art',
      'moon goddess descending to earth, bioluminescent aura, volumetric light rays, highly detailed, 8k, ethereal fantasy art'
    ],
    sun: [
      'golden sunrise over an ocean horizon, golden hour sunlight, volumetric light rays, highly detailed waves, 8k resolution, photorealistic',
      'sun deity radiating divine light, dramatic rim lighting, golden glow, sharp focus, centered composition, epic fantasy art',
      'solar eclipse with corona flames, dramatic lighting, volumetric solar flares, highly detailed, 8k, cinematic space art'
    ],
    star: [
      'shooting star streaking across the night sky, neon glow trail, volumetric atmosphere, highly detailed, 8k, cinematic',
      'constellation coming to life as a celestial being, bioluminescent stars, soft ambient glow, sharp focus, fantasy art',
      'star being born in a colorful nebula, volumetric cosmic dust, neon colors, highly detailed, 8k resolution, space art'
    ],
    ocean: [
      'massive wave crashing with bioluminescent creatures, dramatic rim lighting, volumetric water spray, highly detailed, 8k, photorealistic',
      'underwater kingdom with coral palaces, soft bioluminescent lighting, volumetric light rays, sharp focus, fantasy art',
      'ocean spirit emerging from the depths, neon aqua glow, dramatic lighting, highly detailed water, 8k, digital art'
    ],
    mountain: [
      'snow-capped peak touching the clouds, golden hour sunlight, volumetric fog, highly detailed, 8k resolution, landscape photography',
      'ancient mountain with a hidden temple, dramatic rim lighting, mist, sharp focus, cinematic wide shot, fantasy art',
      'volcanic mountain with flowing lava rivers, neon orange glow, dramatic lighting, highly detailed, 8k, epic landscape'
    ],
    forest: [
      'enchanted forest with glowing mushrooms, bioluminescent lighting, volumetric fog, highly detailed, 8k resolution, fantasy art',
      'ancient redwood forest with mystical creatures, golden hour light rays, soft ambient lighting, sharp focus, cinematic',
      'autumn forest path with golden leaves, golden hour sunlight, volumetric light, highly detailed, 8k, photography quality'
    ],
    fire: [
      'dancing flames forming a phoenix shape, dramatic rim lighting, neon fire glow, highly detailed, 8k resolution, fantasy art',
      'fire elemental emerging from a volcano, volumetric smoke and embers, dramatic lighting, sharp focus, epic digital art',
      'campfire under a starry sky, warm golden glow, soft ambient lighting, highly detailed, 8k, cozy atmosphere'
    ],
    water: [
      'water elemental in a crystal clear waterfall, volumetric mist, dramatic rim lighting, highly detailed, 8k, fantasy art',
      'droplet containing a tiny universe, macro photography, soft ambient lighting, sharp focus, highly detailed, 8k',
      'rain forming mystical patterns, neon reflections, dramatic lighting, volumetric rain, highly detailed, cinematic'
    ],
    storm: [
      'epic thunderstorm over the ocean, dramatic lightning, volumetric clouds, highly detailed, 8k resolution, cinematic photography',
      'storm spirit riding lightning bolts, neon electric glow, dramatic rim lighting, sharp focus, epic fantasy art',
      'eye of a massive hurricane from above, volumetric clouds, dramatic lighting, highly detailed, 8k, aerial photography'
    ],

    // Tech/Cyber - enhanced
    cyber: [
      'cyberpunk city at night with neon signs, neon glow, volumetric fog, rain reflections, highly detailed, 8k, cinematic',
      'android with glowing circuits, neon blue glow, dramatic rim lighting, sharp focus, close-up portrait, sci-fi art',
      'hacker in a data stream visualization, neon matrix glow, volumetric light, highly detailed, 8k, cyberpunk digital art'
    ],
    tech: [
      'futuristic technology hub with holograms, neon glow, volumetric light, highly detailed, 8k resolution, sci-fi concept art',
      'robot companion with a soul, soft ambient lighting, dramatic rim light, sharp focus, cinematic, emotional portrait',
      'quantum computer visualization, neon particle effects, volumetric energy, highly detailed, 8k, abstract tech art'
    ],
    code: [
      'flowing code transforming into reality, neon green matrix glow, volumetric data streams, highly detailed, 8k, digital art',
      'digital world inside a computer, neon circuit patterns, dramatic lighting, sharp focus, sci-fi concept art',
      'programmer wizard casting code spells, neon magic glow, dramatic rim lighting, highly detailed, 8k, fantasy tech art'
    ],
    crypto: [
      'cryptocurrency symbols in a digital dimension, neon gold glow, volumetric data streams, highly detailed, 8k, web3 art',
      'blockchain network visualization, neon connections, dramatic lighting, sharp focus, abstract digital art, 8k',
      'digital gold in cyberspace, golden glow, volumetric light rays, highly detailed, cinematic, futuristic art'
    ],
    nft: [
      'digital art gallery floating in cyberspace, neon ambient glow, volumetric light, highly detailed, 8k, metaverse art',
      'NFT token transforming into living art, neon glow, dramatic rim lighting, sharp focus, digital art, 8k resolution',
      'metaverse art exhibition with holograms, soft ambient lighting, volumetric fog, highly detailed, cinematic'
    ],
    ai: [
      'artificial intelligence as a glowing entity, neon neural glow, volumetric data streams, highly detailed, 8k, sci-fi art',
      'neural network visualization, neon connections, dramatic lighting, sharp focus, abstract tech art, 8k resolution',
      'AI and human collaboration, soft ambient lighting, dramatic rim light, highly detailed, cinematic, emotional art'
    ],
    robot: [
      'friendly robot in a garden, golden hour sunlight, soft ambient lighting, highly detailed, 8k, heartwarming sci-fi',
      'ancient robot awakening, dramatic rim lighting, volumetric dust, sharp focus, cinematic, sci-fi concept art',
      'robot artist creating masterpieces, neon accent lights, soft ambient glow, highly detailed, 8k, creative sci-fi'
    ],

    // Fantasy - enhanced
    magic: [
      'wizard casting a spell with swirling energy, neon magic glow, volumetric particles, highly detailed, 8k, fantasy art',
      'magical portal to another dimension, neon portal glow, dramatic rim lighting, sharp focus, cinematic fantasy',
      'enchanted objects floating in a spell circle, bioluminescent glow, volumetric magic, highly detailed, 8k'
    ],
    wizard: [
      'powerful wizard with a staff of light, dramatic rim lighting, volumetric magic, highly detailed, 8k, epic fantasy',
      'wizard tower at twilight, golden hour lighting, volumetric fog, sharp focus, cinematic wide shot, fantasy art',
      'old wizard reading ancient scrolls, soft candlelight, volumetric dust, highly detailed, 8k, atmospheric fantasy'
    ],
    knight: [
      'knight in shining armor at dawn, golden hour sunlight, dramatic rim lighting, highly detailed, 8k, cinematic',
      'dragon knight with a flaming sword, neon fire glow, volumetric smoke, sharp focus, epic fantasy art',
      'ghostly knight guarding a castle, soft ethereal glow, volumetric fog, highly detailed, 8k, dark fantasy'
    ],
    castle: [
      'floating castle in the clouds, golden hour sunlight, volumetric clouds, highly detailed, 8k resolution, fantasy art',
      'underwater castle with merfolk, bioluminescent lighting, volumetric water, sharp focus, fantasy digital art',
      'dark castle on a stormy cliff, dramatic lightning, volumetric fog, highly detailed, 8k, gothic fantasy'
    ],
    sword: [
      'legendary sword in a stone, dramatic rim lighting, volumetric light rays, highly detailed, 8k, epic fantasy',
      'flaming sword of justice, neon fire glow, dramatic lighting, sharp focus, close-up, fantasy weapon art',
      'crystalline blade with magical runes, bioluminescent glow, soft ambient light, highly detailed, 8k, fantasy art'
    ],
    crown: [
      'golden crown with magical gems, dramatic rim lighting, volumetric sparkles, highly detailed, 8k, royal fantasy',
      'crown of stars and moonlight, soft bioluminescent glow, volumetric light, sharp focus, ethereal fantasy art',
      'ancient crown of a lost kingdom, dramatic lighting, volumetric dust, highly detailed, 8k, dark fantasy'
    ],

    // Space - enhanced
    space: [
      'astronaut floating in a colorful nebula, volumetric cosmic dust, soft ambient glow, highly detailed, 8k, space art',
      'space station orbiting a distant planet, dramatic rim lighting, volumetric atmosphere, sharp focus, sci-fi art',
      'cosmic voyage through the galaxy, neon star trails, volumetric nebula, highly detailed, 8k resolution, cinematic'
    ],
    galaxy: [
      'spiral galaxy with millions of stars, volumetric cosmic dust, neon colors, highly detailed, 8k, space photography',
      'galaxy collision creating new stars, dramatic lighting, volumetric energy, sharp focus, epic space art',
      'person made of galaxy dust, bioluminescent stars, soft ambient glow, highly detailed, 8k, surreal portrait'
    ],
    planet: [
      'alien planet with rings and multiple moons, dramatic rim lighting, volumetric atmosphere, highly detailed, 8k',
      'terraformed Mars with cities, golden hour sunlight, volumetric clouds, sharp focus, sci-fi concept art',
      'crystal planet reflecting starlight, bioluminescent glow, dramatic lighting, highly detailed, 8k, fantasy space'
    ],
    rocket: [
      'vintage rocket launching to the moon, dramatic exhaust glow, volumetric smoke, highly detailed, 8k, retro sci-fi',
      'futuristic spaceship exploring new worlds, neon engine glow, dramatic rim lighting, sharp focus, cinematic',
      'rocket trail through a sunset sky, golden hour lighting, volumetric clouds, highly detailed, 8k, photography'
    ],
    alien: [
      'friendly alien making first contact, soft bioluminescent glow, dramatic rim lighting, highly detailed, 8k, sci-fi',
      'alien landscape with strange plants, neon bioluminescent flora, volumetric fog, sharp focus, concept art',
      'alien city on a distant world, neon lights, volumetric atmosphere, highly detailed, 8k resolution, sci-fi art'
    ],

    // Abstract/Concepts - enhanced
    dream: [
      'surreal dreamscape with floating islands, soft ethereal glow, volumetric clouds, highly detailed, 8k, surrealist art',
      'dream within a dream inception style, dramatic lighting, impossible geometry, sharp focus, cinematic, surreal',
      'peaceful dream of flying through clouds, golden hour light, volumetric atmosphere, highly detailed, 8k, fantasy'
    ],
    time: [
      'clock melting like Dali painting, soft ambient lighting, surreal composition, highly detailed, 8k, surrealist art',
      'time traveler between eras, dramatic rim lighting, volumetric portals, sharp focus, cinematic sci-fi',
      'hourglass containing a universe, bioluminescent sand, volumetric stars, highly detailed, 8k, fantasy concept'
    ],
    love: [
      'heart made of intertwined roses, soft romantic lighting, volumetric petals, highly detailed, 8k, artistic',
      'two souls connecting as light, bioluminescent energy, soft ambient glow, sharp focus, ethereal fantasy',
      'love birds in a magical garden, golden hour sunlight, volumetric flowers, highly detailed, 8k, romantic art'
    ],
    peace: [
      'dove carrying an olive branch at sunrise, golden hour lighting, volumetric light rays, highly detailed, 8k',
      'zen garden with perfect harmony, soft ambient lighting, volumetric mist, sharp focus, minimalist art',
      'peaceful meditation in nature, golden hour sunlight, volumetric atmosphere, highly detailed, 8k, serene'
    ],
    power: [
      'person channeling raw energy, neon power glow, dramatic rim lighting, highly detailed, 8k, epic fantasy',
      'power of the elements combined, volumetric elemental energy, dramatic lighting, sharp focus, concept art',
      'awakening inner strength, bioluminescent aura, soft ambient glow, highly detailed, 8k, inspirational art'
    ],
    wisdom: [
      'ancient tree of knowledge, golden hour sunlight, volumetric light rays, highly detailed, 8k, fantasy art',
      'owl and books in a moonlit library, soft candlelight, volumetric dust, sharp focus, atmospheric fantasy',
      'sage on a mountaintop, dramatic rim lighting, volumetric fog, highly detailed, 8k resolution, epic portrait'
    ],

    // Numbers - enhanced
    '1': [
      'number one trophy on a podium, dramatic spotlight, volumetric light rays, highly detailed, 8k, victory art',
      'single rose in spotlight, dramatic rim lighting, soft ambient glow, sharp focus, close-up, romantic art',
      'lone warrior standing victorious, golden hour sunlight, dramatic lighting, highly detailed, 8k, epic fantasy'
    ],
    '7': [
      'lucky seven with golden aura, neon gold glow, volumetric sparkles, highly detailed, 8k, fortune art',
      'seven wonders combined, dramatic lighting, volumetric atmosphere, sharp focus, epic concept art',
      'rainbow with seven distinct colors, soft natural lighting, volumetric mist, highly detailed, 8k, vibrant'
    ],
    '69': [
      'yin yang symbol with cosmic energy, neon glow, volumetric balance, highly detailed, 8k, spiritual art',
      'balance of opposites, soft ambient lighting, dramatic composition, sharp focus, abstract concept art',
      'duality of nature, golden hour and moonlight, volumetric atmosphere, highly detailed, 8k, surreal'
    ],
    '420': [
      'peaceful garden at golden hour, golden sunlight, volumetric light rays, highly detailed, 8k, serene nature',
      'nature celebration, bioluminescent plants, soft ambient glow, sharp focus, fantasy garden art',
      'green paradise, golden hour lighting, volumetric atmosphere, highly detailed, 8k, lush landscape'
    ],
    '666': [
      'dark phoenix with crimson flames, neon fire glow, dramatic rim lighting, highly detailed, 8k, dark fantasy',
      'mysterious ancient symbol, dramatic lighting, volumetric smoke, sharp focus, occult concept art',
      'powerful transformation, neon energy glow, volumetric dark aura, highly detailed, 8k, epic dark art'
    ],
    '777': [
      'jackpot celebration with gold coins, golden glow, volumetric sparkles, highly detailed, 8k, fortune art',
      'triple lucky stars, neon golden glow, dramatic lighting, sharp focus, cosmic luck art',
      'fortune and prosperity, golden rim lighting, volumetric wealth, highly detailed, 8k, luxurious art'
    ],
    '888': [
      'infinite prosperity symbols, golden glow, volumetric light rays, highly detailed, 8k, abundance art',
      'lucky dragon with gold, dramatic rim lighting, volumetric treasure, sharp focus, Asian fantasy art',
      'abundance flowing like water, golden hour lighting, volumetric golden streams, highly detailed, 8k'
    ],

    // Sports - 2026 Sports-Specific Enhancers
    soccer: [
      'soccer player mid-kick in stadium, stadium grass debris, sweat-beaded forehead, mesh jersey texture, rim lighting, motion blur, telephoto compression, 8k resolution, dynamic angle, sports photography',
      'world cup celebration goal, confetti falling, dramatic shadows, detailed skin texture, frozen in mid-air, sigma 85mm f/1.4 lens, RAW photo quality, cinematic',
      'soccer ball striking the net, stadium floodlights, volumetric fog, micro-texture detail, low-angle hero shot, 8k, dynamic sports art'
    ],
    football: [
      'quarterback throwing perfect spiral, stadium lights, motion blur, mesh jersey texture, detailed skin texture, rim lighting, frozen in mid-air, 8k, cinematic sports photography',
      'touchdown celebration, confetti and pyrotechnics, dramatic shadows, sweat-beaded skin, low-angle hero shot, telephoto compression, RAW photo quality',
      'football tackle mid-impact, turf debris flying, dynamic angle, detailed gear texture, volumetric dust, 8k resolution, action sports art'
    ],
    basketball: [
      'slam dunk at the buzzer, frozen in mid-air, detailed skin texture, sweat droplets, low-angle hero shot, rim lighting, 8k resolution, dynamic sports photography',
      'three-point shot arc, arena lights, motion blur, mesh jersey texture, dramatic shadows, telephoto compression, cinematic',
      'basketball spinning on fingertip, detailed leather texture, softbox lighting, sharp focus, close-up, photorealistic'
    ],
    athlete: [
      'olympic athlete in peak form, detailed muscle texture, subsurface scattering, rim lighting, dramatic shadows, motion blur, 8k resolution, dynamic angle, RAW photo quality',
      'champion crossing finish line, sweat-beaded skin, golden hour glow, frozen moment, telephoto compression, cinematic sports photography',
      'athlete training at sunset, detailed skin texture, golden hour lighting, sigma 85mm f/1.4 lens, rule of thirds, inspirational sports art'
    ],
    ski: [
      'skier carving through powder, crystalline snow spray, polarized goggle reflections, high-altitude blue sky, rim lighting, motion blur, 8k resolution, dynamic angle',
      'extreme skiing frozen mid-air, dramatic shadows, detailed snow texture, low-angle hero shot, telephoto compression, RAW photo quality, action sports',
      'alpine skiing at golden hour, crystalline snow, volumetric fog, detailed gear texture, cinematic wide shot, 8k, winter sports photography'
    ],
    snowboard: [
      'snowboarder mid-trick, crystalline snow spray, polarized goggle reflections, high-altitude blue sky, frozen in mid-air, dynamic angle, 8k, action sports art',
      'half-pipe competition, dramatic shadows, detailed snow texture, low-angle hero shot, motion blur, RAW photo quality, winter sports',
      'backcountry snowboarding, volumetric snow, golden hour glow, detailed gear texture, cinematic wide shot, 8k resolution'
    ],
    race: [
      'race car at peak speed, motion blur, LED display reflections, holographic HUD overlay, dramatic rim lighting, low-angle hero shot, 8k resolution, motorsport photography',
      'pit stop frozen moment, dramatic shadows, detailed gear texture, softbox lighting, telephoto compression, RAW photo quality, cinematic',
      'racing victory celebration, confetti, dramatic rim lighting, detailed skin texture, dynamic angle, 8k, sports photography'
    ],
    esports: [
      'esports champion in arena, holographic scoreboard, LED glow, augmented reality overlay, neon accents, ray-traced reflections, 8k resolution, cyberpunk palette',
      'competitive gaming moment, dramatic RGB lighting, detailed skin texture, sharp focus, close-up portrait, cinematic, tech sports photography',
      'esports team victory, LED jersey patterns, holographic effects, neon glow, dynamic angle, 8k, futuristic sports art'
    ],
  };

  // Check for exact matches first
  if (wordAssociations[name]) {
    suggestions.push(...wordAssociations[name]);
  }

  // Check if name contains any keywords
  for (const [keyword, prompts] of Object.entries(wordAssociations)) {
    if (name.includes(keyword) && !wordAssociations[name]) {
      suggestions.push(prompts[0]); // Add best match
    }
  }

  // Pattern-based suggestions
  if (/^[a-z]+\d+$/.test(name)) {
    // Name + numbers (e.g., "alex123")
    const textPart = name.replace(/\d+/g, '');
    suggestions.push(`personalized emblem for "${textPart}" with digital aesthetic`);
  }

  if (name.length <= 3) {
    // Short names - treat as initials or symbols
    suggestions.push(`elegant monogram "${name.toUpperCase()}" with golden filigree`);
    suggestions.push(`minimalist logo "${name.toUpperCase()}" in neon lights`);
  }

  if (name.length >= 10) {
    // Long names - could be phrases or compound words
    suggestions.push(`artistic text interpretation of "${name}" with creative typography`);
  }

  // Generic creative suggestions as fallback - 2026 standard
  if (suggestions.length < 3) {
    suggestions.push(
      `abstract representation of "${name}" with flowing colors and shapes, rim lighting, volumetric fog, subsurface scattering, 8k resolution, ultra-detailed, digital art`,
      `"${name}" transformed into a mystical creature, bioluminescent lighting, detailed texture, sigma 85mm f/1.4 lens, centered composition, sharp focus, fantasy art`,
      `cosmic interpretation of "${name}" floating in space, ray-traced reflections, neon accents, volumetric nebula, 8k resolution, cinematic space art`,
      `"${name}" as an ancient symbol with magical energy, golden hour glow, volumetric light rays, detailed surface texture, photorealistic, epic fantasy`,
      `steampunk machine inspired by "${name}", softbox lighting, detailed brass texture, micro-pores, RAW photo quality, 8k resolution, concept art`
    );
  }

  // Limit to 5 unique suggestions
  return [...new Set(suggestions)].slice(0, 5);
}

/**
 * Preview NFT image with custom parameters (for testing)
 * POST /nft/preview
 */
router.post('/nft/preview', async (req, res) => {
  const { subdomain, tld, tier, size, theme, model, customPrompt, seed } = req.body;

  if (!subdomain || !tld) {
    return res.status(400).json({ error: 'subdomain and tld are required' });
  }

  const sizes = {
    small: 400,
    medium: 800,
    large: 1200,
  };
  const dimension = sizes[size] || sizes.large;

  try {
    const fqdn = `${subdomain}.${tld}`;
    const mockData = {
      subdomain,
      tld_name: tld,
      fqdn,
      tier: tier || null,
      registration_date: new Date().toISOString(),
      token_id: 999,
      owner_wallet: '0x0000000000000000000000000000000000000000',
    };

    const imageBuffer = await nftService.generateImage(mockData, {
      width: dimension,
      height: dimension,
      theme: theme || 'cosmic',
      model: model || 'sdxl-playground-lora',
      customPrompt: customPrompt || null,
      seed: seed || null,
    });

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache',
    });

    res.send(imageBuffer);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Prepare NFT for purchase - generates AI image and uploads to IPFS
 * POST /nft/prepare
 * Body: { subdomain, tld, style?, seed?, customPrompt (REQUIRED) }
 * Returns: { success, metadataURI, imageCID, metadataCID, imageURL, metadataURL, seed, tier, style }
 */
router.post('/nft/prepare', async (req, res) => {
  const { subdomain, tld, theme, style, seed, customPrompt } = req.body;
  // Support both 'theme' (legacy) and 'style' (new) parameter names
  const selectedStyle = style || theme;

  if (!subdomain || !tld) {
    return res.status(400).json({ error: 'subdomain and tld are required' });
  }

  // REQUIRED: customPrompt - describes the subject of the image
  if (!customPrompt?.trim()) {
    return res.status(400).json({
      error: 'customPrompt is required - describe your subject (e.g., "bigfoot catching a fish by a mountain lake")',
    });
  }

  try {
    // Validate subdomain format
    const subdomainResult = validation.isValidSubdomain(subdomain);
    if (!subdomainResult.valid) {
      return res.status(400).json({
        success: false,
        error: subdomainResult.error,
      });
    }

    // Validate TLD exists
    const tldResult = await validation.isValidTLD(tld);
    if (!tldResult.valid) {
      return res.status(400).json({
        success: false,
        error: tldResult.error,
      });
    }

    const fqdn = `${subdomainResult.normalized}.${tldResult.normalized}`;

    // Check if already registered
    const dbCheck = await query(
      'SELECT owner_wallet FROM domains WHERE fqdn = $1',
      [fqdn]
    );

    if (dbCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Domain is already registered',
      });
    }

    // Sanitize and limit custom prompt
    const sanitizedCustomPrompt = customPrompt ? customPrompt.trim().slice(0, 200) : null;

    // Check if already prepared with SAME style, seed, and customPrompt (within last hour)
    // If any differs, regenerate
    const existingPrep = await nftService.getPreparedNFT(fqdn);
    if (existingPrep) {
      const prepAge = Date.now() - new Date(existingPrep.createdAt).getTime();
      const ONE_HOUR = 60 * 60 * 1000;
      const sameStyle = !selectedStyle || existingPrep.theme === selectedStyle;
      const sameSeed = !seed || existingPrep.seed === seed;
      const sameCustomPrompt = existingPrep.customPrompt === sanitizedCustomPrompt;

      if (prepAge < ONE_HOUR && sameStyle && sameSeed && sameCustomPrompt) {
        console.log(`Using existing NFT preparation for ${fqdn}`);
        return res.json({
          success: true,
          cached: true,
          fqdn,
          subdomain: subdomainResult.normalized,
          tld: tldResult.normalized,
          metadataURI: existingPrep.metadataURI,
          imageCID: existingPrep.imageCID,
          metadataCID: existingPrep.metadataCID,
          imageURL: existingPrep.imageURL,
          metadataURL: existingPrep.metadataURL,
          seed: existingPrep.seed,
          tier: existingPrep.tier,
          style: existingPrep.theme,
          theme: existingPrep.theme, // Backwards compatibility
        });
      }
    }

    // Generate and upload NFT with style and required custom prompt
    console.log(`Preparing NFT for ${fqdn} (style: ${selectedStyle || 'minimalist'}, seed: ${seed || 'deterministic'}, customPrompt: "${sanitizedCustomPrompt.substring(0, 50)}...")...`);
    const result = await nftService.prepareNFT(
      subdomainResult.normalized,
      tldResult.normalized,
      { theme: selectedStyle, seed, customPrompt: sanitizedCustomPrompt }
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'NFT preparation failed',
      });
    }

    res.json({
      success: true,
      cached: false,
      fqdn,
      subdomain: subdomainResult.normalized,
      tld: tldResult.normalized,
      metadataURI: result.metadataURI,
      imageCID: result.imageCID,
      metadataCID: result.metadataCID,
      imageURL: result.imageURL,
      metadataURL: result.metadataURL,
      seed: result.seed,
      tier: result.tier,
      style: result.theme,
      theme: result.theme, // Backwards compatibility
    });
  } catch (error) {
    log.error({ err: error }, 'NFT preparation error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get prepared NFT data for a domain
 * GET /nft/prepared/:fqdn
 */
router.get('/nft/prepared/:fqdn', async (req, res) => {
  const { fqdn } = req.params;

  try {
    const prepared = await nftService.getPreparedNFT(fqdn);

    if (!prepared) {
      return res.status(404).json({
        success: false,
        error: 'No prepared NFT found for this domain',
      });
    }

    res.json({
      success: true,
      ...prepared,
    });
  } catch (error) {
    log.error({ err: error }, 'Get prepared NFT error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =============================================================
//                    NFT PREVIEW & CUSTOMIZATION
// =============================================================

/**
 * Generate NFT preview as raw PNG image (local only, no IPFS upload)
 * GET /nft/preview-image/:subdomain/:tld
 * Query params: style?, seed?, customPrompt (REQUIRED)
 * Returns: Raw PNG image (can be saved directly with curl/wget)
 */
router.get('/nft/preview-image/:subdomain/:tld', async (req, res) => {
  const { subdomain, tld } = req.params;
  const { theme, style, seed, customPrompt } = req.query;
  // Support both 'theme' (legacy) and 'style' (new) parameter names
  const selectedStyle = style || theme;

  // REQUIRED: customPrompt - describes the subject of the image
  if (!customPrompt?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'customPrompt is required - describe your subject (e.g., "bigfoot catching a fish by a mountain lake")',
    });
  }

  try {
    // Validate subdomain format
    const subdomainResult = validation.isValidSubdomain(subdomain);
    if (!subdomainResult.valid) {
      return res.status(400).json({
        success: false,
        error: subdomainResult.error,
      });
    }

    // Validate TLD exists
    const tldResult = await validation.isValidTLD(tld);
    if (!tldResult.valid) {
      return res.status(400).json({
        success: false,
        error: tldResult.error,
      });
    }

    // Sanitize and limit custom prompt (required)
    const sanitizedCustomPrompt = customPrompt.trim().slice(0, 200);

    console.log(`Generating preview image for ${subdomain}.${tld} (style: ${selectedStyle || 'minimalist'}, seed: ${seed || 'deterministic'})`);

    const result = await nftService.generatePreview(
      subdomainResult.normalized,
      tldResult.normalized,
      { theme: selectedStyle, seed: seed ? parseInt(seed, 10) : undefined, customPrompt: sanitizedCustomPrompt }
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Preview generation failed',
      });
    }

    // Extract base64 data and convert to buffer
    const base64Data = result.imageBase64.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Set headers for PNG image download
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="${subdomain}-${tld}-preview.png"`,
      'X-NFT-Seed': result.seed,
      'X-NFT-Tier': result.tier,
      'X-NFT-Style': result.theme || 'minimalist',
      'Cache-Control': 'no-cache',
    });

    res.send(imageBuffer);
  } catch (error) {
    log.error({ err: error }, 'Preview image generation error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Generate NFT preview (local only, no IPFS upload)
 * POST /nft/preview-generate
 * Body: { subdomain, tld, wallet, style?, seed?, customPrompt (REQUIRED) }
 * Returns: { success, imageBase64, seed, tier, style, remaining }
 */
router.post('/nft/preview-generate', async (req, res) => {
  const { subdomain, tld, wallet, theme, style, seed, customPrompt } = req.body;
  // Support both 'theme' (legacy) and 'style' (new) parameter names
  const selectedStyle = style || theme || 'minimalist';

  if (!subdomain || !tld || !wallet) {
    return res.status(400).json({
      success: false,
      error: 'subdomain, tld, and wallet are required',
    });
  }

  // REQUIRED: customPrompt - describes the subject of the image
  if (!customPrompt?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'customPrompt is required - describe your subject (e.g., "bigfoot catching a fish by a mountain lake")',
    });
  }

  // Basic wallet address validation (no signature required)
  if (!ethers.isAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid wallet address',
    });
  }

  const normalizedWallet = wallet.toLowerCase();

  try {
    // Validate subdomain format
    const subdomainResult = validation.isValidSubdomain(subdomain);
    if (!subdomainResult.valid) {
      return res.status(400).json({
        success: false,
        error: subdomainResult.error,
      });
    }

    // Validate TLD exists
    const tldResult = await validation.isValidTLD(tld);
    if (!tldResult.valid) {
      return res.status(400).json({
        success: false,
        error: tldResult.error,
      });
    }

    // Check credits first (wallet-wide, not per-theme)
    const credits = await nftService.getPreviewCredits(normalizedWallet);
    if (credits.remaining <= 0) {
      return res.status(403).json({
        success: false,
        error: 'No preview credits remaining',
        remaining: 0,
      });
    }

    // Use credit
    await nftService.usePreviewCredit(normalizedWallet);

    // Sanitize and limit custom prompt (required)
    const sanitizedCustomPrompt = customPrompt.trim().slice(0, 200);

    console.log(`Generating preview for ${subdomain}.${tld} (wallet: ${normalizedWallet}, style: ${selectedStyle}, seed: ${seed || 'deterministic'})`);

    const result = await nftService.generatePreview(
      subdomainResult.normalized,
      tldResult.normalized,
      { theme: selectedStyle, seed, customPrompt: sanitizedCustomPrompt }
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Preview generation failed',
      });
    }

    // Get updated credits
    const updatedCredits = await nftService.getPreviewCredits(normalizedWallet);

    res.json({
      success: true,
      imageBase64: result.imageBase64,
      seed: result.seed,
      tier: result.tier,
      style: result.theme,
      theme: result.theme, // Backwards compatibility
      remaining: updatedCredits.remaining,
    });
  } catch (error) {
    log.error({ err: error }, 'Preview generation error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Regenerate NFT with new random seed (uses credit)
 * POST /nft/regenerate
 * Requires wallet authentication
 * Body: { subdomain, tld, style?, customPrompt (REQUIRED), wallet, signature, nonce }
 * Returns: { success, imageBase64, newSeed, tier, style, creditsRemaining }
 */
router.post('/nft/regenerate', auth.verifyWallet, async (req, res) => {
  const { subdomain, tld, theme, style, customPrompt } = req.body;
  const wallet = req.authenticatedWallet;
  // Support both 'theme' (legacy) and 'style' (new) parameter names
  const selectedStyle = style || theme;

  if (!subdomain || !tld) {
    return res.status(400).json({
      success: false,
      error: 'subdomain and tld are required',
    });
  }

  // REQUIRED: customPrompt - describes the subject of the image
  if (!customPrompt?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'customPrompt is required - describe your subject (e.g., "bigfoot catching a fish by a mountain lake")',
    });
  }

  try {
    // Validate subdomain format
    const subdomainResult = validation.isValidSubdomain(subdomain);
    if (!subdomainResult.valid) {
      return res.status(400).json({
        success: false,
        error: subdomainResult.error,
      });
    }

    // Validate TLD exists
    const tldResult = await validation.isValidTLD(tld);
    if (!tldResult.valid) {
      return res.status(400).json({
        success: false,
        error: tldResult.error,
      });
    }

    // Sanitize and limit custom prompt (required)
    const sanitizedCustomPrompt = customPrompt.trim().slice(0, 200);

    // Check and use regeneration credit
    const creditResult = await nftService.useRegenCredit(wallet);
    if (!creditResult.success) {
      return res.status(403).json({
        success: false,
        error: creditResult.error || 'No regeneration credits available',
        freeRemaining: creditResult.freeRemaining,
        paidCredits: creditResult.paidCredits,
      });
    }

    console.log(`Regenerating preview for ${subdomain}.${tld} (wallet: ${wallet}, style: ${selectedStyle || 'minimalist'})`);

    // Generate with random seed
    const result = await nftService.generatePreview(
      subdomainResult.normalized,
      tldResult.normalized,
      { theme: selectedStyle, randomSeed: true, customPrompt: sanitizedCustomPrompt }
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Regeneration failed',
      });
    }

    res.json({
      success: true,
      imageBase64: result.imageBase64,
      newSeed: result.seed,
      tier: result.tier,
      style: result.theme,
      theme: result.theme, // Backwards compatibility
      freeRemaining: creditResult.freeRemaining,
      paidCredits: creditResult.paidCredits,
    });
  } catch (error) {
    log.error({ err: error }, 'Regeneration error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get available styles for a tier
 * GET /nft/themes/:tier (backwards compatible route name)
 * GET /nft/styles/:tier (new route)
 * Returns: { styles: [{id, name, description}, ...] }
 */
router.get('/nft/themes/:tier', (req, res) => {
  const { tier } = req.params;

  const validTiers = ['ultra_premium', 'premium', 'standard_plus', 'standard'];
  if (!validTiers.includes(tier)) {
    return res.status(400).json({
      success: false,
      error: `Invalid tier. Must be one of: ${validTiers.join(', ')}`,
    });
  }

  const styles = nftService.getThemesDetailed(tier);
  res.json({
    success: true,
    tier,
    styles,
    themes: styles, // Backwards compatibility
    note: 'customPrompt is now required - describe your subject and the style will enhance its appearance',
  });
});

// New style-named route (same functionality)
router.get('/nft/styles/:tier', (req, res) => {
  const { tier } = req.params;

  const validTiers = ['ultra_premium', 'premium', 'standard_plus', 'standard'];
  if (!validTiers.includes(tier)) {
    return res.status(400).json({
      success: false,
      error: `Invalid tier. Must be one of: ${validTiers.join(', ')}`,
    });
  }

  const styles = nftService.getThemesDetailed(tier);
  res.json({
    success: true,
    tier,
    styles,
    note: 'customPrompt is now required - describe your subject and the style will enhance its appearance',
  });
});

/**
 * Get all styles organized by tier
 * GET /nft/themes (backwards compatible route name)
 * Returns: { styles: { ultra_premium: [...], premium: [...], ... } }
 */
router.get('/nft/themes', (req, res) => {
  const styles = nftService.getAllThemes();
  res.json({
    success: true,
    styles,
    themes: styles, // Backwards compatibility
    note: 'customPrompt is now required - describe your subject and the style will enhance its appearance',
  });
});

// New style-named route (same functionality)
router.get('/nft/styles', (req, res) => {
  const styles = nftService.getAllThemes();
  res.json({
    success: true,
    styles,
    note: 'customPrompt is now required - describe your subject and the style will enhance its appearance',
  });
});

/**
 * Get regeneration credits for a wallet
 * GET /nft/regen-credits/:wallet
 * Returns: { freeRemaining, paidCredits, totalRegenerations }
 */
router.get('/nft/regen-credits/:wallet', async (req, res) => {
  const { wallet } = req.params;

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid wallet address',
    });
  }

  try {
    const credits = await nftService.getRegenCredits(wallet);
    res.json({
      success: true,
      ...credits,
    });
  } catch (error) {
    log.error({ err: error }, 'Get regen credits error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get regeneration pricing info
 * GET /nft/regen-pricing
 * Returns: { priceFLR, creditsPerPurchase, freeCredits }
 */
router.get('/nft/regen-pricing', (req, res) => {
  const pricing = nftService.getRegenPricing();
  res.json({
    success: true,
    ...pricing,
  });
});

// =============================================================
//                    PREVIEW CREDITS
// =============================================================

/**
 * Get preview credits for a wallet (10 free total per wallet)
 * GET /nft/preview-credits/:wallet
 * Returns: { usedCount, remaining, freeTotal }
 */
router.get('/nft/preview-credits/:wallet', async (req, res) => {
  const { wallet } = req.params;

  // Validate wallet address format
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid wallet address',
    });
  }

  try {
    const credits = await nftService.getPreviewCredits(wallet);
    res.json({
      success: true,
      ...credits,
    });
  } catch (error) {
    log.error({ err: error }, 'Get preview credits error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Purchase preview credits (verify on-chain payment)
 * POST /nft/buy-preview-credits
 * Body: { txHash, wallet }
 * Returns: { success, remaining }
 */
router.post('/nft/buy-preview-credits', async (req, res) => {
  const { txHash, wallet } = req.body;

  if (!txHash || !wallet) {
    return res.status(400).json({
      success: false,
      error: 'txHash and wallet are required',
    });
  }

  // Basic wallet validation (no signature required)
  if (!ethers.isAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid wallet address',
    });
  }

  const normalizedWallet = wallet.toLowerCase();

  // Validate txHash format (0x + 64 hex chars)
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid transaction hash format',
    });
  }

  try {
    console.log(`Processing preview credit purchase for ${normalizedWallet}, txHash: ${txHash}`);

    // 1. Check if transaction has already been used
    const existingTx = await query(
      'SELECT id FROM used_credit_transactions WHERE tx_hash = $1',
      [txHash.toLowerCase()]
    );

    if (existingTx.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Transaction has already been used for credits',
      });
    }

    // 2. Verify transaction on-chain
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);

    // Get the transaction
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return res.status(400).json({
        success: false,
        error: 'Transaction not found on chain',
      });
    }

    // 3. Wait for confirmation (at least 1 block)
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return res.status(400).json({
        success: false,
        error: 'Transaction not yet confirmed',
      });
    }

    if (receipt.status !== 1) {
      return res.status(400).json({
        success: false,
        error: 'Transaction failed on chain',
      });
    }

    // 4. Verify sender matches provided wallet
    if (tx.from.toLowerCase() !== normalizedWallet) {
      return res.status(400).json({
        success: false,
        error: 'Transaction sender does not match provided wallet',
      });
    }

    // 5. Verify recipient is treasury address
    const treasuryAddress = config.treasuryAddress || config.platformWallet;
    if (!treasuryAddress) {
      log.error('Treasury address not configured');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    if (tx.to.toLowerCase() !== treasuryAddress.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Transaction recipient is not the treasury address',
      });
    }

    // 6. Verify amount (preview credits are cheaper - use preview price)
    // Note: Preview cost is $0.05 USD per 10 generations
    // We'll accept any reasonable amount for now (at least 0.01 FLR)
    const minAmount = ethers.parseEther('0.01');
    if (tx.value < minAmount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient payment amount',
      });
    }

    // 7. Mark transaction as used (prevent replay)
    await query(
      `INSERT INTO used_credit_transactions (tx_hash, wallet, amount, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [txHash.toLowerCase(), normalizedWallet, tx.value.toString()]
    );

    // 8. Reset credits (gives 10 more free)
    const result = await nftService.purchasePreviewCredits(normalizedWallet);

    if (!result.success) {
      // Rollback: remove the transaction record if credit addition failed
      await query('DELETE FROM used_credit_transactions WHERE tx_hash = $1', [txHash.toLowerCase()]);
      return res.status(500).json({
        success: false,
        error: 'Failed to add credits',
      });
    }

    console.log(`Preview credits reset for ${normalizedWallet}`);

    res.json({
      success: true,
      remaining: result.remaining,
      message: 'Added 10 preview credits',
    });
  } catch (error) {
    log.error({ err: error }, 'Buy preview credits error');
    res.status(500).json({
      success: false,
      error: 'Failed to verify transaction',
    });
  }
});

/**
 * Reset ALL preview credits (admin only)
 * POST /nft/preview-credits/reset-all
 * Requires admin authentication
 * Returns: { success, resetCount }
 */
router.post('/nft/preview-credits/reset-all', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    console.log(`Admin ${req.authenticatedWallet} resetting all preview credits`);

    const result = await nftService.resetAllPreviewCredits();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to reset credits',
      });
    }

    console.log(`Reset ${result.resetCount} preview credit records`);

    res.json({
      success: true,
      resetCount: result.resetCount,
      message: `Reset preview credits for ${result.resetCount} wallet(s)`,
    });
  } catch (error) {
    log.error({ err: error }, 'Reset all preview credits error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Purchase regeneration credits (verify on-chain payment)
 * POST /nft/buy-credits
 * Requires wallet authentication
 * Body: { txHash, wallet, signature, nonce }
 * Returns: { success, newCredits }
 */
router.post('/nft/buy-credits', auth.verifyWallet, async (req, res) => {
  const { txHash } = req.body;
  const wallet = req.authenticatedWallet;

  if (!txHash) {
    return res.status(400).json({
      success: false,
      error: 'txHash is required',
    });
  }

  // Validate txHash format (0x + 64 hex chars)
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid transaction hash format',
    });
  }

  try {
    console.log(`Processing credit purchase for ${wallet}, txHash: ${txHash}`);

    // 1. Check if transaction has already been used
    const existingTx = await query(
      'SELECT id FROM used_credit_transactions WHERE tx_hash = $1',
      [txHash.toLowerCase()]
    );

    if (existingTx.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Transaction has already been used for credits',
      });
    }

    // 2. Verify transaction on-chain
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);

    // Get the transaction
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return res.status(400).json({
        success: false,
        error: 'Transaction not found on chain',
      });
    }

    // 3. Wait for confirmation (at least 1 block)
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return res.status(400).json({
        success: false,
        error: 'Transaction not yet confirmed',
      });
    }

    if (receipt.status !== 1) {
      return res.status(400).json({
        success: false,
        error: 'Transaction failed on chain',
      });
    }

    // 4. Verify sender matches provided wallet
    if (tx.from.toLowerCase() !== normalizedWallet) {
      return res.status(400).json({
        success: false,
        error: 'Transaction sender does not match provided wallet',
      });
    }

    // 5. Verify recipient is treasury address
    const treasuryAddress = config.treasuryAddress || config.platformWallet;
    if (!treasuryAddress) {
      log.error('Treasury address not configured');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    if (tx.to.toLowerCase() !== treasuryAddress.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Transaction recipient is not the treasury address',
      });
    }

    // 6. Verify amount (must be at least the credit purchase price)
    const requiredAmount = BigInt(config.creditPurchasePrice);
    if (tx.value < requiredAmount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient payment. Required: ${ethers.formatEther(requiredAmount)} FLR`,
      });
    }

    // 7. Mark transaction as used (prevent replay)
    await query(
      `INSERT INTO used_credit_transactions (tx_hash, wallet, amount, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [txHash.toLowerCase(), wallet.toLowerCase(), tx.value.toString()]
    );

    // 8. Add credits to user
    const result = await nftService.addPaidCredits(wallet);

    if (!result.success) {
      // Rollback: remove the transaction record if credit addition failed
      await query('DELETE FROM used_credit_transactions WHERE tx_hash = $1', [txHash.toLowerCase()]);
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to add credits',
      });
    }

    console.log(`Credits added successfully for ${wallet}: ${result.newCredits} total`);

    res.json({
      success: true,
      newCredits: result.newCredits,
      message: `Added ${nftService.getRegenPricing().creditsPerPurchase} regeneration credits`,
    });
  } catch (error) {
    log.error({ err: error }, 'Buy credits error');
    res.status(500).json({
      success: false,
      error: 'Failed to verify transaction',
    });
  }
});

// =============================================================
//                    FLUX MULTI-GPU GENERATION
// 3x RTX 3060 parallel generation for theme selection
// =============================================================

/**
 * Get available image styles
 * GET /nft/flux-styles
 */
router.get('/nft/flux-styles', (req, res) => {
  res.json({
    success: true,
    styles: [
      { id: 'playground', name: 'Photorealistic', description: 'High-quality photorealistic images with Playground v2.5 + LCM LoRA' },
      { id: 'animagine', name: 'Anime', description: 'Stylized anime aesthetic with Animagine XL 3.1' },
    ],
    defaultStyle: 'playground',
  });
});

/**
 * Get all available Flux themes (411 total across 8 categories)
 * Categories: business(50), exotic(50), jobs(50), fantasy(50), fractal(50), nature(50), space(50), anime(61)
 * GET /nft/flux-themes
 */
router.get('/nft/flux-themes', async (req, res) => {
  try {
    const themes = await fluxMultiGPUService.getThemes();
    const totalCount = Object.values(themes).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    res.json({
      success: true,
      themes,
      totalCount,
    });
  } catch (error) {
    log.error({ err: error }, 'Get flux themes error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get all available art styles (60 total across 6 categories)
 * Categories: artistic, digital, film, movements, rendering, mood
 * GET /nft/art-styles
 */
router.get('/nft/art-styles', (req, res) => {
  try {
    const styles = artStyles.getStylesForAPI();
    const categories = artStyles.getStyleCategories();
    const totalCount = Object.values(styles).reduce((sum, arr) => sum + (arr?.length || 0), 0);

    res.json({
      success: true,
      styles,
      categories,
      totalCount,
      note: 'Styles control HOW an image looks (artistic technique). Combine with themes that control WHAT is in the image.',
    });
  } catch (error) {
    log.error({ err: error }, 'Get art styles error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get a single art style by ID
 * GET /nft/art-style/:id
 */
router.get('/nft/art-style/:id', (req, res) => {
  try {
    const { id } = req.params;
    const style = artStyles.getStyleById(id);

    if (!style) {
      return res.status(404).json({
        success: false,
        error: `Style not found: ${id}`,
        availableStyles: artStyles.getAllStyleIds(),
      });
    }

    res.json({
      success: true,
      style,
    });
  } catch (error) {
    log.error({ err: error }, 'Get art style error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get art styles for a specific category
 * GET /nft/art-styles/:category
 */
router.get('/nft/art-styles/:category', (req, res) => {
  try {
    const { category } = req.params;
    const styles = artStyles.getStylesByCategory(category);

    if (!styles) {
      return res.status(400).json({
        success: false,
        error: `Invalid category: ${category}`,
        availableCategories: artStyles.getStyleCategories(),
      });
    }

    res.json({
      success: true,
      category,
      styles,
      count: styles.length,
    });
  } catch (error) {
    log.error({ err: error }, 'Get art styles by category error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =============================================================
//                     WATERMARK STYLES
// =============================================================

/**
 * Helper to format watermark style ID to display name
 * e.g., 'pixel_art' -> 'Pixel Art'
 */
function formatStyleName(styleId) {
  return styleId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get available watermark styles
 * GET /watermark-styles
 * Returns list of 34 approved watermark styles with preview URLs
 */
router.get('/watermark-styles', (req, res) => {
  try {
    const styles = Object.keys(WATERMARK_STYLES).map(id => ({
      id,
      name: formatStyleName(id),
      previewUrl: `/api/v1/watermark-styles/${id}/preview`,
    }));

    res.json({
      success: true,
      styles,
      count: styles.length,
      default: DEFAULT_WATERMARK_STYLE,
    });
  } catch (error) {
    log.error({ err: error }, 'Get watermark styles error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get watermark style preview image
 * GET /watermark-styles/:id/preview
 * Serves the YAY preview images from the showcase folder
 */
router.get('/watermark-styles/:id/preview', (req, res) => {
  try {
    const { id } = req.params;

    // Validate style exists
    if (!WATERMARK_STYLES[id]) {
      return res.status(404).json({
        success: false,
        error: 'Style not found',
        validStyles: Object.keys(WATERMARK_STYLES),
      });
    }

    // Map style ID to filename (handle matrix -> matrix_like)
    let filename = id;
    if (id === 'matrix') {
      filename = 'matrix_like';
    }

    const previewPath = path.join(
      __dirname,
      '../../showcase/watermark_tests/YAYs',
      `watermark_${filename}.png`
    );

    if (!fs.existsSync(previewPath)) {
      return res.status(404).json({
        success: false,
        error: 'Preview image not found',
      });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    fs.createReadStream(previewPath).pipe(res);
  } catch (error) {
    log.error({ err: error }, 'Get watermark preview error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Apply watermark preview to image
 * POST /nft/preview-watermark
 * Used for cycling through watermark styles before finalizing
 * Body: { imageBase64, domain, watermarkStyle }
 */
router.post('/nft/preview-watermark', async (req, res) => {
  try {
    const { imageBase64, domain, watermarkStyle } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'imageBase64 is required',
      });
    }

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'domain is required',
      });
    }

    if (!watermarkStyle) {
      return res.status(400).json({
        success: false,
        error: 'watermarkStyle is required',
      });
    }

    // Validate style
    if (!WATERMARK_STYLES[watermarkStyle]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid watermark style',
        validStyles: Object.keys(WATERMARK_STYLES),
      });
    }

    // Convert base64 to buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Apply watermark
    const watermarkedBuffer = await addDomainWatermark(
      imageBuffer,
      domain,
      null,
      watermarkStyle
    );

    res.json({
      success: true,
      imageBase64: `data:image/png;base64,${watermarkedBuffer.toString('base64')}`,
      watermarkStyle,
    });
  } catch (error) {
    log.error({ err: error }, 'Preview watermark error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Finalize NFT with selected watermark and upload to IPFS
 * POST /nft/finalize-with-watermark
 * Body: { imageBase64, domain, watermarkStyle, metadata }
 * Requires wallet authentication
 */
router.post('/nft/finalize-with-watermark', auth.verifyWallet, async (req, res) => {
  try {
    const { imageBase64, domain, watermarkStyle, metadata } = req.body;
    const wallet = req.authenticatedWallet;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'imageBase64 is required',
      });
    }

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'domain is required',
      });
    }

    if (!watermarkStyle) {
      return res.status(400).json({
        success: false,
        error: 'watermarkStyle is required',
      });
    }

    // Validate style
    if (!WATERMARK_STYLES[watermarkStyle]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid watermark style',
        validStyles: Object.keys(WATERMARK_STYLES),
      });
    }

    const normalizedWallet = wallet.toLowerCase();

    // Check credits balance (need 1 for finalization)
    const credits = await nftService.getPreviewCredits(normalizedWallet);
    if (credits.remaining <= 0) {
      return res.status(403).json({
        success: false,
        error: 'No credits remaining for finalization',
        remaining: 0,
      });
    }

    // Convert base64 to buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Apply final watermark
    const watermarkedBuffer = await addDomainWatermark(
      imageBuffer,
      domain,
      null,
      watermarkStyle
    );

    // Upload to IPFS via Pinata
    const imageResult = await nftStorageService.uploadImage(watermarkedBuffer);
    if (!imageResult.success) {
      throw new Error(`IPFS image upload failed: ${imageResult.error}`);
    }
    const imageCID = imageResult.cid;

    const metadataResult = await nftStorageService.uploadMetadata({
      ...metadata,
      name: domain,
      description: `${domain} - Halcyon Subdomain NFT`,
      watermarkStyle,
      image: `ipfs://${imageCID}`,
    });
    if (!metadataResult.success) {
      throw new Error(`IPFS metadata upload failed: ${metadataResult.error}`);
    }
    const metadataCID = metadataResult.cid;

    // Use one credit for finalization
    await nftService.usePreviewCredit(normalizedWallet);

    // Log the credit transaction
    await nftService.logCreditTransaction(normalizedWallet, -1, 'finalization', domain);

    // Update artwork in V2 tables (sld_artwork_v2) + set on-chain
    const sldResult = await query(
      'SELECT id, token_id FROM slds_v2 WHERE full_name = $1',
      [domain]
    );
    if (sldResult.rows.length > 0) {
      const sld = sldResult.rows[0];
      // Try to update existing artwork row first
      const updated = await query(
        `UPDATE sld_artwork_v2
         SET status = 'completed', ipfs_cid = $1, completed_at = NOW()
         WHERE sld_id = $2 AND status != 'completed'
         RETURNING id`,
        [imageCID, sld.id]
      );
      // If no existing row to update, insert a new one
      if (updated.rows.length === 0) {
        await query(
          `INSERT INTO sld_artwork_v2 (sld_id, token_id, status, ipfs_cid, completed_at)
           VALUES ($1, $2, 'completed', $3, NOW())
           ON CONFLICT DO NOTHING`,
          [sld.id, sld.token_id, imageCID]
        );
      }

      // Set artwork on-chain via HsrSld.setArtwork(tokenId, ipfsCID)
      if (config.contractsV2?.hsrSld && config.flare?.privateKey) {
        try {
          const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
          const wallet = new ethers.Wallet(config.flare.privateKey, provider);
          const hsrSldContract = new ethers.Contract(
            config.contractsV2.hsrSld,
            ['function setArtwork(uint256 tokenId, string calldata ipfsHash) external'],
            wallet,
          );
          const tx = await hsrSldContract.setArtwork(sld.token_id, imageCID);
          const receipt = await tx.wait(1);
          log.info({ tokenId: sld.token_id, imageCID, txHash: receipt.hash }, 'Artwork set on-chain');
        } catch (chainError) {
          log.error({ err: chainError, tokenId: sld.token_id }, 'Failed to set artwork on-chain (DB updated, IPFS uploaded)');
        }
      }
    }

    // Also update V1 domains table (fallback for legacy data)
    await query(
      'UPDATE domains SET nft_status = $1, nft_image_cid = $2, nft_metadata_cid = $3, metadata_uri = $4 WHERE fqdn = $5',
      ['customized', imageCID, metadataCID, `ipfs://${metadataCID}`, domain]
    );

    // Get updated credits
    const updatedCredits = await nftService.getPreviewCredits(normalizedWallet);

    res.json({
      success: true,
      imageCID,
      metadataCID,
      metadataURI: `ipfs://${metadataCID}`,
      imageUrl: `https://gateway.pinata.cloud/ipfs/${imageCID}`,
      metadataUrl: `https://gateway.pinata.cloud/ipfs/${metadataCID}`,
      watermarkStyle,
      remaining: updatedCredits.remaining,
    });
  } catch (error) {
    log.error({ err: error }, 'Finalize with watermark error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =============================================================
//                     FLUX MULTI-GPU
// =============================================================

/**
 * Get status of all 3 ComfyUI servers
 * GET /nft/flux-servers-status
 */
router.get('/nft/flux-servers-status', async (req, res) => {
  try {
    const status = await fluxMultiGPUService.checkServerHealth();
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    log.error({ err: error }, 'Get flux servers status error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Generate 3 images in parallel (one per GPU)
 * POST /nft/flux-generate
 * Body: { subdomain, tld, themeId, customPrompt?, wallet, style?, styleId? }
 * style: 'playground' (photorealistic) or 'animagine' (anime) - defaults to 'playground'
 * styleId: Optional art style ID (e.g., 'watercolor', 'anime', 'cinematic') - controls visual rendering
 * Returns: { success, imageBase64, seed, theme, remaining }
 */
router.post('/nft/flux-generate', async (req, res) => {
  const { subdomain, tld, themeId, customPrompt, wallet, style, styleId } = req.body;

  // Validate inputs
  if (!subdomain || !tld) {
    return res.status(400).json({
      success: false,
      error: 'subdomain and tld are required',
    });
  }

  if (!themeId) {
    return res.status(400).json({
      success: false,
      error: 'themeId is required',
    });
  }

  if (!wallet || !ethers.isAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: 'Valid wallet address is required',
    });
  }

  // Map style to model ID
  const STYLE_TO_MODEL = {
    'playground': 'sdxl-playground-lora',
    'animagine': 'sdxl-animagine',
  };
  const selectedStyle = style && STYLE_TO_MODEL[style] ? style : 'playground';
  const modelId = STYLE_TO_MODEL[selectedStyle];

  // Validate art style if provided
  let artStyle = null;
  if (styleId) {
    artStyle = artStyles.getStyleById(styleId);
    if (!artStyle) {
      return res.status(400).json({
        success: false,
        error: `Invalid styleId: ${styleId}`,
        availableStyles: artStyles.getAllStyleIds(),
      });
    }
  }

  const normalizedWallet = wallet.toLowerCase();
  const fqdn = `${subdomain.toLowerCase()}.${tld.toLowerCase()}`;

  try {
    // Check preview credits
    const credits = await nftService.getPreviewCredits(normalizedWallet);
    if (credits.remaining <= 0) {
      return res.status(403).json({
        success: false,
        error: 'No preview credits remaining',
        remaining: 0,
      });
    }

    // Use one credit
    await nftService.usePreviewCredit(normalizedWallet);

    // Set the model for this generation (only switches if different)
    await setActiveModel(modelId);

    console.log(`[FluxGenerate] Starting generation for ${fqdn} theme=${themeId}`);
    if (artStyle) {
      console.log(`[FluxGenerate] Art Style: ${artStyle.name} (${artStyle.id})`);
    }

    const result = await fluxMultiGPUService.generateSingle({
      domain: fqdn,
      themeId,
      customPrompt: customPrompt?.trim()?.slice(0, 500),
      artStyle,
    });

    const updatedCredits = await nftService.getPreviewCredits(normalizedWallet);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        remaining: updatedCredits.remaining,
      });
    }

    // Convert to base64
    const imageBase64 = `data:image/png;base64,${result.imageBuffer.toString('base64')}`;

    res.json({
      success: true,
      imageBase64,
      seed: result.seed,
      theme: result.theme,
      tier: result.tier,
      style: selectedStyle,
      artStyle: artStyle ? { id: artStyle.id, name: artStyle.name, category: artStyle.category } : null,
      remaining: updatedCredits.remaining,
    });
  } catch (error) {
    log.error({ err: error }, 'Flux generation error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get status/result of a generation
 * GET /nft/flux-generation/:id
 */
router.get('/nft/flux-generation/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // First check in-memory cache
    const cached = fluxMultiGPUService.getGeneration(id);
    if (cached) {
      return res.json({
        success: true,
        ...cached,
      });
    }

    // Check database
    const genResult = await query(
      'SELECT * FROM flux_generations WHERE generation_id = $1',
      [id]
    );

    if (genResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Generation not found',
      });
    }

    const generation = genResult.rows[0];

    // Get images
    const imagesResult = await query(
      'SELECT * FROM flux_generation_images WHERE generation_id = $1 ORDER BY image_index',
      [id]
    );

    res.json({
      success: true,
      generationId: generation.generation_id,
      domain: generation.fqdn,
      status: generation.status,
      images: imagesResult.rows.map(img => ({
        index: img.image_index,
        success: img.status === 'completed',
        theme: {
          id: img.theme_id,
          name: img.theme_name,
          category: img.theme_category,
        },
        seed: img.seed,
        server: img.server_name,
        generationTime: img.generation_time_seconds,
        error: img.error_message,
        imageCID: img.image_cid,
      })),
      successCount: generation.success_count,
      totalTime: generation.total_time_seconds,
      createdAt: generation.created_at,
    });
  } catch (error) {
    log.error({ err: error }, 'Get flux generation error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Select an image from a generation for NFT minting
 * POST /nft/flux-select
 * Body: { generationId, selectedIndex, wallet }
 */
router.post('/nft/flux-select', async (req, res) => {
  const { generationId, selectedIndex, wallet } = req.body;

  if (!generationId) {
    return res.status(400).json({
      success: false,
      error: 'generationId is required',
    });
  }

  if (typeof selectedIndex !== 'number' || selectedIndex < 0 || selectedIndex > 2) {
    return res.status(400).json({
      success: false,
      error: 'selectedIndex must be 0, 1, or 2',
    });
  }

  if (!wallet || !ethers.isAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: 'Valid wallet address is required',
    });
  }

  const normalizedWallet = wallet.toLowerCase();

  try {
    // Verify the generation exists and belongs to this wallet
    const genResult = await query(
      'SELECT * FROM flux_generations WHERE generation_id = $1 AND wallet_address = $2',
      [generationId, normalizedWallet]
    );

    if (genResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Generation not found or not owned by this wallet',
      });
    }

    const generation = genResult.rows[0];

    // Check the selected image exists and was successful
    const imageResult = await query(
      'SELECT * FROM flux_generation_images WHERE generation_id = $1 AND image_index = $2',
      [generationId, selectedIndex]
    );

    if (imageResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selected image not found',
      });
    }

    const selectedImage = imageResult.rows[0];

    if (selectedImage.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Selected image generation failed',
      });
    }

    // Record the selection
    await query(`
      INSERT INTO flux_nft_selections (generation_id, selected_index)
      VALUES ($1, $2)
      ON CONFLICT (generation_id) DO UPDATE SET
        selected_index = $2,
        selected_at = NOW(),
        nft_prepared = false,
        metadata_cid = NULL,
        image_cid = NULL
    `, [generationId, selectedIndex]);

    res.json({
      success: true,
      generationId,
      selectedIndex,
      selectedTheme: {
        id: selectedImage.theme_id,
        name: selectedImage.theme_name,
        category: selectedImage.theme_category,
      },
      domain: generation.fqdn,
      message: 'Image selected for NFT. Use /nft/prepare to generate final NFT.',
    });
  } catch (error) {
    log.error({ err: error }, 'Flux select error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get service status
 * GET /nft/flux-status
 */
router.get('/nft/flux-status', async (req, res) => {
  try {
    const status = await fluxMultiGPUService.getStatus();
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    log.error({ err: error }, 'Get flux status error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =============================================================
//     SIMPLIFIED REGISTRATION: BUY FIRST, MINT LATER
// =============================================================

/**
 * Get unified credits balance for a wallet
 * GET /nft/credits/:wallet
 * Returns total available credits, earned, spent, and transaction history
 */
router.get('/nft/credits/:wallet', async (req, res) => {
  const { wallet } = req.params;

  if (!wallet || !ethers.isAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: 'Valid wallet address is required',
    });
  }

  try {
    const credits = await nftService.getUnifiedCredits(wallet);
    res.json({
      success: true,
      ...credits,
    });
  } catch (error) {
    log.error({ err: error }, 'Get credits error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Generate NFT image for an owned domain (from dashboard)
 * POST /nft/generate-for-domain
 * Body: { fqdn, theme: themeId, customPrompt?, style?, styleId? }
 * Requires wallet authentication - user must own the domain
 * Generates 1 image per call, costs 1 credit
 */
router.post('/nft/generate-for-domain', auth.verifyWallet, async (req, res) => {
  const { fqdn, theme, customPrompt, style, styleId } = req.body;
  const wallet = req.authenticatedWallet;

  if (!fqdn) {
    return res.status(400).json({
      success: false,
      error: 'fqdn is required',
    });
  }

  if (!theme || typeof theme !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'theme is required',
    });
  }

  // Convert single theme to array for internal processing
  const themes = [theme];

  const normalizedFqdn = fqdn.toLowerCase();
  const normalizedWallet = wallet.toLowerCase();

  try {
    // 1. Verify wallet owns the domain (check V2 first, then V1)
    let domain;
    const v2Result = await query(
      'SELECT id, token_id, owner_address AS owner_wallet, label AS subdomain FROM slds_v2 WHERE full_name = $1',
      [normalizedFqdn]
    );
    if (v2Result.rows.length > 0) {
      domain = v2Result.rows[0];
    } else {
      const domainResult = await query(
        'SELECT id, token_id, owner_wallet, subdomain, nft_status FROM domains WHERE fqdn = $1',
        [normalizedFqdn]
      );
      if (domainResult.rows.length > 0) {
        domain = domainResult.rows[0];
      }
    }

    if (!domain) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found',
      });
    }

    if (domain.owner_wallet.toLowerCase() !== normalizedWallet) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this domain',
      });
    }

    // 2. Check preview credits balance
    const credits = await nftService.getPreviewCredits(normalizedWallet);
    if (credits.remaining <= 0) {
      return res.status(403).json({
        success: false,
        error: 'No preview credits remaining',
        remaining: 0,
      });
    }

    // 3. Use one credit
    await nftService.usePreviewCredit(normalizedWallet);

    // 4. Log the credit transaction
    await nftService.logCreditTransaction(normalizedWallet, -1, 'generation', normalizedFqdn);

    // 5. Map style to model ID
    const STYLE_TO_MODEL = {
      'playground': 'sdxl-playground-lora',
      'animagine': 'sdxl-animagine',
    };
    const selectedStyle = style && STYLE_TO_MODEL[style] ? style : 'playground';
    const modelId = STYLE_TO_MODEL[selectedStyle];

    // 6. Validate art style if provided
    let artStyle = null;
    if (styleId) {
      artStyle = artStyles.getStyleById(styleId);
      if (!artStyle) {
        return res.status(400).json({
          success: false,
          error: `Invalid styleId: ${styleId}`,
          availableStyles: artStyles.getAllStyleIds(),
        });
      }
    }

    // 7. Set the model and generate (only switches if different)
    await setActiveModel(modelId);

    console.log(`[NFT Dashboard] Generating for owned domain ${normalizedFqdn}`);
    console.log(`[NFT Dashboard] Style: ${selectedStyle}, Themes: ${themes.join(', ')}`);

    let result;
    try {
      // Generate images WITHOUT watermark - watermark will be applied during finalization
      result = await fluxMultiGPUService.generateParallel(
        normalizedFqdn,
        themes,
        customPrompt?.trim()?.slice(0, 500),
        artStyle,
        { skipWatermark: true }
      );
    } finally {
      // Model stays as-is - will only switch if next generation needs a different model
    }

    const updatedCredits = await nftService.getPreviewCredits(normalizedWallet);

    result.style = selectedStyle;
    if (artStyle) {
      result.artStyle = {
        id: artStyle.id,
        name: artStyle.name,
        category: artStyle.category,
      };
    }

    // Store in database
    try {
      await query(`
        INSERT INTO flux_generations (generation_id, wallet_address, fqdn, custom_prompt, status, completed_at, total_time_seconds, success_count)
        VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
      `, [
        result.generationId,
        normalizedWallet,
        normalizedFqdn,
        customPrompt?.trim()?.slice(0, 500) || null,
        result.success ? 'completed' : 'failed',
        result.totalTime,
        result.successCount,
      ]);

      for (const img of result.images) {
        await query(`
          INSERT INTO flux_generation_images (generation_id, image_index, theme_id, theme_name, theme_category, seed, status, server_name, generation_time_seconds, image_base64, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          result.generationId,
          img.index,
          img.theme.id,
          img.theme.name,
          img.theme.category,
          img.seed || 0,
          img.success ? 'completed' : 'failed',
          img.server,
          img.generationTime || null,
          img.success ? img.imageBase64 : null,
          img.error || null,
        ]);
      }
    } catch (dbError) {
      log.error({ err: dbError }, 'Failed to store generation in DB - generation succeeded but record not persisted');
    }

    res.json({
      success: result.success,
      generationId: result.generationId,
      domain: result.domain,
      images: result.images,
      successCount: result.successCount,
      totalCount: result.totalCount,
      totalTime: result.totalTime,
      remaining: updatedCredits.remaining,
      source: 'dashboard',
    });
  } catch (error) {
    log.error({ err: error }, 'Generate for domain error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Finalize NFT with selected image (from dashboard)
 * POST /nft/finalize
 * Body: { fqdn, generationId, selectedIndex }
 * Requires wallet authentication - user must own the domain
 * Costs 1 credit for finalization
 */
router.post('/nft/finalize', auth.verifyWallet, async (req, res) => {
  const { fqdn, generationId, selectedIndex } = req.body;
  const wallet = req.authenticatedWallet;

  if (!fqdn) {
    return res.status(400).json({
      success: false,
      error: 'fqdn is required',
    });
  }

  if (!generationId) {
    return res.status(400).json({
      success: false,
      error: 'generationId is required',
    });
  }

  if (typeof selectedIndex !== 'number' || selectedIndex < 0 || selectedIndex > 2) {
    return res.status(400).json({
      success: false,
      error: 'selectedIndex must be 0, 1, or 2',
    });
  }

  const normalizedFqdn = fqdn.toLowerCase();
  const normalizedWallet = wallet.toLowerCase();

  try {
    // 1. Check credits balance (need 1 for finalization)
    const credits = await nftService.getPreviewCredits(normalizedWallet);
    if (credits.remaining <= 0) {
      return res.status(403).json({
        success: false,
        error: 'No credits remaining for finalization',
        remaining: 0,
      });
    }

    // 2. Finalize the NFT
    const result = await nftService.finalizeNFTFromGeneration(
      normalizedFqdn,
      generationId,
      selectedIndex,
      normalizedWallet
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    // 3. Auto-set IPFS contenthash + dnslink for the domain
    if (result.imageCid) {
      const [subdomain, ...tldParts] = normalizedFqdn.split('.');
      const tld = tldParts.join('.');

      // Update V1 domains table if row exists
      await query('UPDATE domains SET contenthash = $1, updated_at = NOW() WHERE fqdn = $2', [result.imageCid, normalizedFqdn]);

      // Update V2 sld_artwork_v2 if row exists
      const sldResult = await query('SELECT id, token_id FROM slds_v2 WHERE full_name = $1', [normalizedFqdn]);
      if (sldResult.rows.length > 0) {
        const sld = sldResult.rows[0];
        await query(
          `UPDATE sld_artwork_v2 SET status = 'completed', ipfs_cid = $1, completed_at = NOW()
           WHERE sld_id = $2 AND status != 'completed'
           RETURNING id`,
          [result.imageCid, sld.id]
        );
      }

      await pdnsService.setDnslink(subdomain, tld, result.imageCid).catch(err =>
        log.warn({ err: err }, 'Auto dnslink failed (non-fatal)')
      );
    }

    // 4. Use one credit for finalization
    await nftService.usePreviewCredit(normalizedWallet);

    // 5. Log the credit transaction
    await nftService.logCreditTransaction(normalizedWallet, -1, 'finalization', normalizedFqdn);

    // 6. Get updated credits
    const updatedCredits = await nftService.getPreviewCredits(normalizedWallet);

    res.json({
      success: true,
      metadataUri: result.metadataUri,
      metadataUrl: result.metadataUrl,
      imageCid: result.imageCid,
      imageUrl: result.imageUrl,
      remaining: updatedCredits.remaining,
      message: 'NFT customized successfully',
    });
  } catch (error) {
    log.error({ err: error }, 'Finalize NFT error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =============================================================
//                     ADMIN: IMAGE MODEL SELECTION
// =============================================================

/**
 * Get current image model and available models
 * POST /admin/image-model/status
 * Requires admin read authentication (timestamp-based, no nonce)
 */
router.post('/admin/image-model/status', auth.verifyAdminReadAuth, async (req, res) => {
  try {
    const activeConfig = getActiveModelConfig();
    const availableModels = getAvailableModels();

    res.json({
      success: true,
      activeModel: activeConfig.type,
      activeConfig: activeConfig.config,
      availableModels,
    });
  } catch (error) {
    log.error({ err: error }, 'Get image model error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Set active image model
 * POST /admin/image-model
 * Requires admin authentication
 * Body: { model: "sdxl-playground" | "sdxl-playground-lora" | "sdxl-animagine" }
 */
router.post('/admin/image-model', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    const { model } = req.body;

    if (!model) {
      return res.status(400).json({
        success: false,
        error: 'model is required',
      });
    }

    console.log(`[Admin] ${req.authenticatedWallet} changing image model to: ${model}`);

    const newConfig = await setActiveModel(model);

    res.json({
      success: true,
      message: `Image model changed to ${model}`,
      activeModel: newConfig.type,
      activeConfig: newConfig.config,
    });
  } catch (error) {
    log.error({ err: error }, 'Set image model error');
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get GPU health status
 * POST /admin/gpu-health
 * Returns status of all ComfyUI GPU instances
 */
router.post('/admin/gpu-health', auth.verifyAdminReadAuth, async (req, res) => {
  try {
    // Initialize if needed
    if (!gpuHealthWatcher.initialized) {
      await gpuHealthWatcher.init();
    }

    // Force a fresh check
    await gpuHealthWatcher.forceCheck();
    const status = gpuHealthWatcher.getStatus();

    const onlineCount = Object.values(status).filter(s => s.online).length;
    const totalCount = Object.keys(status).length;

    res.json({
      success: true,
      gpus: status,
      summary: {
        online: onlineCount,
        offline: totalCount - onlineCount,
        total: totalCount,
        allHealthy: onlineCount === totalCount,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'GPU health check error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Restart a specific GPU's ComfyUI instance
 * POST /admin/gpu-restart
 * Body: { gpu: "GPU0" | "GPU1" | "GPU2" }
 */
router.post('/admin/gpu-restart', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    const { gpu } = req.body;

    if (!gpu) {
      return res.status(400).json({
        success: false,
        error: 'gpu is required (GPU0, GPU1, or GPU2)',
      });
    }

    // Find the server
    const { SERVERS } = await import('../services/fluxMultiGPU.js');
    const server = SERVERS.find(s => s.name === gpu);

    if (!server) {
      return res.status(400).json({
        success: false,
        error: `Invalid GPU: ${gpu}. Valid options: GPU0, GPU1, GPU2`,
      });
    }

    console.log(`[Admin] ${req.authenticatedWallet} restarting ${gpu}`);

    // Initialize if needed
    if (!gpuHealthWatcher.initialized) {
      await gpuHealthWatcher.init();
    }

    // Attempt restart
    const success = await gpuHealthWatcher.attemptRestart(server);

    if (success) {
      res.json({
        success: true,
        message: `${gpu} restarted successfully`,
        status: gpuHealthWatcher.getStatus(),
      });
    } else {
      res.status(500).json({
        success: false,
        error: `Failed to restart ${gpu}`,
        status: gpuHealthWatcher.getStatus(),
      });
    }
  } catch (error) {
    log.error({ err: error }, 'GPU restart error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Restart all offline GPUs
 * POST /admin/gpu-restart-all
 */
router.post('/admin/gpu-restart-all', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    console.log(`[Admin] ${req.authenticatedWallet} restarting all offline GPUs`);

    // Initialize if needed
    if (!gpuHealthWatcher.initialized) {
      await gpuHealthWatcher.init();
    }

    // Force check
    await gpuHealthWatcher.forceCheck();

    // Find offline servers
    const { SERVERS } = await import('../services/fluxMultiGPU.js');
    const offlineServers = SERVERS.filter(server => {
      const status = gpuHealthWatcher.serverStatus.get(server.url);
      return !status?.online;
    });

    if (offlineServers.length === 0) {
      return res.json({
        success: true,
        message: 'All GPUs are already online',
        restarted: [],
        status: gpuHealthWatcher.getStatus(),
      });
    }

    // Restart all offline
    const results = await Promise.all(
      offlineServers.map(async (server) => {
        const success = await gpuHealthWatcher.attemptRestart(server);
        return { gpu: server.name, success };
      })
    );

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: successCount > 0,
      message: `Restarted ${successCount}/${offlineServers.length} GPUs`,
      restarted: results,
      status: gpuHealthWatcher.getStatus(),
    });
  } catch (error) {
    log.error({ err: error }, 'GPU restart-all error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Prepare NFT from an already-generated Flux image (no regeneration)
 * POST /nft/flux-prepare
 *
 * This endpoint uses the already-generated Flux image and uploads it to IPFS.
 * Unlike /nft/prepare, this does NOT call Stable Diffusion/ComfyUI,
 * avoiding VRAM issues by reusing the existing image.
 */
router.post('/nft/flux-prepare', async (req, res) => {
  const { generationId, selectedIndex, subdomain, tld, wallet } = req.body;

  console.log('[FluxPrepare] Request:', { generationId, selectedIndex, subdomain, tld, wallet, selectedIndexType: typeof selectedIndex });

  // Validate required fields
  if (!generationId) {
    return res.status(400).json({
      success: false,
      error: 'generationId is required',
    });
  }

  if (typeof selectedIndex !== 'number' || selectedIndex < 0 || selectedIndex > 2) {
    return res.status(400).json({
      success: false,
      error: 'selectedIndex must be 0, 1, or 2',
    });
  }

  if (!subdomain || !tld) {
    return res.status(400).json({
      success: false,
      error: 'subdomain and tld are required',
    });
  }

  if (!wallet || !ethers.isAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: 'Valid wallet address is required',
    });
  }

  const normalizedWallet = wallet.toLowerCase();
  const fqdn = `${subdomain.toLowerCase()}.${tld.toLowerCase()}`;

  try {
    // Verify the generation exists and belongs to this wallet
    const genResult = await query(
      'SELECT * FROM flux_generations WHERE generation_id = $1 AND wallet_address = $2',
      [generationId, normalizedWallet]
    );

    if (genResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Generation not found or not owned by this wallet',
      });
    }

    const generation = genResult.rows[0];

    // Verify the domain matches
    if (generation.fqdn.toLowerCase() !== fqdn) {
      return res.status(400).json({
        success: false,
        error: 'Generation domain does not match requested domain',
      });
    }

    // Check if already prepared (cached)
    const selectionResult = await query(
      'SELECT * FROM flux_nft_selections WHERE generation_id = $1',
      [generationId]
    );

    if (selectionResult.rows.length > 0) {
      const selection = selectionResult.rows[0];
      if (selection.nft_prepared && selection.metadata_cid && selection.selected_index === selectedIndex) {
        console.log(`Using cached Flux NFT preparation for ${fqdn}`);
        return res.json({
          success: true,
          cached: true,
          fqdn,
          subdomain: subdomain.toLowerCase(),
          tld: tld.toLowerCase(),
          metadataURI: `ipfs://${selection.metadata_cid}`,
          imageCID: selection.image_cid,
          metadataCID: selection.metadata_cid,
          imageURL: nftStorageService.getGatewayUrl(selection.image_cid),
          metadataURL: nftStorageService.getGatewayUrl(selection.metadata_cid),
          generationId,
          selectedIndex,
        });
      }
    }

    // Get the selected image
    const imageResult = await query(
      'SELECT * FROM flux_generation_images WHERE generation_id = $1 AND image_index = $2',
      [generationId, selectedIndex]
    );

    if (imageResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selected image not found',
      });
    }

    const selectedImage = imageResult.rows[0];

    if (selectedImage.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Selected image generation was not successful',
      });
    }

    if (!selectedImage.image_base64) {
      return res.status(400).json({
        success: false,
        error: 'Selected image data not available',
      });
    }

    // Convert base64 to buffer
    // The image_base64 might include the data URI prefix, strip it if present
    let base64Data = selectedImage.image_base64;
    if (base64Data.startsWith('data:')) {
      base64Data = base64Data.split(',')[1];
    }
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Determine tier
    const tier = nftService.CONFIG.tiers[
      subdomain.length === 1 ? 'ultra_premium' :
      subdomain.length === 2 ? 'premium' :
      subdomain.length === 3 ? 'standard_plus' : 'standard'
    ];

    // Create NFT metadata
    const metadata = {
      name: fqdn,
      description: `${fqdn} - A Handshake subdomain NFT on Flare Network. This NFT represents ownership of the ${subdomain}.${tld} subdomain and includes DNS management capabilities. Generated with Flux AI art unique to this domain. Theme: ${selectedImage.theme_name}.`,
      external_url: `https://${fqdn}`,
      background_color: '0F0F1A',
      attributes: [
        { trait_type: 'TLD', value: tld },
        { trait_type: 'Subdomain', value: subdomain },
        { trait_type: 'Tier', value: tier?.name || 'Standard' },
        { trait_type: 'Length', value: subdomain.length, display_type: 'number' },
        { trait_type: 'Generation Seed', value: selectedImage.seed || 0, display_type: 'number' },
        { trait_type: 'Art Type', value: 'Flux AI Generated' },
        { trait_type: 'Art Theme', value: selectedImage.theme_name },
        { trait_type: 'Theme Category', value: selectedImage.theme_category },
      ],
      properties: {
        token_id: null, // Not minted yet
        owner: normalizedWallet,
        network: process.env.FLARE_CHAIN_ID === '14' ? 'Flare' : 'Flare Coston2',
        protocol: 'Handshake',
        generation_seed: selectedImage.seed || 0,
        art_theme: selectedImage.theme_name,
        flux_generation_id: generationId,
      },
    };

    // Upload to IPFS
    console.log(`Uploading Flux NFT to IPFS for ${fqdn}...`);
    const uploadResult = await nftStorageService.uploadNFT(
      imageBuffer,
      metadata,
      `${subdomain}-${tld}-flux.png`
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: uploadResult.error || 'IPFS upload failed',
      });
    }

    // Update the selection record with IPFS data
    await query(`
      INSERT INTO flux_nft_selections (generation_id, selected_index, nft_prepared, image_cid, metadata_cid)
      VALUES ($1, $2, true, $3, $4)
      ON CONFLICT (generation_id) DO UPDATE SET
        selected_index = $2,
        nft_prepared = true,
        image_cid = $3,
        metadata_cid = $4,
        selected_at = NOW()
    `, [generationId, selectedIndex, uploadResult.imageCID, uploadResult.metadataCID]);

    // Also store in nft_preparations for consistency
    await query(`
      INSERT INTO nft_preparations (fqdn, subdomain, tld, image_cid, metadata_cid, generation_seed, tier, theme, custom_prompt, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (fqdn) DO UPDATE SET
        image_cid = EXCLUDED.image_cid,
        metadata_cid = EXCLUDED.metadata_cid,
        generation_seed = EXCLUDED.generation_seed,
        tier = EXCLUDED.tier,
        theme = EXCLUDED.theme,
        custom_prompt = EXCLUDED.custom_prompt,
        created_at = NOW()
    `, [
      fqdn,
      subdomain.toLowerCase(),
      tld.toLowerCase(),
      uploadResult.imageCID,
      uploadResult.metadataCID,
      selectedImage.seed || 0,
      subdomain.length === 1 ? 'ultra_premium' :
        subdomain.length === 2 ? 'premium' :
        subdomain.length === 3 ? 'standard_plus' : 'standard',
      selectedImage.theme_name,
      generation.custom_prompt || null,
    ]);

    console.log(`Flux NFT prepared successfully for ${fqdn}. Metadata URI: ${uploadResult.metadataURI}`);

    res.json({
      success: true,
      cached: false,
      fqdn,
      subdomain: subdomain.toLowerCase(),
      tld: tld.toLowerCase(),
      metadataURI: uploadResult.metadataURI,
      imageCID: uploadResult.imageCID,
      metadataCID: uploadResult.metadataCID,
      imageURL: uploadResult.imageURL,
      metadataURL: uploadResult.metadataURL,
      generationId,
      selectedIndex,
      theme: selectedImage.theme_name,
    });
  } catch (error) {
    log.error({ err: error }, 'Flux NFT prepare error');

    // Check for VRAM/CUDA errors
    const errorMsg = error.message || '';
    if (errorMsg.includes('CUDA') || errorMsg.includes('VRAM') || errorMsg.includes('out of memory')) {
      return res.status(503).json({
        success: false,
        error: 'GPU memory issue detected. Please try again in a moment.',
        errorType: 'VRAM_ERROR',
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =============================================================
//                    MARKETPLACE STATS
// =============================================================

/**
 * Get marketplace statistics
 * GET /marketplace/stats
 * Optimized: Combined 6 queries into 1 for better performance
 */
router.get('/marketplace/stats', async (req, res) => {
  try {
    // Check cache first (60 second TTL)
    const cacheKey = 'marketplace:stats';
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Single query that calculates all stats at once
    const result = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'sold' THEN sale_price::numeric END), 0) as total_volume,
        COALESCE(SUM(CASE WHEN status = 'sold' AND sold_at >= NOW() - INTERVAL '24 hours' THEN sale_price::numeric END), 0) as volume_24h,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as total_sales,
        MIN(CASE WHEN status = 'active' THEN price::numeric END) as floor_price,
        COALESCE(AVG(CASE WHEN status = 'sold' THEN sale_price::numeric END), 0) as avg_sale_price,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_listings
      FROM marketplace_listings
    `);

    const stats = result.rows[0];
    const response = {
      totalVolume: parseFloat(stats.total_volume) || 0,
      volume24h: parseFloat(stats.volume_24h) || 0,
      totalSales: parseInt(stats.total_sales) || 0,
      floorPrice: parseFloat(stats.floor_price) || 0,
      avgSalePrice: parseFloat(stats.avg_sale_price) || 0,
      activeListings: parseInt(stats.active_listings) || 0,
    };

    // Cache for 60 seconds
    cacheService.set(cacheKey, response, cacheService.TTL.STATS);

    res.json(response);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get recent sales
 * GET /marketplace/recent
 */
router.get('/marketplace/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  try {
    // Check cache first (30 second TTL)
    const cacheKey = `marketplace:recent:${limit}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const result = await query(`
      SELECT
        ml.fqdn,
        ml.sale_price as price,
        ml.buyer_wallet as buyer,
        ml.seller_wallet as seller,
        ml.sold_at,
        ml.token_id
      FROM marketplace_listings ml
      WHERE ml.status = 'sold'
      ORDER BY ml.sold_at DESC
      LIMIT $1
    `, [limit]);

    const response = {
      sales: result.rows.map(row => ({
        fqdn: row.fqdn,
        price: parseFloat(row.price),
        buyer: row.buyer,
        seller: row.seller,
        soldAt: row.sold_at,
        tokenId: row.token_id,
      })),
    };

    // Cache for 30 seconds
    cacheService.set(cacheKey, response, cacheService.TTL.RECENT);

    res.json(response);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get floor price by TLD
 * GET /marketplace/floor/:tld
 */
router.get('/marketplace/floor/:tld', async (req, res) => {
  const { tld } = req.params;

  try {
    // Check V1 + V2 for floor price
    const result = await query(`
      SELECT MIN(ml.price::numeric) as floor_price
      FROM marketplace_listings ml
      LEFT JOIN domains d ON ml.token_id::text = d.token_id::text
      LEFT JOIN tlds t ON d.tld_id = t.id
      LEFT JOIN slds_v2 s ON ml.token_id::text = s.token_id::text
      LEFT JOIN tlds_v2 t2 ON s.tld_id = t2.id
      WHERE ml.status = 'active'
      AND (LOWER(t.name) = LOWER($1) OR LOWER(t2.label) = LOWER($1))
    `, [tld]);

    res.json({
      tld,
      floorPrice: parseFloat(result.rows[0].floor_price) || null,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Get paginated marketplace listings
 * GET /marketplace/listings
 * Query params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20, max: 100)
 *   - sort: recent | price-low | price-high | ending-soon (default: recent)
 *   - filter: all | fixed | auction (default: all)
 *   - search: Search by domain name
 */
router.get('/marketplace/listings', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const sort = req.query.sort || 'recent';
    const filter = req.query.filter || 'all';
    const search = req.query.search || '';

    // Check cache first (30 second TTL) - only cache non-search queries
    const cacheKey = search ? null : `marketplace:listings:${page}:${limit}:${sort}:${filter}`;
    if (cacheKey) {
      const cached = cacheService.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }
    }

    // Build WHERE clause
    let whereConditions = ["ml.status = 'active'"];
    const params = [];
    let paramIndex = 1;

    // Filter by listing type
    if (filter === 'fixed') {
      whereConditions.push("ml.listing_type = 'fixed_price'");
    } else if (filter === 'auction') {
      whereConditions.push("ml.listing_type = 'auction'");
    }

    // Search filter
    if (search) {
      whereConditions.push(`(ml.fqdn ILIKE $${paramIndex} OR d.subdomain ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filter out ended auctions
    whereConditions.push("(ml.listing_type != 'auction' OR ml.end_time IS NULL OR ml.end_time > NOW())");

    const whereClause = whereConditions.join(' AND ');

    // Build ORDER BY clause
    let orderBy;
    switch (sort) {
      case 'price-low':
        orderBy = 'ml.price::numeric ASC';
        break;
      case 'price-high':
        orderBy = 'ml.price::numeric DESC';
        break;
      case 'ending-soon':
        orderBy = 'CASE WHEN ml.end_time IS NULL THEN 1 ELSE 0 END, ml.end_time ASC';
        break;
      case 'recent':
      default:
        orderBy = 'ml.created_at DESC';
    }

    // Get total count for pagination (V1 + V2)
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM marketplace_listings ml
      LEFT JOIN domains d ON ml.token_id::text = d.token_id::text
      LEFT JOIN slds_v2 s ON ml.token_id::text = s.token_id::text
      WHERE ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].total);

    // Get listings with domain info and image CID (V1 + V2)
    const listingsResult = await query(`
      SELECT
        ml.listing_id,
        ml.token_id,
        ml.seller_wallet as seller,
        ml.price,
        ml.listing_type,
        ml.status,
        ml.end_time,
        ml.highest_bidder,
        ml.highest_bid,
        ml.created_at,
        ml.fqdn as full_domain,
        COALESCE(d.subdomain, s.label) as subdomain,
        COALESCE(t.name, t2.label) as tld,
        COALESCE(d.nft_image_cid, a.ipfs_cid, p.image_cid) as image_cid
      FROM marketplace_listings ml
      LEFT JOIN domains d ON ml.token_id::text = d.token_id::text
      LEFT JOIN tlds t ON d.tld_id = t.id
      LEFT JOIN slds_v2 s ON ml.token_id::text = s.token_id::text
      LEFT JOIN tlds_v2 t2 ON s.tld_id = t2.id
      LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id AND a.status = 'completed'
      LEFT JOIN nft_preparations p ON LOWER(ml.fqdn) = LOWER(p.fqdn)
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Format response
    const listings = listingsResult.rows.map(row => ({
      listingId: row.listing_id,
      tokenId: row.token_id,
      seller: row.seller,
      price: parseFloat(row.price),
      listingType: row.listing_type === 'fixed_price' ? 0 : 1,
      status: row.status === 'active' ? 0 : row.status === 'sold' ? 1 : 2,
      endTime: row.end_time ? Math.floor(new Date(row.end_time).getTime() / 1000) : 0,
      highestBidder: row.highest_bidder || '0x0000000000000000000000000000000000000000',
      highestBid: parseFloat(row.highest_bid) || 0,
      createdAt: Math.floor(new Date(row.created_at).getTime() / 1000),
      fullDomain: row.full_domain,
      subdomain: row.subdomain,
      tld: row.tld,
      imageUrl: row.image_cid
        ? `/api/proxy/nft/image/${row.full_domain}?size=small`
        : null,
    }));

    const response = {
      listings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };

    // Cache for 30 seconds (only non-search queries)
    if (cacheKey) {
      cacheService.set(cacheKey, response, cacheService.TTL.LISTINGS);
    }

    res.json(response);
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                    PRICE SYNC SERVICE
// =============================================================

/**
 * Get price sync status
 * GET /price-sync
 */
router.get('/price-sync', (req, res) => {
  res.json(priceSyncService.getStatus());
});

/**
 * Start price sync service (admin only)
 * POST /price-sync/start
 */
router.post('/price-sync/start', auth.verifyWallet, auth.verifyAdmin, (req, res) => {
  const { intervalMs } = req.body;

  if (priceSyncService.isRunning) {
    return res.json({ message: 'Price sync already running', status: priceSyncService.getStatus() });
  }

  priceSyncService.start(intervalMs);
  res.json({ message: 'Price sync started', status: priceSyncService.getStatus() });
});

/**
 * Stop price sync service (admin only)
 * POST /price-sync/stop
 */
router.post('/price-sync/stop', auth.verifyWallet, auth.verifyAdmin, (req, res) => {
  priceSyncService.stop();
  res.json({ message: 'Price sync stopped', status: priceSyncService.getStatus() });
});

/**
 * Force price sync (admin only)
 * POST /price-sync/force
 */
router.post('/price-sync/force', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  const result = await priceSyncService.forceSync();
  res.json({ result, status: priceSyncService.getStatus() });
});

// =============================================================
//                    FAVORITES API
// =============================================================

/**
 * Get user favorites by wallet address
 * GET /favorites/:walletAddress
 */
router.get('/favorites/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    const result = await query(
      'SELECT theme_id, style_id, created_at FROM user_favorites WHERE wallet_address = $1 ORDER BY created_at DESC',
      [walletAddress.toLowerCase()]
    );

    const favorites = {
      themes: result.rows.filter(f => f.theme_id).map(f => f.theme_id),
      styles: result.rows.filter(f => f.style_id).map(f => f.style_id),
      count: result.rows.length,
    };

    res.json({ success: true, favorites });
  } catch (error) {
    log.error({ err: error }, 'Get favorites error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Add a favorite
 * POST /favorites
 * Body: { walletAddress, themeId?, styleId? }
 */
router.post('/favorites', async (req, res) => {
  try {
    const { walletAddress, themeId, styleId } = req.body;

    if (!walletAddress || (!themeId && !styleId)) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    await query(
      `INSERT INTO user_favorites (wallet_address, theme_id, style_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_address, COALESCE(theme_id, ''), COALESCE(style_id, '')) DO NOTHING`,
      [walletAddress.toLowerCase(), themeId || null, styleId || null]
    );

    res.json({ success: true });
  } catch (error) {
    log.error({ err: error }, 'Add favorite error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Remove a favorite
 * DELETE /favorites
 * Body: { walletAddress, themeId?, styleId? }
 */
router.delete('/favorites', async (req, res) => {
  try {
    const { walletAddress, themeId, styleId } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'Missing wallet address' });
    }

    let deleteQuery = 'DELETE FROM user_favorites WHERE wallet_address = $1';
    const params = [walletAddress.toLowerCase()];

    if (themeId) {
      deleteQuery += ' AND theme_id = $2';
      params.push(themeId);
    } else if (styleId) {
      deleteQuery += ' AND style_id = $2';
      params.push(styleId);
    }

    await query(deleteQuery, params);

    res.json({ success: true });
  } catch (error) {
    log.error({ err: error }, 'Remove favorite error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Sync favorites (merge localStorage with server)
 * POST /favorites/sync
 * Body: { walletAddress, themes: string[] }
 */
router.post('/favorites/sync', async (req, res) => {
  try {
    const { walletAddress, themes } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'Missing wallet address' });
    }

    if (!Array.isArray(themes)) {
      return res.status(400).json({ success: false, error: 'Themes must be an array' });
    }

    const walletLower = walletAddress.toLowerCase();

    // Get existing server favorites
    const existingResult = await query(
      `SELECT theme_id FROM user_favorites WHERE wallet_address = $1 AND theme_id IS NOT NULL`,
      [walletLower]
    );
    const serverThemes = new Set(existingResult.rows.map(r => r.theme_id));

    // Merge: add any themes from localStorage that aren't on server
    const toAdd = themes.filter(t => !serverThemes.has(t));

    for (const themeId of toAdd) {
      await query(
        `INSERT INTO user_favorites (wallet_address, theme_id)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address, COALESCE(theme_id, ''), COALESCE(style_id, ''))
         DO NOTHING`,
        [walletLower, themeId]
      );
    }

    // Return merged list (server + new from local)
    const mergedThemes = [...new Set([...serverThemes, ...themes])];

    res.json({
      success: true,
      favorites: {
        themes: mergedThemes,
        added: toAdd.length,
        total: mergedThemes.length,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Sync favorites error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

// =============================================================
//                    SHARE PREVIEW API
// =============================================================

/**
 * Create shareable link for a generated image
 * POST /share-preview
 * Body: { imageHash, domain, model, themes, walletAddress }
 */
router.post('/share-preview', async (req, res) => {
  try {
    const { imageHash, domain, model, themes, walletAddress } = req.body;

    if (!imageHash || !domain) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Generate unique share ID
    const shareId = crypto.randomBytes(8).toString('hex');

    await query(
      `INSERT INTO shared_images (share_id, image_hash, domain, model, themes, wallet_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [shareId, imageHash, domain, model, JSON.stringify(themes || []), walletAddress?.toLowerCase() || null]
    );

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const shareUrl = `${baseUrl}/share/${shareId}`;

    res.json({ success: true, shareId, shareUrl });
  } catch (error) {
    log.error({ err: error }, 'Create share preview error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Create shareable link for an existing domain (owned or listed)
 * POST /share-domain
 * Body: { domain } - the FQDN of the domain to share
 */
router.post('/share-domain', async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }

    // Look up the domain — try V1 first, then V2
    let domainData = null;
    let imageHash = null;

    const domainResult = await query(
      `SELECT d.*, np.image_cid as prep_image_cid, np.theme as prep_theme
       FROM domains d
       LEFT JOIN nft_preparations np ON d.fqdn = np.fqdn
       WHERE d.fqdn = $1`,
      [domain.toLowerCase()]
    );

    if (domainResult.rows.length > 0) {
      domainData = domainResult.rows[0];
      imageHash = domainData.nft_image_cid || domainData.prep_image_cid;
    } else {
      // Fallback to V2 slds_v2 + sld_artwork_v2
      const v2Result = await query(
        `SELECT s.full_name AS fqdn, s.owner_address AS owner_wallet, s.label AS subdomain,
                t.label AS tld_name, a.ipfs_cid AS nft_image_cid
         FROM slds_v2 s
         JOIN tlds_v2 t ON t.id = s.tld_id
         LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id AND a.status = 'completed'
         WHERE s.full_name = $1
         ORDER BY a.completed_at DESC
         LIMIT 1`,
        [domain.toLowerCase()]
      );
      if (v2Result.rows.length > 0) {
        domainData = v2Result.rows[0];
        imageHash = domainData.nft_image_cid;
      }
    }

    if (!domainData) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }

    if (!imageHash) {
      return res.status(400).json({ success: false, error: 'Domain does not have an NFT image yet' });
    }

    // Generate unique share ID
    const shareId = crypto.randomBytes(8).toString('hex');

    // Get theme name if available
    const themeName = domainData.prep_theme || 'Default';

    await query(
      `INSERT INTO shared_images (share_id, image_hash, domain, model, themes, wallet_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [shareId, imageHash, domain, 'flux', JSON.stringify([themeName]), domainData.owner_wallet?.toLowerCase() || null]
    );

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const shareUrl = `${baseUrl}/share/${shareId}`;

    res.json({ success: true, shareId, shareUrl });
  } catch (error) {
    log.error({ err: error }, 'Create share domain error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Get shared image data by share ID
 * GET /share/:shareId
 */
router.get('/share/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;

    const result = await query(
      'SELECT * FROM shared_images WHERE share_id = $1',
      [shareId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    const share = result.rows[0];

    // Increment views
    await query(
      'UPDATE shared_images SET views = views + 1 WHERE share_id = $1',
      [shareId]
    );

    const ipfsGateway = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

    res.json({
      success: true,
      share: {
        imageUrl: `${ipfsGateway}/${share.image_hash}`,
        domain: share.domain,
        model: share.model,
        themes: share.themes || [],
        createdAt: share.created_at,
        views: share.views + 1,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Get shared image error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

// =============================================================
//                    THEMES WITH THUMBNAILS
// =============================================================

import * as fluxThemes from '../data/themes/index.js';

/**
 * Get all themes with thumbnail paths
 * GET /themes
 */
router.get('/themes', async (req, res) => {
  try {
    const themes = fluxThemes.getAllThemes();

    const themesWithThumbnails = Object.entries(themes).reduce((acc, [category, categoryThemes]) => {
      acc[category] = categoryThemes.map(theme => ({
        ...theme,
        thumbnail: `/api/v1/static/theme-thumbnails/${theme.id}.webp`,
        thumbnailPlaceholder: `/api/v1/static/theme-thumbnails/placeholders/${theme.id}.webp`,
      }));
      return acc;
    }, {});

    const allThemesFlat = Object.values(themesWithThumbnails).flat();

    res.json({
      success: true,
      themes: themesWithThumbnails,
      all: allThemesFlat,
      count: allThemesFlat.length,
    });
  } catch (error) {
    log.error({ err: error }, 'Get themes error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

// =============================================================
//                    IPFS PINNING STATUS
// =============================================================

/**
 * Get IPFS provider status
 * GET /ipfs/status
 */
router.get('/ipfs/status', (req, res) => {
  try {
    const providerStatus = nftStorageService.getProviderStatus();
    const gateways = nftStorageService.getGateways();

    res.json({
      success: true,
      providers: providerStatus,
      gateways,
    });
  } catch (error) {
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Check pinning status for a specific CID
 * GET /ipfs/pin-status/:cid
 */
router.get('/ipfs/pin-status/:cid', async (req, res) => {
  const { cid } = req.params;

  if (!cid || cid.length < 10) {
    return res.status(400).json({ success: false, error: 'Invalid CID' });
  }

  try {
    const status = await nftStorageService.checkPinningStatus(cid);
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    log.error({ err: error }, 'Pin status check error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Ensure a CID is pinned across all providers
 * POST /ipfs/ensure-pinned
 * Body: { cid: string }
 */
router.post('/ipfs/ensure-pinned', auth.verifyWallet, async (req, res) => {
  const { cid } = req.body;

  if (!cid || cid.length < 10) {
    return res.status(400).json({ success: false, error: 'Invalid CID' });
  }

  try {
    console.log(`[IPFS] Ensuring CID ${cid} is pinned...`);
    const result = await nftStorageService.ensurePinned(cid);
    res.json({
      success: result.success,
      cid,
      status: result.status,
    });
  } catch (error) {
    log.error({ err: error }, 'Ensure pinned error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Batch check pinning health for multiple CIDs
 * POST /ipfs/batch-health
 * Body: { cids: string[] }
 */
router.post('/ipfs/batch-health', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  const { cids } = req.body;

  if (!cids || !Array.isArray(cids) || cids.length === 0) {
    return res.status(400).json({ success: false, error: 'CIDs array required' });
  }

  if (cids.length > 100) {
    return res.status(400).json({ success: false, error: 'Maximum 100 CIDs per request' });
  }

  try {
    console.log(`[IPFS] Batch health check for ${cids.length} CIDs...`);
    const result = await nftStorageService.batchCheckPinningHealth(cids);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    log.error({ err: error }, 'Batch health check error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Batch ensure multiple CIDs are pinned
 * POST /ipfs/batch-ensure-pinned
 * Body: { cids: string[] }
 */
router.post('/ipfs/batch-ensure-pinned', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  const { cids } = req.body;

  if (!cids || !Array.isArray(cids) || cids.length === 0) {
    return res.status(400).json({ success: false, error: 'CIDs array required' });
  }

  if (cids.length > 50) {
    return res.status(400).json({ success: false, error: 'Maximum 50 CIDs per request' });
  }

  try {
    console.log(`[IPFS] Batch ensure pinned for ${cids.length} CIDs...`);
    const result = await nftStorageService.batchEnsurePinned(cids);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    log.error({ err: error }, 'Batch ensure pinned error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Get NFT metadata history for a domain
 * GET /ipfs/metadata-history/:fqdn
 */
router.get('/ipfs/metadata-history/:fqdn', async (req, res) => {
  const { fqdn } = req.params;

  if (!fqdn) {
    return res.status(400).json({ success: false, error: 'FQDN required' });
  }

  try {
    const result = await query(
      'SELECT * FROM nft_metadata_changes WHERE fqdn = $1 ORDER BY created_at DESC LIMIT 50',
      [fqdn.toLowerCase()]
    );

    res.json({
      success: true,
      fqdn: fqdn.toLowerCase(),
      history: result.rows.map(row => ({
        id: row.id,
        oldCID: row.old_cid,
        newCID: row.new_cid,
        changeType: row.change_type,
        changeDetails: row.change_details,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    log.error({ err: error }, 'Metadata history error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Update NFT metadata (admin only)
 * POST /ipfs/update-metadata
 * Body: { fqdn: string, updates: Object }
 */
router.post('/ipfs/update-metadata', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  const { fqdn, updates } = req.body;

  if (!fqdn || !updates) {
    return res.status(400).json({ success: false, error: 'FQDN and updates required' });
  }

  try {
    // Get current metadata CID
    const domainResult = await query(
      'SELECT nft_metadata_cid FROM domains WHERE fqdn = $1',
      [fqdn.toLowerCase()]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }

    const { nft_metadata_cid: metadataCID } = domainResult.rows[0];

    if (!metadataCID) {
      return res.status(400).json({ success: false, error: 'Domain has no NFT metadata' });
    }

    console.log(`[IPFS] Updating metadata for ${fqdn}...`);
    const result = await nftStorageService.updateMetadata(metadataCID, updates);

    if (result.success) {
      // Update database with new CID
      await query(
        'UPDATE domains SET nft_metadata_cid = $2, metadata_uri = $3, updated_at = NOW() WHERE fqdn = $1',
        [fqdn.toLowerCase(), result.newCID, result.newURI]
      );

      // Log the change
      await nftStorageService.logMetadataChange(fqdn, metadataCID, result.newCID, 'admin_update', updates);
    }

    res.json({
      success: result.success,
      fqdn: fqdn.toLowerCase(),
      oldCID: result.oldCID,
      newCID: result.newCID,
      newURI: result.newURI,
      providers: result.providers,
      error: result.error,
    });
  } catch (error) {
    log.error({ err: error }, 'Update metadata error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

/**
 * Get all domains pinning status (admin)
 * GET /ipfs/domains-health
 */
router.get('/ipfs/domains-health', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  try {
    // V1: domains with NFT metadata
    const domainsResult = await query(
      `SELECT fqdn, nft_image_cid, nft_metadata_cid, updated_at
       FROM domains
       WHERE nft_metadata_cid IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );
    const countResult = await query(
      'SELECT COUNT(*) FROM domains WHERE nft_metadata_cid IS NOT NULL'
    );

    // V2: sld_artwork_v2 with IPFS CIDs
    let v2Rows = [];
    let v2Count = 0;
    try {
      const v2Result = await query(
        `SELECT s.full_name AS fqdn, a.ipfs_cid, a.completed_at AS updated_at
         FROM sld_artwork_v2 a
         JOIN slds_v2 s ON a.sld_id = s.id
         WHERE a.ipfs_cid IS NOT NULL AND a.status = 'completed'
         ORDER BY a.completed_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), parseInt(offset)]
      );
      v2Rows = v2Result.rows;
      const v2CountRes = await query("SELECT COUNT(*) FROM sld_artwork_v2 WHERE ipfs_cid IS NOT NULL AND status = 'completed'");
      v2Count = parseInt(v2CountRes.rows[0].count);
    } catch { /* V2 tables may not exist */ }

    const domains = [
      ...domainsResult.rows.map(d => ({
        fqdn: d.fqdn, imageCID: d.nft_image_cid, metadataCID: d.nft_metadata_cid, updatedAt: d.updated_at, version: 'v1',
      })),
      ...v2Rows.map(d => ({
        fqdn: d.fqdn, imageCID: d.ipfs_cid, metadataCID: null, updatedAt: d.updated_at, version: 'v2',
      })),
    ];

    res.json({
      success: true,
      domains,
      total: parseInt(countResult.rows[0].count) + v2Count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    log.error({ err: error }, 'Domains health error');
    log.error({ err: error }, 'Request failed');
    res.status(500).json({ success: false, error: 'An internal error occurred. Please try again later.' });
  }
});

// =============================================================
//                    SHOWCASE IMAGES
// =============================================================

const SHOWCASE_DIR = path.join(__dirname, '../../showcase');
const MATRIX_TEST_DIR = '/home/localai/Desktop/Matrix_Test';

// Cache for Matrix_Test image index (built once, holds all P_ and A_ image paths with metadata)
let matrixImageIndex = null;
let matrixIndexBuiltAt = 0;

/**
 * Build an index of all images from Matrix_Test P_ and A_ folders
 * Returns array of { file, folder, styleName, themeName, model } objects
 */
function buildMatrixImageIndex() {
  // Rebuild at most every 5 minutes
  if (matrixImageIndex && Date.now() - matrixIndexBuiltAt < 300000) {
    return matrixImageIndex;
  }

  const index = [];
  try {
    const entries = fs.readdirSync(MATRIX_TEST_DIR);
    const styleFolders = entries.filter(e =>
      (e.startsWith('P_') || e.startsWith('A_')) &&
      !e.endsWith('.log') &&
      fs.statSync(path.join(MATRIX_TEST_DIR, e)).isDirectory()
    );

    for (const folder of styleFolders) {
      const model = folder.startsWith('P_') ? 'playground' : 'animagine';
      const styleId = folder.replace(/^[PA]_/, '');
      const styleName = styleId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const folderPath = path.join(MATRIX_TEST_DIR, folder);

      // Load metadata if available
      let prompts = {};
      const promptsFile = path.join(folderPath, '_prompts.json');
      try {
        if (fs.existsSync(promptsFile)) {
          prompts = JSON.parse(fs.readFileSync(promptsFile, 'utf-8'));
        }
      } catch (e) { /* ignore */ }

      // Collect image files
      const files = fs.readdirSync(folderPath).filter(f =>
        /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.startsWith('_')
      );

      for (const file of files) {
        const meta = prompts[file] || {};
        index.push({
          file,
          folder,
          styleId,
          styleName,
          model,
          themeName: meta.themeName || '',
          themeId: meta.theme || '',
          category: meta.category || '',
        });
      }
    }
  } catch (err) {
    console.warn('[Showcase] Failed to build Matrix_Test index:', err.message);
  }

  matrixImageIndex = index;
  matrixIndexBuiltAt = Date.now();
  console.log(`[Showcase] Indexed ${index.length} images from ${new Set(index.map(i => i.folder)).size} style folders`);
  return index;
}

/**
 * Get showcase images for register page marquee gallery
 * GET /showcase/images?batch_size=24&seed=N
 * Sources: 1) Matrix_Test winning styles (P_ preferred, A_ fallback), 2) Curated, 3) Fallback
 */
router.get('/showcase/images', async (req, res) => {
  try {
    const batchSize = Math.min(300, Math.max(1, parseInt(req.query.batch_size) || 24));
    const seed = parseInt(req.query.seed) || Date.now();
    const images = [];
    let source = 'fallback';

    // Seeded PRNG for deterministic selection
    let rngState = seed;
    function seededRandom() {
      rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
      return rngState / 0x7fffffff;
    }

    // Try Matrix_Test winning styles first
    const index = buildMatrixImageIndex();
    if (index.length > 0) {
      source = 'matrix_test';

      // Group images by style folder
      const byStyle = {};
      for (const img of index) {
        if (!byStyle[img.folder]) byStyle[img.folder] = [];
        byStyle[img.folder].push(img);
      }

      // Prefer P_ (playground) styles, fallback to A_ (animagine)
      const pStyles = Object.keys(byStyle).filter(k => k.startsWith('P_'));
      const aStyles = Object.keys(byStyle).filter(k => k.startsWith('A_'));

      // Select from P_ styles first, spread across different styles
      const stylePool = [...pStyles];
      // Add A_ styles that don't have a P_ counterpart
      for (const aStyle of aStyles) {
        const pEquiv = 'P_' + aStyle.slice(2);
        if (!pStyles.includes(pEquiv)) {
          stylePool.push(aStyle);
        }
      }

      // Seeded shuffle of style pool
      for (let i = stylePool.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [stylePool[i], stylePool[j]] = [stylePool[j], stylePool[i]];
      }

      // Pick images round-robin across styles until batch_size reached
      let styleIdx = 0;
      const usedPerStyle = {};
      while (images.length < batchSize && stylePool.length > 0) {
        const style = stylePool[styleIdx % stylePool.length];
        const available = byStyle[style];
        if (!usedPerStyle[style]) usedPerStyle[style] = new Set();

        // Pick a random unused image from this style
        const unused = available.filter((_, i) => !usedPerStyle[style].has(i));
        if (unused.length === 0) {
          stylePool.splice(styleIdx % stylePool.length, 1);
          if (stylePool.length === 0) break;
          continue;
        }

        const pickIdx = Math.floor(seededRandom() * unused.length);
        const pick = unused[pickIdx];
        const origIdx = available.indexOf(pick);
        usedPerStyle[style].add(origIdx);

        images.push({
          id: `mt-${pick.folder}-${pick.file}`,
          url: `/api/v1/showcase/matrix/${pick.folder}/${pick.file}`,
          domain: pick.themeName || pick.file.replace(/\.\w+$/, ''),
          theme: pick.themeId || pick.category,
          styleName: pick.styleName,
          themeName: pick.themeName,
          model: pick.model,
        });

        styleIdx++;
      }
    }

    // Fallback to curated images if Matrix_Test unavailable
    if (images.length === 0) {
      try {
        if (fs.existsSync(SHOWCASE_DIR)) {
          const files = fs.readdirSync(SHOWCASE_DIR).filter(f =>
            /\.(jpg|jpeg|png|webp|gif)$/i.test(f)
          );

          if (files.length > 0) {
            source = 'curated';
            for (let i = files.length - 1; i > 0; i--) {
              const j = Math.floor(seededRandom() * (i + 1));
              [files[i], files[j]] = [files[j], files[i]];
            }
            const limited = files.slice(0, batchSize);
            for (const file of limited) {
              const name = path.parse(file).name;
              images.push({
                id: `showcase-${name}`,
                url: `/api/v1/showcase/image/${file}`,
                domain: name.includes('.') ? name : `${name}.cryptofans`,
                theme: 'curated',
                styleName: '',
                themeName: '',
              });
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load curated showcase images:', err.message);
      }
    }

    // Final fallback: placeholder gradients
    if (images.length === 0) {
      source = 'fallback';
      const themes = ['space', 'fantasy', 'nature', 'fractal', 'anime', 'cyberpunk'];
      const domains = [
        'stardust', 'nova', 'orion', 'dragonfire', 'elderwood', 'crystalheart',
        'everest', 'deepblue', 'infinity', 'sakura', 'neonwave', 'cybercore',
        'andromeda', 'pulsar', 'wyrm', 'faewild', 'alpine', 'coralreef',
        'recursive', 'tessellate', 'shinobi', 'synthcity', 'gridrunner', 'datastream'
      ];

      for (let i = 0; i < Math.min(batchSize, domains.length); i++) {
        images.push({
          id: `placeholder-${i}`,
          url: `/api/v1/showcase/placeholder/${i}`,
          domain: `${domains[i]}.cryptofans`,
          theme: themes[i % themes.length],
          styleName: '',
          themeName: '',
        });
      }
    }

    res.json({
      success: true,
      images,
      source,
      count: images.length,
      seed,
      totalAvailable: index?.length || 0,
    });
  } catch (error) {
    log.error({ err: error }, 'Get showcase images error');
    res.status(500).json({
      success: false,
      error: error.message,
      images: [],
      source: 'fallback',
      count: 0,
    });
  }
});

/**
 * Serve curated showcase image
 * GET /showcase/image/:filename
 */
router.get('/showcase/image/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const safeName = path.basename(filename); // Prevent path traversal
    const imagePath = path.join(SHOWCASE_DIR, safeName);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Determine content type
    const ext = path.extname(safeName).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hour cache
    fs.createReadStream(imagePath).pipe(res);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Serve Matrix_Test image
 * GET /showcase/matrix/:folder/:filename
 */
router.get('/showcase/matrix/:folder/:filename', (req, res) => {
  try {
    const { folder, filename } = req.params;
    // Sanitize: only allow expected folder patterns and prevent traversal
    const safeFolder = path.basename(folder);
    const safeFile = path.basename(filename);

    if (!/^[PA]_[\w]+$/.test(safeFolder)) {
      return res.status(400).json({ error: 'Invalid folder name' });
    }

    const imagePath = path.join(MATRIX_TEST_DIR, safeFolder, safeFile);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const ext = path.extname(safeFile).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 day cache (static test images)
    fs.createReadStream(imagePath).pipe(res);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Generate placeholder gradient image
 * GET /showcase/placeholder/:index
 */
router.get('/showcase/placeholder/:index', async (req, res) => {
  try {
    const { createCanvas } = await import('canvas');
    const { index } = req.params;
    const i = parseInt(index) || 0;

    // Create gradient placeholder
    const size = 400;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Generate unique gradient based on index
    const hue1 = (i * 37 + 173) % 360; // Halcyon teal-ish base
    const hue2 = (i * 53 + 158) % 360; // Halcyon green-ish target

    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, `hsl(${hue1}, 70%, 25%)`);
    gradient.addColorStop(0.5, `hsl(${(hue1 + hue2) / 2}, 60%, 30%)`);
    gradient.addColorStop(1, `hsl(${hue2}, 65%, 35%)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add subtle pattern
    ctx.globalAlpha = 0.1;
    for (let x = 0; x < size; x += 20) {
      for (let y = 0; y < size; y += 20) {
        if ((x + y) % 40 === 0) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, y, 10, 10);
        }
      }
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    canvas.createPNGStream().pipe(res);
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                    SEARCH SUGGESTIONS
// =============================================================

/**
 * GET /search/suggest?q=<partial>&tld=<optional>&minLen=&maxLen=&minPrice=&maxPrice=
 * Returns suggestions with availability + fuzzy corrections
 */
router.get('/search/suggest', async (req, res) => {
  try {
    const { q, tld: tldFilter, minLen, maxLen, minPrice, maxPrice } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const input = q.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!input) {
      return res.status(400).json({ error: 'Invalid query' });
    }

    // Determine TLD for pricing (V1 + V2)
    let tldRow;
    const tldName = (tldFilter || 'cryptofans').toLowerCase();
    try {
      const tldResult = await query('SELECT id, name, base_price_usd, price_multiplier_ultra, price_multiplier_premium, price_multiplier_standard_plus FROM tlds WHERE name = $1 AND is_active = true', [tldName]);
      tldRow = tldResult.rows[0];
    } catch { /* ignore */ }

    if (!tldRow) {
      // Try V2
      const v2Tld = await findTldByName(tldName);
      if (v2Tld && v2Tld.source === 'v2') {
        const lp = v2Tld.length_prices || [];
        tldRow = {
          id: v2Tld.id,
          name: v2Tld.name,
          base_price_usd: (lp[3] || 1000) / 100,
          price_multiplier_ultra: lp[0] ? lp[0] / (lp[3] || 1000) : 50,
          price_multiplier_premium: lp[1] ? lp[1] / (lp[3] || 1000) : 20,
          price_multiplier_standard_plus: lp[2] ? lp[2] / (lp[3] || 1000) : 8,
          _isV2: true,
        };
      }
    }

    if (!tldRow) {
      return res.status(400).json({ error: 'Invalid TLD' });
    }

    // 1. Prefix match on registered subdomains (V1 + V2)
    const prefixV1 = tldRow._isV2 ? { rows: [] } : await query(
      `SELECT subdomain, fqdn, tier, owner_wallet FROM domains
       WHERE subdomain LIKE $1 AND tld_id = $2
       ORDER BY subdomain LIMIT 10`,
      [input + '%', tldRow.id]
    );
    const prefixV2 = await query(
      `SELECT s.label AS subdomain, s.full_name AS fqdn, s.owner_address AS owner_wallet
       FROM slds_v2 s WHERE s.label LIKE $1 AND s.tld_id = $2
       ORDER BY s.label LIMIT 10`,
      [input + '%', tldRow._isV2 ? tldRow.id : -1]
    );
    const prefixResult = { rows: [...prefixV1.rows, ...prefixV2.rows] };

    // 2. Fuzzy match against registered subdomains for typo corrections
    const regV1 = tldRow._isV2 ? { rows: [] } : await query(
      `SELECT DISTINCT subdomain FROM domains WHERE tld_id = $1 LIMIT 500`,
      [tldRow.id]
    );
    const regV2 = await query(
      `SELECT DISTINCT label AS subdomain FROM slds_v2 WHERE tld_id = $1 LIMIT 500`,
      [tldRow._isV2 ? tldRow.id : -1]
    );
    const registeredNames = [...regV1.rows, ...regV2.rows].map(r => r.subdomain);
    const fuzzyMatches = findSimilar(input, registeredNames, 2);
    const corrections = fuzzyMatches.map(m => m.value);

    // 3. Generate available alternatives (input + common suffixes)
    const suffixes = ['', 'x', 'io', 'hq', 'dao', 'dev', 'pro', 'app', 'lab', 'hub'];
    const alternativeCandidates = suffixes
      .map(s => input + s)
      .filter(name => name.length >= 1 && name.length <= 63 && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name));

    // Check availability of alternatives
    let suggestions = [];
    if (alternativeCandidates.length > 0) {
      const placeholders = alternativeCandidates.map((_, i) => `$${i + 2}`).join(', ');
      // Check V1
      const availV1 = tldRow._isV2 ? { rows: [] } : await query(
        `SELECT subdomain FROM domains WHERE subdomain IN (${placeholders}) AND tld_id = $1`,
        [tldRow.id, ...alternativeCandidates]
      );
      // Check V2
      const availV2 = await query(
        `SELECT label AS subdomain FROM slds_v2 WHERE label IN (${placeholders}) AND tld_id = $1`,
        [tldRow._isV2 ? tldRow.id : -1, ...alternativeCandidates]
      );
      const takenSet = new Set([...availV1.rows, ...availV2.rows].map(r => r.subdomain));

      for (const name of alternativeCandidates) {
        const length = name.length;
        const tier = length === 1 ? 'ultra_premium' : length === 2 ? 'premium' : length === 3 ? 'standard_plus' : 'standard';

        // Apply filters
        if (minLen && length < parseInt(minLen)) continue;
        if (maxLen && length > parseInt(maxLen)) continue;

        // Calculate price
        let priceUSD = parseFloat(tldRow.base_price_usd);
        if (tier === 'ultra_premium') priceUSD *= parseFloat(tldRow.price_multiplier_ultra);
        else if (tier === 'premium') priceUSD *= parseFloat(tldRow.price_multiplier_premium);
        else if (tier === 'standard_plus') priceUSD *= parseFloat(tldRow.price_multiplier_standard_plus);

        if (minPrice && priceUSD < parseFloat(minPrice)) continue;
        if (maxPrice && priceUSD > parseFloat(maxPrice)) continue;

        suggestions.push({
          subdomain: name,
          fqdn: `${name}.${tldRow.name}`,
          available: !takenSet.has(name),
          tier,
          priceUSD: Math.round(priceUSD * 100) / 100,
        });
      }
    }

    // Also include prefix matches (marked as taken)
    for (const row of prefixResult.rows) {
      if (!suggestions.find(s => s.subdomain === row.subdomain)) {
        suggestions.push({
          subdomain: row.subdomain,
          fqdn: row.fqdn,
          available: false,
          tier: row.tier,
        });
      }
    }

    // Limit to top 5
    suggestions = suggestions.slice(0, 5);

    res.json({ suggestions, corrections });
  } catch (error) {
    log.warn({ err: error }, 'Search suggest error');
    res.status(500).json({ error: 'Suggestion failed' });
  }
});

// =============================================================
//                    AVAILABILITY ALERTS
// =============================================================

/**
 * POST /alerts/watch — add a domain watch (wallet-authenticated)
 * Body: { wallet, signature, nonce, fqdn }
 */
router.post('/alerts/watch', auth.verifyWallet, async (req, res) => {
  try {
    const { fqdn } = req.body;
    const wallet = req.authenticatedWallet;

    if (!fqdn || typeof fqdn !== 'string') {
      return res.status(400).json({ error: 'fqdn is required' });
    }

    // Validate fqdn format (subdomain.tld)
    const parts = fqdn.toLowerCase().trim().split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return res.status(400).json({ error: 'Invalid fqdn format' });
    }

    const subdomainCheck = validation.isValidSubdomain(parts[0]);
    if (!subdomainCheck.valid) {
      return res.status(400).json({ error: subdomainCheck.error });
    }

    // Max 50 watches per wallet
    const countResult = await query(
      "SELECT COUNT(*) FROM domain_watch_alerts WHERE wallet_address = $1 AND status = 'watching'",
      [wallet]
    );
    if (parseInt(countResult.rows[0].count) >= 50) {
      return res.status(400).json({ error: 'Maximum of 50 watches reached' });
    }

    await query(
      `INSERT INTO domain_watch_alerts (wallet_address, fqdn, status, created_at)
       VALUES ($1, $2, 'watching', NOW())
       ON CONFLICT (wallet_address, fqdn) DO UPDATE SET status = 'watching', notified_at = NULL`,
      [wallet, fqdn.toLowerCase()]
    );

    res.json({ success: true, fqdn: fqdn.toLowerCase() });
  } catch (error) {
    log.warn({ err: error }, 'Watch alert error');
    res.status(500).json({ error: 'Failed to add watch' });
  }
});

/**
 * DELETE /alerts/watch/:fqdn — remove a watch
 * Body: { wallet, signature, nonce }
 */
router.delete('/alerts/watch/:fqdn', auth.verifyWallet, async (req, res) => {
  try {
    const { fqdn } = req.params;
    const wallet = req.authenticatedWallet;

    await query(
      'DELETE FROM domain_watch_alerts WHERE wallet_address = $1 AND fqdn = $2',
      [wallet, fqdn.toLowerCase()]
    );

    res.json({ success: true });
  } catch (error) {
    log.warn({ err: error }, 'Remove watch error');
    res.status(500).json({ error: 'Failed to remove watch' });
  }
});

/**
 * GET /alerts/:wallet — list all watched domains for a wallet
 */
router.get('/alerts/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    if (!validation.isValidAddress(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const result = await query(
      `SELECT fqdn, status, created_at, notified_at FROM domain_watch_alerts
       WHERE wallet_address = $1 ORDER BY created_at DESC`,
      [wallet.toLowerCase()]
    );

    res.json({ watches: result.rows });
  } catch (error) {
    log.warn({ err: error }, 'List watches error');
    res.status(500).json({ error: 'Failed to list watches' });
  }
});

/**
 * GET /alerts/check/:wallet — get newly available domains (status = 'notified')
 */
router.get('/alerts/check/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    if (!validation.isValidAddress(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Find watched domains that are no longer registered (expired/released) — check V1 + V2
    const result = await query(
      `SELECT dwa.fqdn, dwa.status, dwa.notified_at
       FROM domain_watch_alerts dwa
       LEFT JOIN domains d ON d.fqdn = dwa.fqdn AND d.status = 'active'
       LEFT JOIN slds_v2 s ON s.full_name = dwa.fqdn
       WHERE dwa.wallet_address = $1
         AND dwa.status = 'watching'
         AND d.id IS NULL
         AND s.id IS NULL`,
      [wallet.toLowerCase()]
    );

    // Mark them as notified
    const availableFqdns = result.rows.map(r => r.fqdn);
    if (availableFqdns.length > 0) {
      const placeholders = availableFqdns.map((_, i) => `$${i + 2}`).join(', ');
      await query(
        `UPDATE domain_watch_alerts SET status = 'notified', notified_at = NOW()
         WHERE wallet_address = $1 AND fqdn IN (${placeholders})`,
        [wallet.toLowerCase(), ...availableFqdns]
      );
    }

    res.json({ available: availableFqdns });
  } catch (error) {
    log.warn({ err: error }, 'Check alerts error');
    res.status(500).json({ error: 'Failed to check alerts' });
  }
});

// =============================================================
//                    PROFILE PAGES
// =============================================================

/**
 * Get public profile data for a domain
 * GET /profile/:fqdn
 */
router.get('/profile/:fqdn', async (req, res) => {
  const fqdn = req.params.fqdn?.toLowerCase().trim();
  if (!fqdn) {
    return res.status(400).json({ error: 'fqdn is required' });
  }

  try {
    // Try V1 domains table first
    const result = await query(
      `SELECT d.id, d.fqdn, d.subdomain, d.owner_wallet, d.token_id,
              d.nft_image_cid, d.contenthash, d.tier, d.status,
              d.registration_date, d.expiration_date,
              t.name AS tld_label,
              ps.bio, ps.layout, ps.primary_color, ps.bg_color, ps.show_avatar, ps.show_nft,
              uf.domain_mode
       FROM domains d
       LEFT JOIN tlds t ON d.tld_id = t.id
       LEFT JOIN profile_settings ps ON ps.domain_id = d.id
       LEFT JOIN url_forwards uf ON uf.domain_id = d.id
       WHERE d.fqdn = $1`,
      [fqdn]
    );

    let domain;
    let textRecords = {};
    let resolvedAddress = null;

    if (result.rows.length > 0) {
      domain = result.rows[0];
      const textResult = await query(
        `SELECT record_key, record_value FROM domain_text_records WHERE domain_id = $1`,
        [domain.id]
      );
      for (const row of textResult.rows) {
        textRecords[row.record_key] = row.record_value;
      }
    } else {
      // Fallback to V2 slds_v2
      const v2Result = await query(
        `SELECT s.id, s.full_name AS fqdn, s.label AS subdomain,
                s.owner_address AS owner_wallet, s.token_id,
                s.registration_time, s.expiry_time,
                t.label AS tld_label,
                a.ipfs_cid AS nft_image_cid, a.status AS artwork_status
         FROM slds_v2 s
         JOIN tlds_v2 t ON t.id = s.tld_id
         LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id AND a.status = 'completed'
         WHERE s.full_name = $1
         ORDER BY a.completed_at DESC
         LIMIT 1`,
        [fqdn]
      );
      if (v2Result.rows.length === 0) {
        return res.status(404).json({ error: 'Domain not found' });
      }
      domain = v2Result.rows[0];
      domain.tier = 'standard';
      // Map V2 field names to V1-style names
      domain.registration_date = domain.registration_time;
      domain.expiration_date = domain.expiry_time;
    }

    // Check for resolved address
    const amResult = await query(
      'SELECT wallet_address FROM address_mappings WHERE fqdn = $1',
      [fqdn]
    );
    if (amResult.rows.length > 0) {
      resolvedAddress = amResult.rows[0].wallet_address;
    }

    // Parse the TLD label from fqdn if not already present
    const tldLabel = domain.tld_label || fqdn.split('.').slice(1).join('.');

    res.json({
      profile: {
        fqdn: domain.fqdn,
        subdomain: domain.subdomain,
        tld: tldLabel,
        owner_wallet: domain.owner_wallet,
        token_id: domain.token_id,
        nft_image_cid: domain.nft_image_cid || null,
        contenthash: domain.contenthash || null,
        tier: domain.tier || 'standard',
        bio: domain.bio || null,
        layout: domain.layout || 'standard',
        primary_color: domain.primary_color || '#6366f1',
        bg_color: domain.bg_color || '#0f172a',
        show_avatar: domain.show_avatar !== false,
        show_nft: domain.show_nft !== false,
        textRecords,
        domain_mode: domain.domain_mode || 'redirect',
        registration_date: domain.registration_date || null,
        expiration_date: domain.expiration_date || null,
        resolved_address: resolvedAddress,
      },
    });
  } catch (error) {
    log.warn({ err: error }, 'Profile fetch error');
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * Update profile settings for a domain
 * PUT /profile/:fqdn/settings
 * Body: { wallet, signature, nonce, bio, layout, primary_color, bg_color, show_avatar, show_nft, domain_mode }
 */
router.put('/profile/:fqdn/settings',
  auth.verifyWallet,
  validation.validateProfileSettings,
  async (req, res) => {
    const fqdn = req.params.fqdn?.toLowerCase().trim();
    if (!fqdn) {
      return res.status(400).json({ error: 'fqdn is required' });
    }

    const { bio, layout, primary_color, bg_color, show_avatar, show_nft, domain_mode } = req.body;

    try {
      // Verify ownership (V1 + V2)
      const domain = await findDomainOwnerForAuth(fqdn);

      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      if (domain.owner_wallet.toLowerCase() !== req.authenticatedWallet) {
        return res.status(403).json({ error: 'Not authorized to modify this domain' });
      }

      const domainId = domain.id;

      // Upsert profile_settings
      await query(
        `INSERT INTO profile_settings (domain_id, bio, layout, primary_color, bg_color, show_avatar, show_nft, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (domain_id) DO UPDATE SET
           bio = COALESCE(EXCLUDED.bio, profile_settings.bio),
           layout = COALESCE(EXCLUDED.layout, profile_settings.layout),
           primary_color = COALESCE(EXCLUDED.primary_color, profile_settings.primary_color),
           bg_color = COALESCE(EXCLUDED.bg_color, profile_settings.bg_color),
           show_avatar = COALESCE(EXCLUDED.show_avatar, profile_settings.show_avatar),
           show_nft = COALESCE(EXCLUDED.show_nft, profile_settings.show_nft),
           updated_at = NOW()`,
        [domainId, bio ?? null, layout ?? null, primary_color ?? null, bg_color ?? null, show_avatar ?? null, show_nft ?? null]
      );

      // Update domain_mode in url_forwards (create row if needed)
      if (domain_mode !== undefined) {
        const existingForward = await query(
          'SELECT id FROM url_forwards WHERE domain_id = $1',
          [domainId]
        );

        if (existingForward.rows.length > 0) {
          await query(
            'UPDATE url_forwards SET domain_mode = $1, updated_at = NOW() WHERE domain_id = $2',
            [domain_mode, domainId]
          );
        } else {
          // Create a minimal url_forwards row for profile mode
          await query(
            `INSERT INTO url_forwards (domain_id, fqdn, target_url, redirect_type, domain_mode, enabled)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [domainId, fqdn, '', 302, domain_mode, true]
          );
        }
      }

      res.json({ success: true, message: 'Profile settings updated' });
    } catch (error) {
      log.warn({ err: error }, 'Profile settings update error');
      res.status(500).json({ error: 'Failed to update profile settings' });
    }
  }
);

// =============================================================
//                    FTSO REWARDS
// =============================================================

// List all reward epochs
router.get('/rewards/epochs', async (req, res) => {
  try {
    const result = await query(
      'SELECT epoch_id, snapshot1_block, snapshot2_block, merkle_root, total_reward, total_holders, status, created_at, finalized_at FROM ftso_reward_epochs ORDER BY epoch_id DESC'
    );
    res.json({ epochs: result.rows });
  } catch (error) {
    log.warn({ err: error }, 'Rewards epochs error');
    res.status(500).json({ error: 'Failed to fetch reward epochs' });
  }
});

// Get claimable rewards for a wallet
router.get('/rewards/claimable', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    const result = await query(
      `SELECT c.epoch_id, c.amount, c.merkle_proof, e.total_reward, e.total_holders, e.finalized_at
       FROM ftso_reward_claims c
       JOIN ftso_reward_epochs e ON e.epoch_id = c.epoch_id
       WHERE c.wallet_address = $1 AND c.claimed = false AND e.status = 'finalized'
       ORDER BY c.epoch_id DESC`,
      [wallet.toLowerCase()]
    );

    const totalClaimable = result.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    res.json({
      claimable: result.rows,
      totalClaimable: totalClaimable.toString(),
    });
  } catch (error) {
    log.warn({ err: error }, 'Rewards claimable error');
    res.status(500).json({ error: 'Failed to fetch claimable rewards' });
  }
});

// Get reward claim history for a wallet
router.get('/rewards/history', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    const result = await query(
      `SELECT c.epoch_id, c.amount, c.claimed, c.claimed_at, c.tx_hash, e.finalized_at
       FROM ftso_reward_claims c
       JOIN ftso_reward_epochs e ON e.epoch_id = c.epoch_id
       WHERE c.wallet_address = $1
       ORDER BY c.epoch_id DESC`,
      [wallet.toLowerCase()]
    );

    const totalEarned = result.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const totalClaimed = result.rows.filter(r => r.claimed).reduce((sum, r) => sum + parseFloat(r.amount), 0);

    res.json({
      history: result.rows,
      totalEarned: totalEarned.toString(),
      totalClaimed: totalClaimed.toString(),
    });
  } catch (error) {
    log.warn({ err: error }, 'Rewards history error');
    res.status(500).json({ error: 'Failed to fetch reward history' });
  }
});

// Mark a reward as claimed (called after on-chain claim tx)
router.post('/rewards/mark-claimed', async (req, res) => {
  try {
    const { epochId, wallet, txHash } = req.body;
    if (epochId === undefined || epochId === null || !wallet || !txHash) {
      return res.status(400).json({ error: 'epochId, wallet, txHash required' });
    }

    await query(
      `UPDATE ftso_reward_claims SET claimed = true, claimed_at = NOW(), tx_hash = $1
       WHERE epoch_id = $2 AND wallet_address = $3`,
      [txHash, epochId, wallet.toLowerCase()]
    );

    res.json({ success: true });
  } catch (error) {
    log.warn({ err: error }, 'Mark claimed error');
    res.status(500).json({ error: 'Failed to mark reward as claimed' });
  }
});

// Notification routes
router.use('/notifications', notificationRoutes);
router.use('/email', emailRoutes);
router.use('/defaults', defaultsRoutes);

// =============================================================
//                    PUBLIC RESOLVER STATUS
// =============================================================

/**
 * Get public resolver (Unbound on 10.0.0.67) health and stats
 * GET /resolver/status
 */
router.get('/resolver/status', async (req, res) => {
  try {
    // Test resolver with a dig query
    const dnsAlive = await new Promise((resolve) => {
      const resolver = new dns.Resolver();
      resolver.setServers(['10.0.0.67']);
      const timeout = setTimeout(() => resolve(false), 3000);
      resolver.resolve4('google.com', (err, addresses) => {
        clearTimeout(timeout);
        resolve(!err && addresses && addresses.length > 0);
      });
    });

    // Get unbound-control stats via SSH
    let stats = null;
    try {
      const { exec: execCb } = await import('child_process');
      stats = await new Promise((resolve, reject) => {
        execCb('ssh -i /home/localai/.ssh/id_ed25519 -o ConnectTimeout=3 -o StrictHostKeyChecking=no mosana1@10.0.0.67 "unbound-control stats_noreset"',
          { timeout: 5000 },
          (err, stdout) => {
            if (err) return resolve(null);
            const lines = stdout.trim().split('\n');
            const parsed = {};
            for (const line of lines) {
              const [key, val] = line.split('=');
              if (key && val) parsed[key.trim()] = val.trim();
            }
            resolve(parsed);
          }
        );
      });
    } catch {
      stats = null;
    }

    const totalQueries = stats ? parseInt(stats['total.num.queries'] || '0') : null;
    const cacheHits = stats ? parseInt(stats['total.num.cachehits'] || '0') : null;
    const cacheMisses = stats ? parseInt(stats['total.num.cachemiss'] || '0') : null;
    const cacheHitRate = totalQueries > 0 && cacheHits !== null
      ? parseFloat((cacheHits / totalQueries).toFixed(3))
      : null;

    res.json({
      running: dnsAlive,
      server: '10.0.0.67',
      queries: totalQueries,
      cacheHits,
      cacheMisses,
      cacheHitRate,
      avgRecursionTime: stats ? parseFloat(stats['total.recursion.time.avg'] || '0') : null,
      rateLimited: stats ? parseInt(stats['total.num.queries_ip_ratelimited'] || '0') : null,
      statsAvailable: stats !== null,
    });
  } catch (error) {
    sendError(res, error, 500, 'Failed to check resolver status');
  }
});

// =============================================================
//                    DEVELOPER API KEYS
// =============================================================

const MAX_API_KEYS_PER_WALLET = 5;

/**
 * Generate a new API key
 * POST /api-keys
 * Body: { wallet, signature, nonce, label? }
 */
router.post('/api-keys', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const label = (req.body.label || 'My API Key').substring(0, 100);

    // Check key count limit
    const countResult = await query(
      'SELECT COUNT(*) as count FROM api_keys WHERE wallet_address = $1 AND is_active = true',
      [wallet]
    );
    if (parseInt(countResult.rows[0].count) >= MAX_API_KEYS_PER_WALLET) {
      return res.status(400).json({ error: `Maximum ${MAX_API_KEYS_PER_WALLET} active API keys allowed` });
    }

    // Generate key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await query(
      `INSERT INTO api_keys (key_hash, wallet_address, label) VALUES ($1, $2, $3)`,
      [keyHash, wallet, label]
    );

    res.json({ success: true, key: rawKey, label });
  } catch (error) {
    sendError(res, error, 500, 'Failed to create API key');
  }
});

/**
 * List caller's API keys
 * GET /api-keys (requires wallet auth via POST body)
 */
router.post('/api-keys/list', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const result = await query(
      `SELECT id, label, tier, requests_today, requests_month, last_request_at, created_at
       FROM api_keys WHERE wallet_address = $1 AND is_active = true ORDER BY created_at DESC`,
      [wallet]
    );

    // Include tier limits for display
    const keys = result.rows.map(k => ({
      ...k,
      daily_limit: k.tier === 'pro' ? 1000 : k.tier === 'basic' ? 300 : 60,
    }));

    res.json({ success: true, keys });
  } catch (error) {
    sendError(res, error, 500, 'Failed to list API keys');
  }
});

/**
 * Revoke an API key (soft delete)
 * DELETE /api-keys/:id
 * Body: { wallet, signature, nonce }
 */
router.delete('/api-keys/:id', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const keyId = parseInt(req.params.id);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const result = await query(
      `UPDATE api_keys SET is_active = false, revoked_at = NOW()
       WHERE id = $1 AND wallet_address = $2 AND is_active = true
       RETURNING id`,
      [keyId, wallet]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found or already revoked' });
    }

    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 500, 'Failed to revoke API key');
  }
});

// =============================================================
//                     PARALLEL DEMO (Admin)
// =============================================================

/**
 * Pre-made demo prompts for parallel generation showcase
 */
const PARALLEL_DEMO_PROMPTS = [
  "A cyberpunk dragon breathing neon fire over a futuristic Tokyo skyline",
  "An ancient wizard's library with floating magical books and glowing runes",
  "A steampunk mechanical phoenix rising from copper gears and steam",
  "An underwater city with bioluminescent jellyfish and coral skyscrapers",
  "A samurai standing in a field of cherry blossoms during a lightning storm",
  "A cosmic whale swimming through nebulas and star clusters",
  "A post-apocalyptic garden with nature reclaiming robotic ruins",
  "A Victorian ghost ship sailing through aurora borealis clouds",
];

// In-memory storage for demo sessions
const parallelDemoSessions = new Map();

/**
 * POST /admin/parallel-demo/prompts
 * Get the list of pre-made demo prompts
 */
router.post('/admin/parallel-demo/prompts', auth.verifyAdminReadAuth, (req, res) => {
  res.json({
    success: true,
    prompts: PARALLEL_DEMO_PROMPTS,
  });
});

/**
 * POST /admin/parallel-demo/start
 * Start a parallel demo generation across multiple GPUs
 * Body: { count: 4|8, prompt: string, customPrompt?: string }
 */
router.post('/admin/parallel-demo/start', auth.verifyWallet, auth.verifyAdmin, async (req, res) => {
  try {
    const { count = 8, prompt, customPrompt } = req.body;

    if (!prompt && !customPrompt) {
      return res.status(400).json({
        success: false,
        error: 'Either prompt or customPrompt is required',
      });
    }

    if (count !== 4 && count !== 8) {
      return res.status(400).json({
        success: false,
        error: 'Count must be 4 or 8',
      });
    }

    const sessionId = crypto.randomUUID();
    const finalPrompt = customPrompt || prompt;

    // Create session
    const session = {
      id: sessionId,
      prompt: finalPrompt,
      count,
      startTime: Date.now(),
      status: 'running',
      generations: [], // Will hold results as they complete
      gpuStatus: {}, // Track which GPU is working on what
      completed: 0,
      failed: 0,
    };

    parallelDemoSessions.set(sessionId, session);

    // Import SERVERS to know which GPUs to use
    const { SERVERS, buildWorkflow, getActiveModelConfig, setActiveModel } = await import('../services/sdxlMultiGPU.js');

    // Spin up ALL fans to 100% for the demo via dashboard API
    console.log('[ParallelDemo] Spinning up all fans to 100%');
    const fanMachines = ['3080', '3080x2', '3060x2', '3060x2-97'];
    for (const machine of fanMachines) {
      try {
        await fetch('http://10.0.0.67:8085/api/fan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ machine, speed: 100 }),
        });
      } catch (e) {
        console.error(`[ParallelDemo] Failed to set fan for ${machine}:`, e.message);
      }
    }

    // Select servers based on count
    const serversToUse = count === 8 ? SERVERS : SERVERS.slice(0, 4);

    // Initialize GPU status
    serversToUse.forEach((server, idx) => {
      session.gpuStatus[server.name] = {
        status: 'pending',
        startTime: null,
        endTime: null,
        imageUrl: null,
        error: null,
      };
    });

    // For parallel demo, use sdxl-playground (no LoRA) which works on all machines
    // The LCM LoRA isn't installed on all GPU servers
    const previousModel = getActiveModelConfig();
    await setActiveModel('sdxl-playground');
    const { type: modelType, config: modelConfig } = getActiveModelConfig();

    Promise.all(
      serversToUse.map(async (server, idx) => {
        const gpuName = server.name;
        const startTime = Date.now();

        try {
          session.gpuStatus[gpuName].status = 'generating';
          session.gpuStatus[gpuName].startTime = startTime;

          // Build workflow for this generation
          const seed = Math.floor(Math.random() * 2147483647);
          // buildWorkflow(prompt, seed, filenamePrefix, styleOverrides = null)
          const workflow = buildWorkflow(
            finalPrompt,
            seed,
            `demo-${sessionId}-${idx}`,
            null
          );

          // Queue the workflow on this specific server
          const promptRes = await fetch(`${server.url}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(workflow),
          });

          if (!promptRes.ok) {
            const errorBody = await promptRes.text();
            console.error(`[ParallelDemo] ${server.name} ComfyUI error response:`, errorBody.slice(0, 500));
            throw new Error(`ComfyUI returned ${promptRes.status}: ${errorBody.slice(0, 200)}`);
          }

          const { prompt_id } = await promptRes.json();

          // Poll for completion
          let completed = false;
          let imageUrl = null;
          const timeout = Date.now() + 120000; // 2 minute timeout

          while (!completed && Date.now() < timeout) {
            await new Promise(r => setTimeout(r, 500));

            const historyRes = await fetch(`${server.url}/history/${prompt_id}`);
            if (historyRes.ok) {
              const history = await historyRes.json();
              const promptHistory = history[prompt_id];

              if (promptHistory?.outputs) {
                // Find the output image
                for (const nodeId of Object.keys(promptHistory.outputs)) {
                  const nodeOutput = promptHistory.outputs[nodeId];
                  if (nodeOutput.images && nodeOutput.images.length > 0) {
                    const img = nodeOutput.images[0];
                    // Fetch image and convert to base64 to avoid local network access from browser
                    const imgUrl = `${server.url}/view?filename=${encodeURIComponent(img.filename)}&type=${img.type}&subfolder=${img.subfolder || ''}`;
                    try {
                      const imgRes = await fetch(imgUrl);
                      if (imgRes.ok) {
                        const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
                        imageUrl = `data:image/png;base64,${imgBuffer.toString('base64')}`;
                      }
                    } catch (imgErr) {
                      console.error('Failed to fetch image:', imgErr);
                      imageUrl = null;
                    }
                    completed = true;
                    break;
                  }
                }
              }
            }
          }

          if (!completed) {
            throw new Error('Generation timed out');
          }

          const endTime = Date.now();
          session.gpuStatus[gpuName].status = 'completed';
          session.gpuStatus[gpuName].endTime = endTime;
          session.gpuStatus[gpuName].imageUrl = imageUrl;
          session.gpuStatus[gpuName].duration = (endTime - startTime) / 1000;
          session.completed++;

          session.generations.push({
            gpu: gpuName,
            server: server.url,
            imageUrl,
            duration: (endTime - startTime) / 1000,
            success: true,
          });

        } catch (error) {
          console.error(`[ParallelDemo] ${gpuName} (${server.url}) failed:`, error.message);
          session.gpuStatus[gpuName].status = 'failed';
          session.gpuStatus[gpuName].error = error.message;
          session.gpuStatus[gpuName].endTime = Date.now();
          session.failed++;

          session.generations.push({
            gpu: gpuName,
            server: server.url,
            error: error.message,
            success: false,
          });
        }

        // Check if all done
        if (session.completed + session.failed === serversToUse.length) {
          session.status = 'completed';
          session.endTime = Date.now();
          session.totalDuration = (session.endTime - session.startTime) / 1000;

          // Return fans to auto after 30 second cooldown
          console.log('[ParallelDemo] All generations complete, starting 30s fan cooldown');
          setTimeout(async () => {
            console.log('[ParallelDemo] Returning fans to auto mode');
            const fanMachines = ['3080', '3080x2', '3060x2', '3060x2-97'];
            for (const machine of fanMachines) {
              try {
                await fetch('http://10.0.0.67:8085/api/fan', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ machine, speed: 'auto' }),
                });
              } catch (e) {
                // Silently ignore
              }
            }
          }, 30000);
        }
      })
    ).catch(err => {
      console.error('[ParallelDemo] Unexpected error:', err);
      session.status = 'error';
      session.error = err.message;
    });

    res.json({
      success: true,
      sessionId,
      message: `Started ${count} parallel generations`,
      prompt: finalPrompt,
    });

  } catch (error) {
    log.error({ err: error }, 'Parallel demo start error');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /admin/parallel-demo/status/:sessionId
 * Get the status of a parallel demo session
 */
router.post('/admin/parallel-demo/status/:sessionId', auth.verifyAdminReadAuth, (req, res) => {
  const { sessionId } = req.params;
  const session = parallelDemoSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
    });
  }

  res.json({
    success: true,
    session: {
      id: session.id,
      prompt: session.prompt,
      count: session.count,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      totalDuration: session.totalDuration,
      completed: session.completed,
      failed: session.failed,
      gpuStatus: session.gpuStatus,
      generations: session.generations,
    },
  });
});

/**
 * POST /admin/parallel-demo/gpu-stats
 * Proxy to the GPU dashboard for live stats
 */
router.post('/admin/parallel-demo/gpu-stats', auth.verifyAdminReadAuth, async (req, res) => {
  try {
    // Fetch from GPU dashboard
    const [statsRes, jobsRes] = await Promise.all([
      fetch('http://10.0.0.67:8085/api/stats').then(r => r.json()).catch(() => null),
      fetch('http://10.0.0.67:8085/api/jobs').then(r => r.json()).catch(() => null),
    ]);

    res.json({
      success: true,
      stats: statsRes,
      jobs: jobsRes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /admin/parallel-demo/stop
 * Stop/cancel a running parallel demo session
 * Body: { sessionId, ...credentials }
 */
router.post('/admin/parallel-demo/stop', auth.verifyWallet, auth.verifyAdmin, (req, res) => {
  const { sessionId } = req.body;
  const session = parallelDemoSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
    });
  }

  // Mark as stopped (actual ComfyUI jobs will continue but we stop polling)
  session.status = 'stopped';
  session.endTime = Date.now();

  res.json({
    success: true,
    message: 'Session marked as stopped',
  });
});

export default router;
