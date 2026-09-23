import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import auth from '../middleware/auth.js';
import { createAuditMiddleware } from '../middleware/auditMiddleware.js';
import adminService from '../services/adminService.js';
import { watcher } from '../services/watcher.js';
import { priceSync } from '../services/priceSync.js';
import { contractListener } from '../services/contractListener.js';
import comfyuiManager from '../services/comfyuiManager.js';
import { gpuFanControl } from '../services/gpuFanControl.js';
import { getActiveModelConfig, getAvailableModels } from '../services/sdxlMultiGPU.js';
import { query } from '../db/index.js';
import { ftsoService } from '../services/ftso.js';
import { gpuDashboard } from '../services/gpuDashboard.js';
import walletService from '../services/walletService.js';
import fdcKeeper from '../services/fdcKeeper.js';
import artworkQueueV2 from '../services/artworkQueueV2.js';
import hnsService from '../services/hns.js';
import operatorWalletService from '../services/operatorWalletService.js';
// Redis/BullMQ removed

const execAsync = promisify(exec);

// Sanitize PM2 process names to prevent command injection
function sanitizePM2Name(name) {
  if (!name || typeof name !== 'string') throw new Error('Invalid process name');
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Process name contains invalid characters');
  return name;
}

const router = express.Router();

// Create audit middleware instance
const auditMiddleware = createAuditMiddleware();

// Full auth (signature required) - for write operations
// Includes audit logging for all write operations
const adminAuth = [auth.verifyWallet, auth.verifyAdmin, auditMiddleware];

// Secure read-only auth (timestamp-based signature) - for read operations
// Requires: wallet, signature, timestamp in request body
const adminReadOnly = [auth.verifyAdminReadAuth];

// ============================================================
// ADMIN VERIFICATION
// ============================================================

/**
 * POST /admin/verify
 * Verify if connected wallet has admin access (nonce-based)
 */
router.post('/admin/verify', auth.verifyWallet, auth.verifyAdmin, (req, res) => {
  res.json({
    isAdmin: true,
    wallet: req.authenticatedWallet
  });
});

/**
 * POST /admin/verify-session
 * Verify if connected wallet has admin access (timestamp-based, for session auth)
 * Uses the same signature as read operations - one signature for everything
 */
router.post('/admin/verify-session', auth.verifyAdminReadAuth, (req, res) => {
  res.json({
    isAdmin: true,
    wallet: req.authenticatedWallet
  });
});

// ============================================================
// SYSTEM STATUS
// ============================================================

/**
 * POST /admin/status
 * Get comprehensive system status
 */
router.post('/admin/status', adminReadOnly, async (req, res) => {
  try {
    const status = await adminService.getSystemStatus();
    res.json(status);
  } catch (error) {
    console.error('Admin status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SERVICE CONTROLS
// ============================================================

/**
 * POST /listener/start
 * Start the contract event listener
 */
router.post('/listener/start', adminAuth, async (req, res) => {
  try {
    if (contractListener.getStatus().isListening) {
      return res.status(400).json({ error: 'Listener already running' });
    }

    await contractListener.initialize();
    const result = await contractListener.start();

    await adminService.logAdminAction('service_started', 'service', 'contractListener', req.authenticatedWallet, {});

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Start listener error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /listener/stop
 * Stop the contract event listener
 */
router.post('/listener/stop', adminAuth, async (req, res) => {
  try {
    contractListener.stop();

    await adminService.logAdminAction('service_stopped', 'service', 'contractListener', req.authenticatedWallet, {});

    res.json({ success: true, message: 'Listener stopped' });
  } catch (error) {
    console.error('Stop listener error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /listener/stats
 * Get contract listener statistics
 */
router.post('/listener/stats', adminReadOnly, async (req, res) => {
  try {
    const stats = await adminService.getListenerStats();
    res.json(stats);
  } catch (error) {
    console.error('Listener stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// DOMAIN MANAGEMENT
// ============================================================

/**
 * POST /admin/domains
 * List all domains with pagination and filtering
 */
router.post('/admin/domains', adminReadOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', tld = '' } = req.body;
    const result = await adminService.listDomains({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      search,
      status,
      tld
    });
    res.json(result);
  } catch (error) {
    console.error('List domains error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /admin/domains/:id/status
 * Update domain status
 */
router.put('/admin/domains/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await adminService.updateDomainStatus(
      parseInt(id, 10),
      status,
      req.authenticatedWallet
    );
    res.json(result);
  } catch (error) {
    console.error('Update domain status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// TLD MANAGEMENT
// ============================================================

/**
 * POST /admin/tlds/list
 * List all TLDs (including inactive)
 */
router.post('/admin/tlds/list', adminReadOnly, async (req, res) => {
  try {
    const tlds = await adminService.listAllTLDs();
    res.json(tlds);
  } catch (error) {
    console.error('List TLDs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/tlds
 * Create a new TLD with optional pricing config
 */
router.post('/admin/tlds', adminAuth, async (req, res) => {
  try {
    const {
      name,
      description,
      icon_url,
      base_price_usd,
      price_multiplier_ultra,
      price_multiplier_premium,
      price_multiplier_standard_plus,
      renewal_price_multiplier,
      display_order,
      featured,
      registration_open,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'TLD name is required' });
    }

    const options = {
      description,
      icon_url,
      base_price_usd: base_price_usd !== undefined ? parseFloat(base_price_usd) : undefined,
      price_multiplier_ultra: price_multiplier_ultra !== undefined ? parseFloat(price_multiplier_ultra) : undefined,
      price_multiplier_premium: price_multiplier_premium !== undefined ? parseFloat(price_multiplier_premium) : undefined,
      price_multiplier_standard_plus: price_multiplier_standard_plus !== undefined ? parseFloat(price_multiplier_standard_plus) : undefined,
      renewal_price_multiplier: renewal_price_multiplier !== undefined ? parseFloat(renewal_price_multiplier) : undefined,
      display_order: display_order !== undefined ? parseInt(display_order, 10) : undefined,
      featured,
      registration_open,
    };

    // Remove undefined values
    Object.keys(options).forEach(key => options[key] === undefined && delete options[key]);

    const tld = await adminService.createTLD(name, req.authenticatedWallet, options);
    res.status(201).json(tld);
  } catch (error) {
    console.error('Create TLD error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/tlds/:id
 * Get a single TLD with full details
 */
router.post('/admin/tlds/:id', adminReadOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const tld = await adminService.getTLD(id);

    if (!tld) {
      return res.status(404).json({ error: 'TLD not found' });
    }

    res.json(tld);
  } catch (error) {
    console.error('Get TLD error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/tlds/sync
 * Scan HNS wallet and sync owned TLDs to database
 */
router.post('/admin/tlds/sync', adminAuth, async (req, res) => {
  try {
    const result = await adminService.syncTLDsFromWallet(req.authenticatedWallet);
    res.json(result);
  } catch (error) {
    console.error('Sync TLDs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /admin/tlds/:id
 * Update TLD settings and pricing
 */
router.put('/admin/tlds/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      is_active,
      registration_open,
      description,
      icon_url,
      base_price_usd,
      price_multiplier_ultra,
      price_multiplier_premium,
      price_multiplier_standard_plus,
      renewal_price_multiplier,
      display_order,
      featured,
    } = req.body;

    const updates = {};

    // Boolean fields
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    if (typeof registration_open === 'boolean') updates.registration_open = registration_open;
    if (typeof featured === 'boolean') updates.featured = featured;

    // String fields
    if (description !== undefined) updates.description = description;
    if (icon_url !== undefined) updates.icon_url = icon_url;

    // Numeric fields
    if (base_price_usd !== undefined) updates.base_price_usd = parseFloat(base_price_usd);
    if (price_multiplier_ultra !== undefined) updates.price_multiplier_ultra = parseFloat(price_multiplier_ultra);
    if (price_multiplier_premium !== undefined) updates.price_multiplier_premium = parseFloat(price_multiplier_premium);
    if (price_multiplier_standard_plus !== undefined) updates.price_multiplier_standard_plus = parseFloat(price_multiplier_standard_plus);
    if (renewal_price_multiplier !== undefined) updates.renewal_price_multiplier = parseFloat(renewal_price_multiplier);
    if (display_order !== undefined) updates.display_order = parseInt(display_order, 10);

    const result = await adminService.updateTLD(
      parseInt(id, 10),
      updates,
      req.authenticatedWallet
    );
    res.json(result);
  } catch (error) {
    console.error('Update TLD error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// AUDIT LOG
// ============================================================

/**
 * POST /admin/audit
 * Get audit log with pagination and filtering
 */
router.post('/admin/audit', adminReadOnly, async (req, res) => {
  try {
    const { page = 1, limit = 50, action = '', entityType = '', startDate = '', endDate = '' } = req.body;
    const result = await adminService.getAuditLog({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      action,
      entityType,
      startDate,
      endDate
    });
    res.json(result);
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/audit/export
 * Export audit log as CSV
 */
router.post('/admin/audit/export', adminReadOnly, async (req, res) => {
  try {
    const { action = '', entityType = '', startDate = '', endDate = '' } = req.body;
    const csv = await adminService.exportAuditLog({ action, entityType, startDate, endDate });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-log-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export audit log error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// RESERVED WORDS
// ============================================================

/**
 * POST /admin/reserved/list
 * List all reserved words
 */
router.post('/admin/reserved/list', adminReadOnly, async (req, res) => {
  try {
    const words = await adminService.getReservedWords();
    res.json(words);
  } catch (error) {
    console.error('Get reserved words error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/reserved
 * Add a reserved word
 */
router.post('/admin/reserved', adminAuth, async (req, res) => {
  try {
    const { word, reason } = req.body;

    if (!word) {
      return res.status(400).json({ error: 'Word is required' });
    }

    const result = await adminService.addReservedWord(word, reason || '', req.authenticatedWallet);
    res.status(201).json(result);
  } catch (error) {
    console.error('Add reserved word error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /admin/reserved/:word
 * Remove a reserved word
 */
router.delete('/admin/reserved/:word', adminAuth, async (req, res) => {
  try {
    const { word } = req.params;
    const result = await adminService.removeReservedWord(word, req.authenticatedWallet);
    res.json(result);
  } catch (error) {
    console.error('Remove reserved word error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// DATABASE STATS
// ============================================================

/**
 * POST /admin/db/stats
 * Get database statistics
 */
router.post('/admin/db/stats', adminReadOnly, async (req, res) => {
  try {
    const stats = await adminService.getDatabaseStats();
    res.json(stats);
  } catch (error) {
    console.error('Get DB stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/db/pending
 * Get pending purchases
 */
router.post('/admin/db/pending', adminReadOnly, async (req, res) => {
  try {
    const pending = await adminService.getPendingPurchases();
    res.json(pending);
  } catch (error) {
    console.error('Get pending purchases error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// PRICING
// ============================================================

/**
 * POST /admin/pricing/compare
 * Get FTSO vs on-chain price comparison
 */
router.post('/admin/pricing/compare', adminReadOnly, async (req, res) => {
  try {
    const comparison = await adminService.getPriceComparison();
    res.json(comparison);
  } catch (error) {
    console.error('Get price comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/pricing/history
 * Get price sync history
 */
router.post('/admin/pricing/history', adminReadOnly, async (req, res) => {
  try {
    const { limit = 100 } = req.body;
    const history = await adminService.getPriceSyncHistory(Math.min(parseInt(limit, 10), 500));
    res.json(history);
  } catch (error) {
    console.error('Get price history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// HNS NODE
// ============================================================

/**
 * POST /admin/hns/start
 * Start the HNS node (hsd service)
 */
router.post('/admin/hns/start', (req, res, next) => {
  console.log('[HNS Start] Request body:', { wallet: req.body?.wallet, hasSignature: !!req.body?.signature, hasNonce: !!req.body?.nonce });
  next();
}, adminAuth, async (req, res) => {
  try {
    console.log('[HNS Start] Auth passed, starting node...');
    const result = await adminService.startHNSNode(req.authenticatedWallet);
    res.json(result);
  } catch (error) {
    console.error('Start HNS node error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/hns/stop
 * Stop the HNS node (hsd service)
 */
router.post('/admin/hns/stop', adminAuth, async (req, res) => {
  try {
    const result = await adminService.stopHNSNode(req.authenticatedWallet);
    res.json(result);
  } catch (error) {
    console.error('Stop HNS node error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/hns/wallet
 * Get HNS wallet info and owned TLDs
 */
router.post('/admin/hns/wallet', adminReadOnly, async (req, res) => {
  try {
    const info = await adminService.getHNSWalletInfo();
    res.json(info);
  } catch (error) {
    console.error('Get HNS wallet info error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/hns/tlds
 * Get all owned TLDs enriched with name info, records, and flr: address
 */
router.post('/admin/hns/tlds', adminReadOnly, async (req, res) => {
  try {
    const result = await hnsService.getOwnedTLDsWithDetails();
    res.json(result);
  } catch (error) {
    console.error('Get HNS TLDs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/hns/tlds/:tld/set-flr
 * Set flr:0x... TXT record on a TLD
 * Body: { flareAddress }
 */
router.post('/admin/hns/tlds/:tld/set-flr', adminAuth, async (req, res) => {
  try {
    const { tld } = req.params;
    const { flareAddress } = req.body;

    if (!flareAddress || !/^0x[a-fA-F0-9]{40}$/.test(flareAddress)) {
      return res.status(400).json({ error: 'Invalid Flare address. Must be 0x followed by 40 hex characters.' });
    }

    // Verify we own this TLD
    const ownership = await hnsService.checkTLDOwnership(tld);
    if (!ownership.owned) {
      return res.status(404).json({ error: `TLD "${tld}" not found in local wallet` });
    }

    // Set the TXT record, replacing any existing flr: entry
    const result = await hnsService.setTxtRecord(tld, `flr:${flareAddress}`, 'primary', 'flr:');

    if (result.success) {
      await adminService.logAdminAction('hns_set_flr', 'tld', tld, req.authenticatedWallet, { flareAddress, txHash: result.txHash });
    }

    res.json(result);
  } catch (error) {
    console.error('Set FLR record error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/hns/tlds/set-flr-batch
 * Set flr:0x... TXT record on multiple TLDs sequentially
 * Body: { tlds: string[], flareAddress: string }
 */
router.post('/admin/hns/tlds/set-flr-batch', adminAuth, async (req, res) => {
  try {
    const { tlds, flareAddress } = req.body;

    if (!flareAddress || !/^0x[a-fA-F0-9]{40}$/.test(flareAddress)) {
      return res.status(400).json({ error: 'Invalid Flare address' });
    }

    if (!Array.isArray(tlds) || tlds.length === 0) {
      return res.status(400).json({ error: 'tlds must be a non-empty array' });
    }

    if (tlds.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 TLDs per batch' });
    }

    // Process sequentially to avoid wallet nonce/UTXO conflicts
    const results = [];
    for (const tld of tlds) {
      try {
        const ownership = await hnsService.checkTLDOwnership(tld);
        if (!ownership.owned) {
          results.push({ tld, success: false, error: 'Not owned by local wallet' });
          continue;
        }

        const result = await hnsService.setTxtRecord(tld, `flr:${flareAddress}`, 'primary', 'flr:');
        results.push({ tld, success: result.success, txHash: result.txHash, error: result.error });

        if (result.success) {
          await adminService.logAdminAction('hns_set_flr_batch', 'tld', tld, req.authenticatedWallet, { flareAddress, txHash: result.txHash });
        }
      } catch (err) {
        results.push({ tld, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ success: successCount > 0, total: tlds.length, successCount, results });
  } catch (error) {
    console.error('Batch set FLR error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/flr/wallet
 * Get FLR (Flare) wallet info and balance
 */
router.post('/admin/flr/wallet', adminReadOnly, async (req, res) => {
  try {
    const info = await adminService.getFLRWalletInfo();
    res.json(info);
  } catch (error) {
    console.error('Get FLR wallet info error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/addresses
 * Get all system addresses (wallets and contracts)
 */
router.post('/admin/addresses', adminReadOnly, async (req, res) => {
  try {
    const addresses = await adminService.getSystemAddresses();
    res.json(addresses);
  } catch (error) {
    console.error('Get system addresses error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// COMFYUI GPU MANAGEMENT
// ============================================================

/**
 * POST /admin/comfyui/status
 * Get ComfyUI GPU status including generation counts and restart state
 */
router.post('/admin/comfyui/status', adminReadOnly, async (req, res) => {
  try {
    const status = await comfyuiManager.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Get ComfyUI status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/comfyui/restart/:gpuId
 * Force restart a specific GPU (gpu0, gpu1, gpu2)
 */
router.post('/admin/comfyui/restart/:gpuId', adminAuth, async (req, res) => {
  try {
    const { gpuId } = req.params;
    const result = await comfyuiManager.forceRestart(gpuId);

    await adminService.logAdminAction('comfyui_restart', 'gpu', gpuId, req.authenticatedWallet, {});

    res.json({ success: true, gpuId, message: `GPU ${gpuId} restart initiated` });
  } catch (error) {
    console.error('Restart ComfyUI error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/comfyui/restart-all
 * Queue restart for all GPUs (staggered)
 */
router.post('/admin/comfyui/restart-all', adminAuth, async (req, res) => {
  try {
    const result = await comfyuiManager.restartAll();

    await adminService.logAdminAction('comfyui_restart_all', 'gpu', 'all', req.authenticatedWallet, {});

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Restart all ComfyUI error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/comfyui/reset-counter/:gpuId
 * Reset generation counter for a GPU without restarting
 */
router.post('/admin/comfyui/reset-counter/:gpuId', adminAuth, async (req, res) => {
  try {
    const { gpuId } = req.params;
    const result = comfyuiManager.resetCounter(gpuId);

    await adminService.logAdminAction('comfyui_reset_counter', 'gpu', gpuId, req.authenticatedWallet, { oldCount: result.oldCount });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Reset counter error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/comfyui/reset-all-counters
 * Reset all generation counters without restarting
 */
router.post('/admin/comfyui/reset-all-counters', adminAuth, async (req, res) => {
  try {
    const result = comfyuiManager.resetAllCounters();

    await adminService.logAdminAction('comfyui_reset_all_counters', 'gpu', 'all', req.authenticatedWallet, {});

    res.json({ success: true, results: result });
  } catch (error) {
    console.error('Reset all counters error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/comfyui/generation-counts
 * Get generation counts for all GPUs
 */
router.post('/admin/comfyui/generation-counts', adminReadOnly, async (req, res) => {
  try {
    const counts = comfyuiManager.getGenerationCounts();
    res.json(counts);
  } catch (error) {
    console.error('Get generation counts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GPU TEST DASHBOARD
// ============================================================

/**
 * POST /admin/gpu-tests/progress
 * Get progress of all GPU test sections
 */
router.post('/admin/gpu-tests/progress', adminReadOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import('../db/index.js');

    // Get section progress
    const progressResult = await dbQuery(`
      SELECT section_id, test_run_id, status, total_batches, completed_batches,
             started_at, completed_at, avg_style_score, avg_theme_score, pass_rate
      FROM gpu_test_progress
      ORDER BY section_id
    `);

    // Get overall stats
    const statsResult = await dbQuery(`
      SELECT
        COUNT(*) as total_images,
        COUNT(*) FILTER (WHERE success = true) as success_count,
        COUNT(*) FILTER (WHERE success = false) as failed_count,
        AVG(llava_style_score) FILTER (WHERE llava_style_score IS NOT NULL) as avg_style_score,
        AVG(llava_theme_score) FILTER (WHERE llava_theme_score IS NOT NULL) as avg_theme_score,
        AVG(llava_quality_score) FILTER (WHERE llava_quality_score IS NOT NULL) as avg_quality_score,
        (COUNT(*) FILTER (WHERE llava_style_score >= 5 AND llava_theme_score >= 5 AND llava_quality_score >= 5)::float /
         NULLIF(COUNT(*) FILTER (WHERE success = true), 0) * 100) as pass_rate
      FROM gpu_test_results
    `);

    const stats = statsResult.rows[0];

    res.json({
      sections: progressResult.rows,
      stats: {
        totalImages: parseInt(stats.total_images) || 0,
        successCount: parseInt(stats.success_count) || 0,
        failedCount: parseInt(stats.failed_count) || 0,
        avgStyleScore: stats.avg_style_score ? parseFloat(stats.avg_style_score) : null,
        avgThemeScore: stats.avg_theme_score ? parseFloat(stats.avg_theme_score) : null,
        avgQualityScore: stats.avg_quality_score ? parseFloat(stats.avg_quality_score) : null,
        passRate: stats.pass_rate ? parseFloat(stats.pass_rate) : 0,
      },
    });
  } catch (error) {
    console.error('Get GPU test progress error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/gpu-tests/results/:sectionId
 * Get detailed results for a specific section
 */
router.get('/admin/gpu-tests/results/:sectionId', adminReadOnly, async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { page = 1, pageSize = 50, model, themeCategory, success, minScore } = req.query;

    const { query: dbQuery } = await import('../db/index.js');

    // Build filter conditions
    const conditions = ['section_id = $1'];
    const params = [sectionId.toUpperCase()];
    let paramIndex = 2;

    if (model) {
      conditions.push(`model = $${paramIndex++}`);
      params.push(model);
    }

    if (themeCategory) {
      conditions.push(`theme_category = $${paramIndex++}`);
      params.push(themeCategory);
    }

    if (success !== undefined) {
      conditions.push(`success = $${paramIndex++}`);
      params.push(success === 'true');
    }

    if (minScore) {
      const score = parseInt(minScore);
      if (score < 5) {
        // Show failures (below pass threshold)
        conditions.push(`(llava_style_score < 5 OR llava_theme_score < 5 OR llava_quality_score < 5)`);
      } else {
        conditions.push(`llava_style_score >= $${paramIndex++}`);
        params.push(score);
      }
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await dbQuery(
      `SELECT COUNT(*) FROM gpu_test_results WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get results
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const resultsQuery = await dbQuery(
      `SELECT * FROM gpu_test_results
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parseInt(pageSize), offset]
    );

    // Get section stats
    const statsResult = await dbQuery(`
      SELECT
        COUNT(*) as total_images,
        COUNT(*) FILTER (WHERE success = true) as success_count,
        COUNT(*) FILTER (WHERE success = false) as failed_count,
        AVG(llava_style_score) FILTER (WHERE llava_style_score IS NOT NULL) as avg_style_score,
        AVG(llava_theme_score) FILTER (WHERE llava_theme_score IS NOT NULL) as avg_theme_score,
        AVG(llava_quality_score) FILTER (WHERE llava_quality_score IS NOT NULL) as avg_quality_score,
        (COUNT(*) FILTER (WHERE llava_style_score >= 5 AND llava_theme_score >= 5 AND llava_quality_score >= 5)::float /
         NULLIF(COUNT(*) FILTER (WHERE success = true), 0) * 100) as pass_rate
      FROM gpu_test_results
      WHERE section_id = $1
    `, [sectionId.toUpperCase()]);

    const stats = statsResult.rows[0];

    res.json({
      results: resultsQuery.rows,
      total,
      stats: {
        totalImages: parseInt(stats.total_images) || 0,
        successCount: parseInt(stats.success_count) || 0,
        failedCount: parseInt(stats.failed_count) || 0,
        avgStyleScore: stats.avg_style_score ? parseFloat(stats.avg_style_score) : null,
        avgThemeScore: stats.avg_theme_score ? parseFloat(stats.avg_theme_score) : null,
        avgQualityScore: stats.avg_quality_score ? parseFloat(stats.avg_quality_score) : null,
        passRate: stats.pass_rate ? parseFloat(stats.pass_rate) : 0,
      },
    });
  } catch (error) {
    console.error('Get GPU test results error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/gpu-tests/failed
 * Get failed images with LLaVA reasoning
 */
router.post('/admin/gpu-tests/failed', adminReadOnly, async (req, res) => {
  try {
    const { sectionId, limit = 50 } = req.body;
    const { query: dbQuery } = await import('../db/index.js');

    let whereClause = 'success = false OR llava_style_score < 5 OR llava_theme_score < 5 OR llava_quality_score < 5';
    const params = [parseInt(limit)];

    if (sectionId) {
      whereClause = `(${whereClause}) AND section_id = $2`;
      params.push(sectionId.toUpperCase());
    }

    const result = await dbQuery(
      `SELECT * FROM gpu_test_results
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $1`,
      params
    );

    res.json({ results: result.rows });
  } catch (error) {
    console.error('Get failed images error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/gpu-tests/stats-by-model
 * Get aggregated stats grouped by model
 */
router.post('/admin/gpu-tests/stats-by-model', adminReadOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import('../db/index.js');

    const result = await dbQuery(`
      SELECT
        model,
        COUNT(*) as total_images,
        AVG(llava_style_score) as avg_style_score,
        AVG(llava_theme_score) as avg_theme_score,
        AVG(llava_quality_score) as avg_quality_score,
        (COUNT(*) FILTER (WHERE llava_style_score >= 5 AND llava_theme_score >= 5)::float /
         NULLIF(COUNT(*), 0) * 100) as pass_rate
      FROM gpu_test_results
      WHERE success = true
      GROUP BY model
      ORDER BY model
    `);

    res.json({ stats: result.rows });
  } catch (error) {
    console.error('Get stats by model error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/gpu-tests/stats-by-theme
 * Get aggregated stats grouped by theme category
 */
router.post('/admin/gpu-tests/stats-by-theme', adminReadOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import('../db/index.js');

    const result = await dbQuery(`
      SELECT
        theme_category,
        COUNT(*) as total_images,
        AVG(llava_style_score) as avg_style_score,
        AVG(llava_theme_score) as avg_theme_score,
        AVG(llava_quality_score) as avg_quality_score,
        (COUNT(*) FILTER (WHERE llava_style_score >= 5 AND llava_theme_score >= 5)::float /
         NULLIF(COUNT(*), 0) * 100) as pass_rate
      FROM gpu_test_results
      WHERE success = true
      GROUP BY theme_category
      ORDER BY theme_category
    `);

    res.json({ stats: result.rows });
  } catch (error) {
    console.error('Get stats by theme error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/gpu-tests/stats-by-style
 * Get aggregated stats grouped by style category
 */
router.post('/admin/gpu-tests/stats-by-style', adminReadOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import('../db/index.js');

    const result = await dbQuery(`
      SELECT
        COALESCE(style_category, 'default') as style_category,
        COUNT(*) as total_images,
        AVG(llava_style_score) as avg_style_score,
        AVG(llava_theme_score) as avg_theme_score,
        AVG(llava_quality_score) as avg_quality_score,
        (COUNT(*) FILTER (WHERE llava_style_score >= 5 AND llava_theme_score >= 5)::float /
         NULLIF(COUNT(*), 0) * 100) as pass_rate
      FROM gpu_test_results
      WHERE success = true
      GROUP BY style_category
      ORDER BY style_category
    `);

    res.json({ stats: result.rows });
  } catch (error) {
    console.error('Get stats by style error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// WALLET MANAGEMENT
// ============================================================

router.post('/admin/wallets/overview', adminReadOnly, async (req, res) => {
  try {
    const result = await walletService.getAllWalletBalances();
    res.json(result);
  } catch (error) {
    console.error('Wallet overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/wallets/transactions', adminReadOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.body;
    const result = await walletService.getTransactionHistory(parseInt(page, 10), Math.min(parseInt(limit, 10), 100));
    res.json(result);
  } catch (error) {
    console.error('Wallet transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/wallets/gas-summary', adminReadOnly, async (req, res) => {
  try {
    const { period = '7d' } = req.body;
    const result = await walletService.getGasSummary(period);
    res.json(result);
  } catch (error) {
    console.error('Gas summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/wallets/contract-log', adminReadOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, action = null } = req.body;
    const result = await walletService.getContractLog(parseInt(page, 10), Math.min(parseInt(limit, 10), 100), action);
    res.json(result);
  } catch (error) {
    console.error('Contract log error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/wallets/nonce-status', adminReadOnly, async (req, res) => {
  try {
    const result = await walletService.getNonceStatus();
    res.json(result);
  } catch (error) {
    console.error('Nonce status error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/wallets/alerts', adminReadOnly, async (req, res) => {
  try {
    const result = await walletService.getBalanceAlerts();
    res.json(result);
  } catch (error) {
    console.error('Balance alerts error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/wallets/send-flr', adminAuth, async (req, res) => {
  try {
    const { toAddress, amount, fromWallet } = req.body;
    const result = await walletService.sendFLR(toAddress, amount, req.authenticatedWallet, fromWallet || 'backend');
    res.json(result);
  } catch (error) {
    console.error('Send FLR error:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/admin/wallets/send-hns', adminAuth, async (req, res) => {
  try {
    const { toAddress, amount } = req.body;
    const result = await walletService.sendHNS(toAddress, amount, req.authenticatedWallet);
    res.json(result);
  } catch (error) {
    console.error('Send HNS error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
// PM2 PROCESS MANAGEMENT
// ============================================================

/**
 * POST /admin/pm2/list
 * Get list of all PM2 processes
 */
router.post('/admin/pm2/list', adminReadOnly, async (req, res) => {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout).map(p => ({
      name: p.name,
      pm_id: p.pm_id,
      status: p.pm2_env?.status || 'unknown',
      cpu: p.monit?.cpu || 0,
      memory: p.monit?.memory || 0,
      uptime: p.pm2_env?.pm_uptime || null,
      restarts: p.pm2_env?.restart_time || 0,
    }));
    res.json({ processes });
  } catch (error) {
    console.error('PM2 list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/pm2/restart/:name
 * Restart a PM2 process
 */
router.post('/admin/pm2/restart/:name', adminAuth, async (req, res) => {
  try {
    const name = sanitizePM2Name(req.params.name);
    await execAsync(`pm2 restart ${name}`);
    await adminService.logAdminAction('pm2_restart', 'process', name, req.authenticatedWallet, {});
    res.json({ success: true, message: `Process ${name} restarted` });
  } catch (error) {
    console.error('PM2 restart error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/pm2/stop/:name
 * Stop a PM2 process
 */
router.post('/admin/pm2/stop/:name', adminAuth, async (req, res) => {
  try {
    const name = sanitizePM2Name(req.params.name);
    await execAsync(`pm2 stop ${name}`);
    await adminService.logAdminAction('pm2_stop', 'process', name, req.authenticatedWallet, {});
    res.json({ success: true, message: `Process ${name} stopped` });
  } catch (error) {
    console.error('PM2 stop error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/pm2/start/:name
 * Start a PM2 process
 */
router.post('/admin/pm2/start/:name', adminAuth, async (req, res) => {
  try {
    const name = sanitizePM2Name(req.params.name);
    await execAsync(`pm2 start ${name}`);
    await adminService.logAdminAction('pm2_start', 'process', name, req.authenticatedWallet, {});
    res.json({ success: true, message: `Process ${name} started` });
  } catch (error) {
    console.error('PM2 start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/pm2/logs/:name
 * Get last 50 lines of logs for a PM2 process
 */
router.post('/admin/pm2/logs/:name', adminReadOnly, async (req, res) => {
  try {
    const name = sanitizePM2Name(req.params.name);
    const [outResult, errResult] = await Promise.allSettled([
      execAsync(`pm2 logs ${name} --lines 50 --nostream 2>/dev/null || true`),
      execAsync(`pm2 logs ${name} --lines 50 --nostream --err 2>/dev/null || true`),
    ]);
    res.json({
      stdout: outResult.status === 'fulfilled' ? outResult.value.stdout : '',
      stderr: errResult.status === 'fulfilled' ? errResult.value.stdout : '',
    });
  } catch (error) {
    console.error('PM2 logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// REMOTE PROCESS MONITORING
// ============================================================

// Remote machine configurations for process monitoring
const REMOTE_MACHINES = {
  '10.0.0.67': { user: 'mosana1', label: 'Render Station 1 (3080x2)' },
  '10.0.0.220': { user: 'render1x3080', label: 'Render Station 2 (3080x2)' },
  '10.0.0.249': { user: 'nosana4', label: 'Render Station 3 (3060x2)' },
  '10.0.0.97': { user: 'm3060', label: 'Render Station 4 (3060x2)' },
};

// Systemd services to monitor on remote machines
const MONITORED_SERVICES = [
  'unbound',
  'docker',
  'nginx',
  'lactd',
  'comfyui',
];

// Helper service patterns to exclude
const EXCLUDED_SERVICE_PATTERNS = [
  '-resolvconf',
  '-helper',
  '-keygen',
  '-generator',
  '-wait',
  'sssd-',
];

/**
 * POST /admin/remote-processes
 * Get processes from all remote GPU machines
 */
router.post('/admin/remote-processes', adminReadOnly, async (req, res) => {
  try {
    const results = {};

    await Promise.all(Object.entries(REMOTE_MACHINES).map(async ([ip, config]) => {
      try {
        // Get Python/ComfyUI processes and systemd services in parallel
        const [procResult, svcResult] = await Promise.allSettled([
          execAsync(
            `ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no ${config.user}@${ip} 'ps aux | grep -E "python|comfy|node" | grep -v grep | head -20'`,
            { timeout: 8000 }
          ),
          execAsync(
            `ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no ${config.user}@${ip} 'systemctl list-units --type=service --state=running,failed,inactive --no-pager --plain 2>/dev/null | grep -E "${MONITORED_SERVICES.join('|')}" || true'`,
            { timeout: 8000 }
          ),
        ]);

        // Parse processes
        const processes = [];
        if (procResult.status === 'fulfilled' && procResult.value.stdout) {
          procResult.value.stdout.trim().split('\n').filter(Boolean).forEach(line => {
            const parts = line.trim().split(/\s+/);
            const pid = parts[1];
            const cpu = parts[2];
            const mem = parts[3];
            const cmd = parts.slice(10).join(' ');

            let name = 'unknown';
            let type = 'other';
            if (cmd.includes('ComfyUI') || cmd.includes('main.py')) {
              const portMatch = cmd.match(/--port\s+(\d+)/);
              const port = portMatch ? portMatch[1] : '8188';
              name = `ComfyUI:${port}`;
              type = 'comfyui';
            } else if (cmd.includes('gpu-dashboard')) {
              name = 'GPU Dashboard';
              type = 'dashboard';
            } else if (cmd.includes('python')) {
              // Skip system utilities
              if (cmd.includes('apport') || cmd.includes('update-manager') ||
                  cmd.includes('unattended-upgrade') || cmd.includes('packagekit')) {
                type = 'system'; // Will be filtered out
              } else {
                name = cmd.split('/').pop().split(' ')[0] || 'python';
                type = 'python';
              }
            }

            if ((type !== 'other' && type !== 'system') || parseFloat(cpu) > 1) {
              processes.push({ pid, cpu: parseFloat(cpu) || 0, mem: parseFloat(mem) || 0, cmd, name, type });
            }
          });
        }

        // Parse systemd services
        const services = [];
        if (svcResult.status === 'fulfilled' && svcResult.value.stdout) {
          svcResult.value.stdout.trim().split('\n').filter(Boolean).forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              const unit = parts[0];
              const load = parts[1];
              const active = parts[2];
              const sub = parts[3];
              const name = unit.replace('.service', '');

              // Check if it's a monitored service and not an excluded helper
              const isMonitored = MONITORED_SERVICES.some(s => name.includes(s));
              const isExcluded = EXCLUDED_SERVICE_PATTERNS.some(p => name.includes(p));

              if (isMonitored && !isExcluded) {
                services.push({
                  name,
                  unit,
                  status: active === 'active' ? 'running' : active === 'failed' ? 'failed' : 'stopped',
                  subState: sub,
                });
              }
            }
          });
        }

        results[ip] = {
          label: config.label,
          status: 'online',
          processes,
          services,
        };
      } catch (err) {
        results[ip] = {
          label: config.label,
          status: 'offline',
          error: err.message,
          processes: [],
          services: [],
        };
      }
    }));

    res.json({ machines: results });
  } catch (error) {
    console.error('Remote processes error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/remote-process/restart
 * Restart a process on a remote machine
 */
router.post('/admin/remote-process/restart', adminAuth, async (req, res) => {
  try {
    const { ip, pid, type } = req.body;

    if (!REMOTE_MACHINES[ip]) {
      return res.status(400).json({ error: 'Unknown machine' });
    }

    const config = REMOTE_MACHINES[ip];

    if (type === 'comfyui') {
      // For ComfyUI, we need to restart via the proper method
      // Just kill the process - it should auto-restart if managed properly
      await execAsync(
        `ssh -o ConnectTimeout=5 ${config.user}@${ip} 'kill -9 ${pid}'`,
        { timeout: 10000 }
      );
    } else {
      await execAsync(
        `ssh -o ConnectTimeout=5 ${config.user}@${ip} 'kill -HUP ${pid} || kill -9 ${pid}'`,
        { timeout: 10000 }
      );
    }

    await adminService.logAdminAction('remote_process_restart', 'process', `${ip}:${pid}`, req.authenticatedWallet, { type });

    res.json({ success: true, message: `Process ${pid} on ${ip} restarted` });
  } catch (error) {
    console.error('Remote process restart error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/remote-service/control
 * Start/stop/restart a systemd service on a remote machine
 */
router.post('/admin/remote-service/control', adminAuth, async (req, res) => {
  try {
    const { ip, service, action } = req.body;

    if (!REMOTE_MACHINES[ip]) {
      return res.status(400).json({ error: 'Unknown machine' });
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use: start, stop, restart' });
    }

    // Sanitize service name
    const sanitizedService = service.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!MONITORED_SERVICES.some(s => sanitizedService.includes(s))) {
      return res.status(400).json({ error: 'Service not in monitored list' });
    }

    const config = REMOTE_MACHINES[ip];

    await execAsync(
      `ssh -o ConnectTimeout=5 ${config.user}@${ip} 'sudo systemctl ${action} ${sanitizedService}'`,
      { timeout: 15000 }
    );

    await adminService.logAdminAction(`remote_service_${action}`, 'service', `${ip}:${sanitizedService}`, req.authenticatedWallet, {});

    res.json({ success: true, message: `Service ${sanitizedService} ${action}ed on ${ip}` });
  } catch (error) {
    console.error('Remote service control error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// INFRASTRUCTURE MONITORING
// ============================================================

/**
 * POST /admin/infra/caddy-status
 * Get Caddy web server status
 */
router.post('/admin/infra/caddy-status', adminReadOnly, async (req, res) => {
  try {
    const [activeResult, versionResult] = await Promise.allSettled([
      execAsync('systemctl is-active caddy 2>/dev/null || echo inactive'),
      execAsync('caddy version 2>/dev/null || echo unknown'),
    ]);
    res.json({
      active: activeResult.status === 'fulfilled' ? activeResult.value.stdout.trim() : 'unknown',
      version: versionResult.status === 'fulfilled' ? versionResult.value.stdout.trim().split(' ')[0] : 'unknown',
    });
  } catch (error) {
    console.error('Caddy status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/infra/dns-check
 * Test Unbound DoH endpoint
 */
router.post('/admin/infra/dns-check', adminReadOnly, async (req, res) => {
  try {
    const start = Date.now();
    const response = await fetch('https://localhost:8443/dns-query?dns=AAABAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAAQAB', {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/dns-message' },
    }).catch(() => null);
    const latencyMs = Date.now() - start;
    res.json({
      working: response !== null && response.ok,
      latencyMs,
    });
  } catch (error) {
    res.json({ working: false, latencyMs: null, error: error.message });
  }
});

/**
 * POST /admin/infra/server-stats
 * Get remote server stats via SSH
 */
router.post('/admin/infra/server-stats', adminReadOnly, async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no 10.0.0.67 'echo "---MEM---" && free -m && echo "---DISK---" && df -h / && echo "---LOAD---" && cat /proc/loadavg && echo "---UPTIME---" && uptime -p'`,
      { timeout: 10000 }
    );

    const sections = stdout.split('---');
    const memSection = sections.find(s => s.startsWith('MEM'))?.trim() || '';
    const diskSection = sections.find(s => s.startsWith('DISK'))?.trim() || '';
    const loadSection = sections.find(s => s.startsWith('LOAD'))?.trim() || '';
    const uptimeSection = sections.find(s => s.startsWith('UPTIME'))?.trim() || '';

    // Parse memory
    const memLines = memSection.split('\n');
    const memValues = memLines[2]?.trim().split(/\s+/) || [];
    const memory = { total: parseInt(memValues[1]) || 0, used: parseInt(memValues[2]) || 0, free: parseInt(memValues[3]) || 0 };

    // Parse disk
    const diskLines = diskSection.split('\n');
    const diskValues = diskLines[2]?.trim().split(/\s+/) || [];
    const disk = { size: diskValues[1] || '0', used: diskValues[2] || '0', avail: diskValues[3] || '0', usePct: diskValues[4] || '0%' };

    // Parse load
    const loadLine = loadSection.split('\n')[1]?.trim() || '';
    const loadParts = loadLine.split(' ');
    const load = { load1: parseFloat(loadParts[0]) || 0, load5: parseFloat(loadParts[1]) || 0, load15: parseFloat(loadParts[2]) || 0 };

    const uptime = uptimeSection.split('\n')[1]?.trim() || 'unknown';

    res.json({ memory, disk, load, uptime });
  } catch (error) {
    console.error('Server stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/infra/remote-gpus
 * Get GPU stats from remote render server via nvidia-smi over SSH
 */
router.post('/admin/infra/remote-gpus', adminReadOnly, async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no mosana1@10.0.0.67 'nvidia-smi --query-gpu=index,name,temperature.gpu,fan.speed,utilization.gpu,memory.used,memory.total,power.draw,power.limit,clocks.gr,clocks.mem --format=csv,noheader,nounits'`,
      { timeout: 10000 }
    );
    const gpus = stdout.trim().split('\n').map(line => {
      const p = line.split(',').map(s => s.trim());
      if (p.length < 11) return null;
      return {
        index: parseInt(p[0]),
        name: p[1],
        temperature: parseInt(p[2]),
        fanSpeed: parseInt(p[3]),
        utilization: parseInt(p[4]),
        memoryUsed: parseInt(p[5]),
        memoryTotal: parseInt(p[6]),
        powerDraw: parseFloat(p[7]),
        powerLimit: parseFloat(p[8]),
        clockGpu: parseInt(p[9]),
        clockMem: parseInt(p[10]),
      };
    }).filter(Boolean);
    res.json({ gpus, machine: '10.0.0.67', label: '2x RTX 3080' });
  } catch (error) {
    console.error('Remote GPU stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/infra/local-gpus
 * Get GPU stats from local machine via nvidia-smi
 */
router.post('/admin/infra/local-gpus', adminReadOnly, async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=index,name,temperature.gpu,fan.speed,utilization.gpu,memory.used,memory.total,power.draw,power.limit,clocks.gr,clocks.mem --format=csv,noheader,nounits',
      { timeout: 10000 }
    );
    const gpus = stdout.trim().split('\n').map(line => {
      const p = line.split(',').map(s => s.trim());
      if (p.length < 11) return null;
      return {
        index: parseInt(p[0]),
        name: p[1],
        temperature: parseInt(p[2]),
        fanSpeed: parseInt(p[3]),
        utilization: parseInt(p[4]),
        memoryUsed: parseInt(p[5]),
        memoryTotal: parseInt(p[6]),
        powerDraw: parseFloat(p[7]),
        powerLimit: parseFloat(p[8]),
        clockGpu: parseInt(p[9]),
        clockMem: parseInt(p[10]),
      };
    }).filter(Boolean);
    res.json({ gpus, machine: 'local', label: '3x RTX 3060' });
  } catch (error) {
    console.error('Local GPU stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/infra/ssl-certs
 * Check SSL certificate expiry for domains
 */
router.post('/admin/infra/ssl-certs', adminReadOnly, async (req, res) => {
  try {
    const domains = ['halcyon-names.io', 'halcyon-sdr.xyz'];
    const certs = await Promise.all(domains.map(async (domain) => {
      try {
        const { stdout } = await execAsync(
          `echo | openssl s_client -servername ${domain} -connect ${domain}:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null`,
          { timeout: 10000 }
        );
        const match = stdout.match(/notAfter=(.+)/);
        if (match) {
          const expiry = new Date(match[1]);
          const daysRemaining = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return { domain, expiry: expiry.toISOString(), daysRemaining };
        }
        return { domain, expiry: null, daysRemaining: null, error: 'Could not parse certificate' };
      } catch (err) {
        return { domain, expiry: null, daysRemaining: null, error: err.message };
      }
    }));
    res.json({ certs });
  } catch (error) {
    console.error('SSL certs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// DIAGNOSTICS
// ============================================================

/**
 * POST /diagnostics
 * Comprehensive system diagnostics
 */
router.post('/diagnostics', adminReadOnly, async (req, res) => {
  try {
    const diagnostics = await runDiagnostics();
    res.json(diagnostics);
  } catch (error) {
    console.error('Diagnostics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /diagnostics/:section
 * Run specific diagnostic section
 */
router.post('/diagnostics/:section', adminReadOnly, async (req, res) => {
  try {
    const { section } = req.params;
    const validSections = ['services', 'database', 'blockchain', 'watcher', 'marketplace', 'docker'];

    if (!validSections.includes(section)) {
      return res.status(400).json({
        error: `Invalid section. Valid options: ${validSections.join(', ')}`
      });
    }

    const diagnostics = await runDiagnostics(section);
    res.json(diagnostics);
  } catch (error) {
    console.error('Diagnostics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Run comprehensive system diagnostics
 */
async function runDiagnostics(section = null) {
  const { query } = await import('../db/index.js');
  const { default: config } = await import('../config/index.js');
  const { ethers } = await import('ethers');

  const results = {
    timestamp: new Date().toISOString(),
    summary: { pass: 0, warn: 0, fail: 0, status: 'unknown' },
    checks: {}
  };

  const addCheck = (category, name, status, message, details = {}) => {
    if (!results.checks[category]) results.checks[category] = [];
    results.checks[category].push({ name, status, message, ...details });
    if (status === 'pass') results.summary.pass++;
    else if (status === 'warn') results.summary.warn++;
    else if (status === 'fail') results.summary.fail++;
  };

  // ─── SERVICES ───
  if (!section || section === 'services') {
    // Backend (self-check)
    addCheck('services', 'Backend API', 'pass', 'Running (self-check)');

    // Frontend
    try {
      const frontendRes = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(3000) });
      if (frontendRes.ok) {
        addCheck('services', 'Frontend', 'pass', 'Running on port 3000');
      } else {
        addCheck('services', 'Frontend', 'warn', `Responding with status ${frontendRes.status}`);
      }
    } catch (e) {
      addCheck('services', 'Frontend', 'fail', 'Not responding on port 3000');
    }

    // HSD Node
    try {
      const hsdRes = await fetch(`http://${config.hns.host}:${config.hns.port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + Buffer.from(`x:${config.hns.apiKey}`).toString('base64') },
        body: JSON.stringify({ method: 'getblockchaininfo' }),
        signal: AbortSignal.timeout(5000)
      });
      const hsdData = await hsdRes.json();
      if (hsdData.result?.blocks) {
        addCheck('services', 'HSD Node', 'pass', `Running - height: ${hsdData.result.blocks}`, { height: hsdData.result.blocks });
      } else {
        addCheck('services', 'HSD Node', 'warn', 'Responding but no block data');
      }
    } catch (e) {
      addCheck('services', 'HSD Node', 'fail', 'Not responding');
    }

    // volume-resolver (BIND DNS)
    try {
      const { exec } = await import('child_process');
      const rndcOutput = await new Promise((resolve, reject) => {
        exec('docker exec volume-resolver rndc status', { timeout: 5000 }, (err, stdout, stderr) => {
          if (err) return reject(err);
          resolve(stdout);
        });
      });
      const zoneMatch = rndcOutput.match(/number of zones:\s*(\d+)/);
      const zoneCount = zoneMatch ? parseInt(zoneMatch[1], 10) : 0;
      addCheck('services', 'DNS (BIND)', 'pass', `Running - ${zoneCount} zones`, { zoneCount });
    } catch (e) {
      addCheck('services', 'DNS (BIND)', 'fail', 'volume-resolver not responding');
    }

    // ComfyUI servers
    for (const port of [8188, 8189, 8190]) {
      const gpuName = `GPU${port - 8188}`;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/system_stats`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          addCheck('services', `ComfyUI ${gpuName}`, 'pass', `Running on port ${port}`);
        } else {
          addCheck('services', `ComfyUI ${gpuName}`, 'warn', `Responding with status ${res.status}`);
        }
      } catch (e) {
        addCheck('services', `ComfyUI ${gpuName}`, 'warn', `Not running on port ${port}`);
      }
    }
  }

  // ─── DATABASE ───
  if (!section || section === 'database') {
    try {
      // Connection check
      await query('SELECT 1');
      addCheck('database', 'Connection', 'pass', 'Connected to PostgreSQL');

      // Table counts (V1 + V2)
      const counts = {};
      const tables = ['domains', 'tlds', 'slds_v2', 'tlds_v2', 'marketplace_listings', 'marketplace_activity', 'pending_purchases', 'processed_events'];
      for (const table of tables) {
        try {
          const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
          counts[table] = parseInt(result.rows[0].count);
        } catch { counts[table] = 0; }
      }
      addCheck('database', 'Table Counts', 'pass', 'Retrieved successfully', { counts });

      // Active TLDs (V1 + V2)
      const tldsResult = await query("SELECT id, name FROM tlds WHERE is_active = true ORDER BY name");
      const tldsV2Result = await query("SELECT id, label AS name FROM tlds_v2 WHERE registration_enabled = true ORDER BY label");
      const allTlds = [...tldsResult.rows.map(r => ({ ...r, version: 'v1' })), ...tldsV2Result.rows.map(r => ({ ...r, version: 'v2' }))];
      addCheck('database', 'Active TLDs', 'pass', `${allTlds.length} TLD(s) (${tldsResult.rows.length} V1, ${tldsV2Result.rows.length} V2)`, { tlds: allTlds });

      // Orphaned listings check (V1 + V2)
      const orphanResult = await query(`
        SELECT COUNT(*) as count FROM marketplace_listings ml
        LEFT JOIN domains d ON ml.token_id = d.token_id
        LEFT JOIN slds_v2 s ON ml.token_id = s.token_id
        WHERE d.id IS NULL AND s.id IS NULL AND ml.status = 'active'
      `);
      const orphanCount = parseInt(orphanResult.rows[0].count);
      if (orphanCount === 0) {
        addCheck('database', 'Data Integrity', 'pass', 'No orphaned listings');
      } else {
        addCheck('database', 'Data Integrity', 'warn', `${orphanCount} orphaned listings`, { orphanedListings: orphanCount });
      }

      // Stuck pending purchases
      const stuckResult = await query(`
        SELECT COUNT(*) as count FROM pending_purchases
        WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour'
      `);
      const stuckCount = parseInt(stuckResult.rows[0].count);
      if (stuckCount === 0) {
        addCheck('database', 'Pending Purchases', 'pass', 'No stuck purchases');
      } else {
        addCheck('database', 'Pending Purchases', 'warn', `${stuckCount} stuck (>1 hour old)`, { stuckCount });
      }

    } catch (e) {
      addCheck('database', 'Connection', 'fail', `Error: ${e.message}`);
    }
  }

  // ─── BLOCKCHAIN ───
  if (!section || section === 'blockchain') {
    try {
      const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
      const currentBlock = await provider.getBlockNumber();
      addCheck('blockchain', 'Flare RPC', 'pass', `Connected - block: ${currentBlock}`, { currentBlock });

      // Contract listener status
      const listenerStatus = contractListener.getStatus();
      if (listenerStatus.isListening) {
        const blocksBehind = currentBlock - listenerStatus.lastProcessedBlock;
        if (blocksBehind < 100) {
          addCheck('blockchain', 'Contract Listener', 'pass', `Synced (${blocksBehind} blocks behind)`, { blocksBehind, lastBlock: listenerStatus.lastProcessedBlock });
        } else {
          addCheck('blockchain', 'Contract Listener', 'warn', `Catching up (${blocksBehind} blocks behind)`, { blocksBehind, lastBlock: listenerStatus.lastProcessedBlock });
        }
      } else {
        addCheck('blockchain', 'Contract Listener', 'fail', 'Not running');
      }

      // Verify contracts exist
      const contracts = [
        { name: 'NFT', address: config.contracts.nft },
        { name: 'Marketplace', address: config.contracts.marketplace },
        { name: 'Escrow', address: config.contracts.escrow }
      ];
      for (const c of contracts) {
        if (c.address) {
          const code = await provider.getCode(c.address);
          if (code.length > 10) {
            addCheck('blockchain', `${c.name} Contract`, 'pass', `Deployed at ${c.address.slice(0, 10)}...`);
          } else {
            addCheck('blockchain', `${c.name} Contract`, 'fail', `Not found at ${c.address}`);
          }
        }
      }

    } catch (e) {
      addCheck('blockchain', 'Flare RPC', 'fail', `Error: ${e.message}`);
    }
  }

  // ─── WATCHER ───
  if (!section || section === 'watcher') {
    try {
      const watcherStatus = watcher.getStatus();

      if (watcherStatus.isRunning) {
        addCheck('watcher', 'Service', 'pass', 'Running', { activeTlds: watcherStatus.activeTlds?.length || 0 });
      } else {
        addCheck('watcher', 'Service', 'info', 'Stopped (all propagated or not started)');
      }

      // TLD propagation status
      if (watcherStatus.nsPropagation) {
        for (const [tld, data] of Object.entries(watcherStatus.nsPropagation)) {
          if (data.allPropagated) {
            addCheck('watcher', `TLD: ${tld}`, 'pass', `Fully propagated (${data.propagatedCount}/${data.requiredCount})`);
          } else {
            addCheck('watcher', `TLD: ${tld}`, 'warn', `Propagating (${data.propagatedCount}/${data.requiredCount})`);
          }
        }
      }
    } catch (e) {
      addCheck('watcher', 'Service', 'fail', `Error: ${e.message}`);
    }
  }

  // ─── MARKETPLACE ───
  if (!section || section === 'marketplace') {
    try {
      const statsResult = await query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_listings,
          COUNT(*) FILTER (WHERE status = 'sold') as total_sales,
          COALESCE(SUM(sale_price) FILTER (WHERE status = 'sold'), 0) as total_volume,
          COALESCE(MIN(price) FILTER (WHERE status = 'active'), 0) as floor_price
        FROM marketplace_listings
      `);
      const stats = statsResult.rows[0];

      addCheck('marketplace', 'Statistics', 'pass', 'Retrieved successfully', {
        activeListings: parseInt(stats.active_listings),
        totalSales: parseInt(stats.total_sales),
        totalVolume: parseFloat(stats.total_volume),
        floorPrice: parseFloat(stats.floor_price)
      });

      if (parseInt(stats.active_listings) > 0) {
        addCheck('marketplace', 'Listings', 'pass', `${stats.active_listings} active listings`);
      } else {
        addCheck('marketplace', 'Listings', 'warn', 'No active listings');
      }
    } catch (e) {
      addCheck('marketplace', 'Statistics', 'fail', `Error: ${e.message}`);
    }
  }

  // ─── DOCKER BACKUP ───
  if (!section || section === 'docker') {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('docker ps --format "{{.Names}}" 2>/dev/null | grep subdomain_registry_db || true');

      if (stdout.trim()) {
        addCheck('docker', 'Backup Container', 'pass', 'Docker PostgreSQL backup is running');

        // Compare counts
        try {
          const { stdout: dockerDomains } = await execAsync('docker exec subdomain_registry_db psql -U subdomain_user -d subdomain_registry -t -c "SELECT COUNT(*) FROM domains" 2>/dev/null');
          const nativeResult = await query('SELECT COUNT(*) FROM domains');

          const dockerCount = parseInt(dockerDomains.trim());
          const nativeCount = parseInt(nativeResult.rows[0].count);

          if (dockerCount === nativeCount) {
            addCheck('docker', 'Data Sync', 'pass', `Counts match (${nativeCount} domains)`);
          } else {
            addCheck('docker', 'Data Sync', 'warn', `Counts differ - Docker: ${dockerCount}, Native: ${nativeCount}`);
          }
        } catch (e) {
          addCheck('docker', 'Data Sync', 'warn', 'Could not compare counts');
        }
      } else {
        addCheck('docker', 'Backup Container', 'info', 'Docker PostgreSQL backup is not running');
      }
    } catch (e) {
      addCheck('docker', 'Backup Container', 'info', 'Docker not accessible');
    }
  }

  // Calculate overall status
  if (results.summary.fail > 0) {
    results.summary.status = 'unhealthy';
  } else if (results.summary.warn > 0) {
    results.summary.status = 'degraded';
  } else {
    results.summary.status = 'healthy';
  }

  return results;
}

// ============================================================
// FEATURE FLAGS / SYSTEM SETTINGS
// ============================================================

/**
 * POST /admin/features
 * Get all feature flags
 */
router.post('/admin/features', adminReadOnly, async (req, res) => {
  try {
    const result = await adminService.getFeatureFlags();
    res.json(result);
  } catch (error) {
    console.error('Get features error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /admin/features/:key
 * Update a feature flag
 */
router.put('/admin/features/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const result = await adminService.setFeatureFlag(key, enabled, req.authenticatedWallet);
    res.json(result);
  } catch (error) {
    console.error('Update feature error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/bulk-registration/toggle
 * Toggle bulk registration feature (convenience endpoint)
 */
router.post('/admin/bulk-registration/toggle', adminAuth, async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const result = await adminService.setFeatureFlag('bulk_registration_enabled', enabled, req.authenticatedWallet);
    res.json({
      success: true,
      bulkRegistrationEnabled: enabled,
      message: `Bulk registration ${enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    console.error('Toggle bulk registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GPU MONITORING
// ============================================================

/**
 * POST /admin/gpu/monitor
 * Combined GPU monitoring data: ComfyUI status, fan speeds, VRAM, queue
 */
router.post('/admin/gpu/monitor', adminReadOnly, async (req, res) => {
  try {
    let generationCounts = null;
    try { generationCounts = comfyuiManager.getGenerationCounts(); } catch {}

    const [comfyStatus, fanStatus, hardwareStats, jobQueue] = await Promise.all([
      comfyuiManager.getStatus().catch(() => null),
      gpuFanControl.getStatus().catch(() => null),
      gpuDashboard.getStats().catch(() => ({ error: 'GPU dashboard unavailable' })),
      gpuDashboard.getJobs().catch(() => ({ error: 'GPU dashboard unavailable' })),
    ]);

    // Fetch VRAM from each ComfyUI /system_stats
    const vramData = {};
    if (comfyStatus?.servers) {
      await Promise.all(
        comfyStatus.servers.map(async (server) => {
          try {
            const response = await fetch(`${server.url}/system_stats`, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
              const stats = await response.json();
              vramData[server.id] = {
                devices: stats.devices || [],
                ram: stats.ram || null,
              };
            }
          } catch {}
        })
      );
    }

    // Active model info
    let activeModel = null;
    let availableModels = null;
    try {
      activeModel = getActiveModelConfig();
      availableModels = getAvailableModels();
    } catch {}

    res.json({
      comfyui: comfyStatus,
      fans: fanStatus,
      generationCounts,
      vram: vramData,
      activeModel,
      availableModels,
      hardware: hardwareStats,
      jobQueue,
    });
  } catch (error) {
    console.error('GPU monitor error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/gpu/fan-speed
 * Set GPU fan speed on local and/or remote machines
 * Body: { wallet, signature, timestamp, speed: 0-100, target: "all"|"local"|"remote" }
 */
router.post('/admin/gpu/fan-speed', adminAuth, async (req, res) => {
  try {
    const { speed, target = 'all' } = req.body;
    // "auto" disables manual fan control
    if (speed === 'auto') {
      if (target === 'local' || target === 'all') {
        await gpuFanControl.disableLocalManualControl();
      }
      if (target === 'remote' || target === 'all') {
        await gpuFanControl.disableRemoteManualControl();
      }
      const status = await gpuFanControl.getStatus();
      return res.json({ success: true, speed: 'auto', target, status });
    }
    const s = parseInt(speed);
    if (isNaN(s) || s < 0 || s > 100) {
      return res.status(400).json({ error: 'Speed must be 0-100' });
    }
    if (target === 'local') {
      await gpuFanControl.enableLocalManualControl();
      await gpuFanControl.setLocalFanSpeed(s);
    } else if (target === 'remote') {
      await gpuFanControl.enableRemoteManualControl();
      await gpuFanControl.setRemoteFanSpeed(s);
    } else {
      await gpuFanControl.setFanSpeed(s, true);
    }
    const status = await gpuFanControl.getStatus();
    res.json({ success: true, speed: s, target, status });
  } catch (error) {
    console.error('Fan speed set error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ANALYTICS
// ============================================================

/**
 * POST /admin/analytics/registrations
 * Registration counts by day/week/month
 * Body: { wallet, signature, timestamp, range: "7d"|"30d"|"90d"|"all" }
 */
router.post('/admin/analytics/registrations', adminReadOnly, async (req, res) => {
  try {
    const range = req.body.range || '30d';
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;

    // Daily registration counts
    const daily = await query(
      `SELECT DATE(registration_date) as date, COUNT(*) as count
       FROM domains
       WHERE registration_date >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(registration_date)
       ORDER BY date`
    );

    // By TLD
    const byTld = await query(
      `SELECT t.name as tld, COUNT(*) as count
       FROM domains d
       JOIN tlds t ON d.tld_id = t.id
       WHERE d.registration_date >= NOW() - INTERVAL '${days} days'
       GROUP BY t.name
       ORDER BY count DESC`
    );

    // Total + period count
    const totals = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE registration_date >= NOW() - INTERVAL '${days} days') as period_count,
         COUNT(*) FILTER (WHERE registration_date >= NOW() - INTERVAL '1 day') as today
       FROM domains`
    );

    res.json({
      daily: daily.rows,
      byTld: byTld.rows,
      totals: totals.rows[0],
      range,
    });
  } catch (error) {
    console.error('Analytics registrations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/analytics/revenue
 * Revenue data with FLR/USD conversion
 * Body: { wallet, signature, timestamp, range }
 */
router.post('/admin/analytics/revenue', adminReadOnly, async (req, res) => {
  try {
    const range = req.body.range || '30d';
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;

    // Daily revenue
    const daily = await query(
      `SELECT DATE(registration_date) as date,
              SUM(registration_price_flr) as flr_total,
              SUM(registration_price_usd) as usd_total,
              COUNT(*) as count
       FROM domains
       WHERE registration_date >= NOW() - INTERVAL '${days} days'
         AND registration_price_flr IS NOT NULL
       GROUP BY DATE(registration_date)
       ORDER BY date`
    );

    // Total revenue
    const totals = await query(
      `SELECT
         COALESCE(SUM(registration_price_flr), 0) as total_flr,
         COALESCE(SUM(registration_price_usd), 0) as total_usd,
         COALESCE(SUM(registration_price_flr) FILTER (WHERE registration_date >= NOW() - INTERVAL '${days} days'), 0) as period_flr,
         COALESCE(SUM(registration_price_usd) FILTER (WHERE registration_date >= NOW() - INTERVAL '${days} days'), 0) as period_usd
       FROM domains
       WHERE registration_price_flr IS NOT NULL`
    );

    // Revenue by tier
    const byTier = await query(
      `SELECT tier, COUNT(*) as count,
              COALESCE(SUM(registration_price_flr), 0) as flr_total,
              COALESCE(SUM(registration_price_usd), 0) as usd_total
       FROM domains
       WHERE registration_date >= NOW() - INTERVAL '${days} days'
         AND tier IS NOT NULL
       GROUP BY tier
       ORDER BY flr_total DESC`
    );

    // Current FLR price
    let flrPrice = null;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPrice = priceData?.price ?? null;
    } catch {}

    res.json({
      daily: daily.rows,
      totals: totals.rows[0],
      byTier: byTier.rows,
      flrPrice,
      range,
    });
  } catch (error) {
    console.error('Analytics revenue error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/analytics/marketplace
 * Marketplace activity metrics
 * Body: { wallet, signature, timestamp, range }
 */
router.post('/admin/analytics/marketplace', adminReadOnly, async (req, res) => {
  try {
    const range = req.body.range || '30d';
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;

    // Activity by type
    const byType = await query(
      `SELECT event_type, COUNT(*) as count,
              COALESCE(SUM(amount), 0) as total_amount
       FROM marketplace_activity
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY event_type
       ORDER BY count DESC`
    );

    // Daily volume
    const dailyVolume = await query(
      `SELECT DATE(created_at) as date,
              COUNT(*) as transactions,
              COALESCE(SUM(amount), 0) as volume
       FROM marketplace_activity
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date`
    );

    // Active listings
    const listings = await query(
      `SELECT COUNT(*) as active_listings,
              COALESCE(AVG(price), 0) as avg_price,
              COALESCE(MIN(price), 0) as floor_price
       FROM marketplace_listings
       WHERE status = 'active'`
    );

    // Top sales
    const topSales = await query(
      `SELECT fqdn, amount, actor_wallet, counterparty_wallet, created_at
       FROM marketplace_activity
       WHERE event_type IN ('sale', 'auction_settled')
         AND created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY amount DESC
       LIMIT 10`
    );

    res.json({
      byType: byType.rows,
      dailyVolume: dailyVolume.rows,
      listings: listings.rows[0],
      topSales: topSales.rows,
      range,
    });
  } catch (error) {
    console.error('Analytics marketplace error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/analytics/users
 * User metrics and funnels
 * Body: { wallet, signature, timestamp, range }
 */
router.post('/admin/analytics/users', adminReadOnly, async (req, res) => {
  try {
    const range = req.body.range || '30d';
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;

    // Unique wallets
    const wallets = await query(
      `SELECT
         COUNT(DISTINCT owner_wallet) as total_owners,
         COUNT(DISTINCT owner_wallet) FILTER (WHERE registration_date >= NOW() - INTERVAL '${days} days') as new_owners,
         COUNT(DISTINCT owner_wallet) FILTER (WHERE registration_date >= NOW() - INTERVAL '1 day') as today_owners
       FROM domains`
    );

    // Top holders
    const topHolders = await query(
      `SELECT owner_wallet, COUNT(*) as domain_count,
              COALESCE(SUM(registration_price_flr), 0) as total_spent_flr
       FROM domains
       GROUP BY owner_wallet
       ORDER BY domain_count DESC
       LIMIT 10`
    );

    // Returning vs new (wallets with >1 registration)
    const retention = await query(
      `SELECT
         COUNT(*) FILTER (WHERE cnt = 1) as single_reg,
         COUNT(*) FILTER (WHERE cnt > 1) as returning,
         COUNT(*) FILTER (WHERE cnt >= 5) as power_users
       FROM (
         SELECT owner_wallet, COUNT(*) as cnt
         FROM domains
         GROUP BY owner_wallet
       ) sub`
    );

    // Daily unique registrants
    const dailyUsers = await query(
      `SELECT DATE(registration_date) as date,
              COUNT(DISTINCT owner_wallet) as unique_wallets,
              COUNT(*) as registrations
       FROM domains
       WHERE registration_date >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(registration_date)
       ORDER BY date`
    );

    res.json({
      wallets: wallets.rows[0],
      topHolders: topHolders.rows,
      retention: retention.rows[0],
      dailyUsers: dailyUsers.rows,
      range,
    });
  } catch (error) {
    console.error('Analytics users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// QUEUE STATUS
// ============================================================

// Queue status endpoint removed (Redis/BullMQ removed)

// ============================================================
// FDC KEEPER BOT
// ============================================================

router.get('/keeper/status', adminReadOnly, async (req, res) => {
  try {
    const status = fdcKeeper.getStatus();
    const pendingResult = await query(
      "SELECT COUNT(*) as count FROM pending_claims WHERE status = 'pending'"
    );
    const failedResult = await query(
      "SELECT COUNT(*) as count FROM pending_claims WHERE status = 'failed'"
    );
    res.json({
      ...status,
      pendingClaims: parseInt(pendingResult.rows[0].count),
      failedClaims: parseInt(failedResult.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/keeper/pending', adminReadOnly, async (req, res) => {
  try {
    const claims = await fdcKeeper.getPendingClaims();
    res.json({ claims });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/keeper/retry/:namehash', adminAuth, async (req, res) => {
  try {
    const result = await fdcKeeper.retryClaim(req.params.namehash);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================
//                ARTWORK QUEUE V2
// =============================================================

router.get('/artwork-queue/status', adminAuth, async (req, res) => {
  try {
    const status = artworkQueueV2.getStatus();
    const stats = await artworkQueueV2.getQueueStats();
    res.json({ ...status, ...stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/artwork-queue/pending', adminAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, token_id, label, tld_namehash, status, attempts, last_error,
             ipfs_cid, gpu_worker, generation_time_ms, created_at, completed_at
      FROM sld_artwork_v2
      WHERE status IN ('pending', 'failed')
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json({ jobs: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/artwork-queue/retry/:id', adminAuth, async (req, res) => {
  try {
    const result = await artworkQueueV2.retryJob(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// OPERATOR WALLET — Batch Operations
// ============================================================

/**
 * POST /admin/operator/wallets
 * Derive HD wallets from mnemonic and return addresses + balances
 */
router.post('/admin/operator/wallets', adminAuth, async (req, res) => {
  try {
    const { mnemonic, count = 5 } = req.body;
    if (!mnemonic || typeof mnemonic !== 'string') {
      return res.status(400).json({ error: 'Mnemonic is required' });
    }
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      return res.status(400).json({ error: 'Mnemonic must be 12 or 24 words' });
    }
    const walletCount = Math.min(Math.max(1, parseInt(count) || 5), 20);
    const derived = operatorWalletService.deriveWallets(mnemonic.trim(), walletCount);
    const addresses = derived.map(w => w.address);
    const balances = await operatorWalletService.getBalances(addresses);

    const wallets = derived.map((w, i) => ({
      index: w.index,
      address: w.address,
      flr: balances[i]?.flr || '0',
      wflr: balances[i]?.wflr || '0',
    }));

    res.json({ wallets });
  } catch (error) {
    console.error('Operator wallets error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/operator/batch-wrap
 * Batch wrap FLR → WFLR for multiple wallets
 */
router.post('/admin/operator/batch-wrap', adminAuth, async (req, res) => {
  try {
    const { mnemonic, operations } = req.body;
    if (!mnemonic || !Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: 'Mnemonic and operations array required' });
    }
    // Validate operations
    for (const op of operations) {
      if (typeof op.index !== 'number' || !op.amount || parseFloat(op.amount) <= 0) {
        return res.status(400).json({ error: `Invalid operation for index ${op.index}` });
      }
    }
    const results = await operatorWalletService.batchWrap(mnemonic.trim(), operations);
    res.json({ results });
  } catch (error) {
    console.error('Batch wrap error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/operator/batch-delegate
 * Batch delegate WFLR to FTSO provider for multiple wallets
 */
router.post('/admin/operator/batch-delegate', adminAuth, async (req, res) => {
  try {
    const { mnemonic, operations } = req.body;
    if (!mnemonic || !Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: 'Mnemonic and operations array required' });
    }
    for (const op of operations) {
      if (typeof op.index !== 'number' || !op.provider || !op.bips) {
        return res.status(400).json({ error: `Invalid operation for index ${op.index}` });
      }
      if (op.bips < 0 || op.bips > 10000) {
        return res.status(400).json({ error: `Bips must be 0-10000, got ${op.bips}` });
      }
    }
    const results = await operatorWalletService.batchDelegate(mnemonic.trim(), operations);
    res.json({ results });
  } catch (error) {
    console.error('Batch delegate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/operator/batch-claim
 * Batch claim FTSO rewards for multiple wallets
 */
router.post('/admin/operator/batch-claim', adminAuth, async (req, res) => {
  try {
    const { mnemonic, indices } = req.body;
    if (!mnemonic || !Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json({ error: 'Mnemonic and indices array required' });
    }
    const results = await operatorWalletService.batchClaim(mnemonic.trim(), indices);
    res.json({ results });
  } catch (error) {
    console.error('Batch claim error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
