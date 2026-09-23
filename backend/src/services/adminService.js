import { query } from '../db/index.js';
import { watcher } from './watcher.js';
import { priceSync } from './priceSync.js';
import { contractListener } from './contractListener.js';
import ftsoService from './ftso.js';
import hnsService from './hns.js';
import pdnsService from './pdns.js';
import { ethers } from 'ethers';
import config from '../config/index.js';

/**
 * Admin Service - Centralized business logic for admin operations
 */
class AdminService {
  /**
   * Get comprehensive system status
   */
  async getSystemStatus() {
    const [
      watcherStatus,
      priceSyncStatus,
      listenerStatus,
      hnsStatus,
      dbStats
    ] = await Promise.all([
      watcher.getStatus(),
      priceSync.getStatus(),
      contractListener.getStatus(),
      hnsService.isReady(),
      this.getDatabaseStats()
    ]);

    // Get FTSO price
    let ftsoPrice = null;
    try {
      ftsoPrice = await ftsoService.getFLRPrice();
    } catch (e) {
      ftsoPrice = { error: e.message };
    }

    return {
      timestamp: new Date().toISOString(),
      services: {
        watcher: {
          status: watcherStatus.isRunning ? 'running' : 'stopped',
          ...watcherStatus
        },
        priceSync: {
          status: priceSyncStatus.isRunning ? 'running' : 'stopped',
          ...priceSyncStatus
        },
        contractListener: {
          status: listenerStatus.isListening ? 'running' : 'stopped',
          ...listenerStatus
        }
      },
      hns: hnsStatus,
      ftsoPrice,
      database: dbStats
    };
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats() {
    const tables = ['domains', 'tlds', 'pending_purchases', 'audit_log', 'processed_events', 'reserved_words'];
    const stats = {};

    for (const table of tables) {
      try {
        const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
        stats[table] = parseInt(result.rows[0].count, 10);
      } catch (e) {
        stats[table] = { error: e.message };
      }
    }

    // Get pending purchases by status
    try {
      const pendingResult = await query(`
        SELECT status, COUNT(*) as count
        FROM pending_purchases
        GROUP BY status
      `);
      stats.pendingByStatus = pendingResult.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {});
    } catch (e) {
      stats.pendingByStatus = { error: e.message };
    }

    return stats;
  }

  /**
   * List domains with pagination and filters
   */
  async listDomains({ page = 1, limit = 20, search = '', status = '', tld = '' }) {
    const offset = (page - 1) * limit;

    // V1 query
    const v1Conds = [];
    const v1Params = [];
    let v1i = 1;
    if (search) { v1Conds.push(`(d.fqdn ILIKE $${v1i} OR d.owner_wallet ILIKE $${v1i})`); v1Params.push(`%${search}%`); v1i++; }
    if (status) { v1Conds.push(`d.status = $${v1i}`); v1Params.push(status); v1i++; }
    if (tld) { v1Conds.push(`t.name = $${v1i}`); v1Params.push(tld); v1i++; }
    const v1Where = v1Conds.length > 0 ? `WHERE ${v1Conds.join(' AND ')}` : '';

    const v1Count = await query(`SELECT COUNT(*) as total FROM domains d LEFT JOIN tlds t ON d.tld_id = t.id ${v1Where}`, v1Params);
    const v1Data = await query(`
      SELECT d.id, d.fqdn, d.subdomain, d.owner_wallet, d.status, t.name AS tld_name, d.created_at, 'v1' AS version
      FROM domains d LEFT JOIN tlds t ON d.tld_id = t.id ${v1Where}
      ORDER BY d.created_at DESC
    `, v1Params);

    // V2 query
    const v2Conds = [];
    const v2Params = [];
    let v2i = 1;
    if (search) { v2Conds.push(`(s.full_name ILIKE $${v2i} OR s.owner_address ILIKE $${v2i})`); v2Params.push(`%${search}%`); v2i++; }
    if (status === 'active') { v2Conds.push(`s.expiry_time > NOW()`); }
    else if (status === 'expired') { v2Conds.push(`s.expiry_time <= NOW()`); }
    if (tld) { v2Conds.push(`t2.label = $${v2i}`); v2Params.push(tld); v2i++; }
    const v2Where = v2Conds.length > 0 ? `WHERE ${v2Conds.join(' AND ')}` : '';

    let v2Rows = [];
    let v2Total = 0;
    try {
      const v2Count = await query(`SELECT COUNT(*) as total FROM slds_v2 s JOIN tlds_v2 t2 ON s.tld_id = t2.id ${v2Where}`, v2Params);
      v2Total = parseInt(v2Count.rows[0].total, 10);
      const v2Data = await query(`
        SELECT s.id, s.full_name AS fqdn, s.label AS subdomain, s.owner_address AS owner_wallet,
          CASE WHEN s.expiry_time > NOW() THEN 'active' ELSE 'expired' END AS status,
          t2.label AS tld_name, s.created_at, 'v2' AS version
        FROM slds_v2 s JOIN tlds_v2 t2 ON s.tld_id = t2.id ${v2Where}
        ORDER BY s.created_at DESC
      `, v2Params);
      v2Rows = v2Data.rows;
    } catch { /* V2 tables may not exist */ }

    // Merge, sort by created_at desc, paginate
    const total = parseInt(v1Count.rows[0].total, 10) + v2Total;
    const merged = [...v1Data.rows, ...v2Rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const data = merged.slice(offset, offset + limit);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Update domain status
   */
  async updateDomainStatus(domainId, newStatus, adminWallet) {
    const validStatuses = ['active', 'suspended', 'expired'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Get current domain
    const current = await query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (current.rows.length === 0) {
      throw new Error('Domain not found');
    }

    const oldStatus = current.rows[0].status;

    // Update status
    await query(
      'UPDATE domains SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, domainId]
    );

    // Log action
    await this.logAdminAction('domain_status_changed', 'domain', domainId, adminWallet, {
      fqdn: current.rows[0].fqdn,
      oldStatus,
      newStatus
    });

    return { success: true, oldStatus, newStatus };
  }

  /**
   * List all TLDs (including inactive) with pricing info
   */
  async listAllTLDs() {
    // V1 TLDs
    const v1Result = await query(`
      SELECT t.*, 'v1' AS version,
        (SELECT COUNT(*) FROM domains d WHERE d.tld_id = t.id) as domain_count
      FROM tlds t
      ORDER BY t.display_order ASC, t.name ASC
    `);

    // V2 TLDs
    let v2Rows = [];
    try {
      const v2Result = await query(`
        SELECT t.id, t.label AS name, t.registration_enabled AS is_active, t.owner_address,
          t.is_official, t.display_name, t.description, t.logo_url AS icon_url,
          t.created_at, t.updated_at, 'v2' AS version,
          (SELECT COUNT(*) FROM slds_v2 s WHERE s.tld_id = t.id AND s.expiry_time > NOW()) as domain_count
        FROM tlds_v2 t
        ORDER BY t.label ASC
      `);
      v2Rows = v2Result.rows;
    } catch { /* V2 tables may not exist */ }

    return [...v1Result.rows, ...v2Rows];
  }

  /**
   * Get a single TLD by ID or name
   */
  async getTLD(idOrName) {
    const isId = !isNaN(parseInt(idOrName, 10));
    // Try V1 first
    const result = await query(
      isId
        ? 'SELECT t.*, (SELECT COUNT(*) FROM domains d WHERE d.tld_id = t.id) as domain_count FROM tlds t WHERE t.id = $1'
        : 'SELECT t.*, (SELECT COUNT(*) FROM domains d WHERE d.tld_id = t.id) as domain_count FROM tlds t WHERE t.name = $1',
      [isId ? parseInt(idOrName, 10) : idOrName.toLowerCase()]
    );
    if (result.rows[0]) return { ...result.rows[0], version: 'v1' };

    // Fallback to V2
    try {
      const v2Result = await query(
        isId
          ? `SELECT t.*, (SELECT COUNT(*) FROM slds_v2 s WHERE s.tld_id = t.id AND s.expiry_time > NOW()) as domain_count FROM tlds_v2 t WHERE t.id = $1`
          : `SELECT t.*, (SELECT COUNT(*) FROM slds_v2 s WHERE s.tld_id = t.id AND s.expiry_time > NOW()) as domain_count FROM tlds_v2 t WHERE t.label = $1`,
        [isId ? parseInt(idOrName, 10) : idOrName.toLowerCase()]
      );
      if (v2Result.rows[0]) return { ...v2Result.rows[0], name: v2Result.rows[0].label, version: 'v2' };
    } catch { /* V2 tables may not exist */ }

    return null;
  }

  /**
   * Calculate price for a subdomain on a specific TLD
   */
  async calculateTLDPrice(tldName, subdomain, flrPriceUSD = 0.05) {
    const tld = await this.getTLD(tldName);
    if (!tld) {
      throw new Error(`TLD ${tldName} not found`);
    }

    const length = subdomain.length;
    let tier, multiplier;

    if (length === 1) {
      tier = 'ultra_premium';
      multiplier = parseFloat(tld.price_multiplier_ultra) || 50;
    } else if (length === 2) {
      tier = 'premium';
      multiplier = parseFloat(tld.price_multiplier_premium) || 20;
    } else if (length === 3) {
      tier = 'standard_plus';
      multiplier = parseFloat(tld.price_multiplier_standard_plus) || 8;
    } else {
      tier = 'standard';
      multiplier = 1;
    }

    const basePriceUSD = parseFloat(tld.base_price_usd) || 10;
    const priceUSD = basePriceUSD * multiplier;
    const priceFLR = flrPriceUSD > 0 ? priceUSD / flrPriceUSD : priceUSD * 20; // fallback

    return {
      tier,
      priceUSD: Math.round(priceUSD * 100) / 100,
      priceFLR: Math.round(priceFLR * 100) / 100,
      basePriceUSD,
      multiplier,
      tldName: tld.name,
    };
  }

  /**
   * Sync TLDs from HNS wallet to database
   * Scans the wallet for owned TLDs and adds any new ones
   */
  async syncTLDsFromWallet(adminWallet) {
    // Get owned TLDs from HNS wallet
    const ownedResult = await hnsService.getOwnedTLDs();

    if (!ownedResult.success) {
      throw new Error(`Failed to scan HNS wallet: ${ownedResult.error}`);
    }

    const ownedTLDs = ownedResult.tlds;
    const added = [];
    const existing = [];
    const failed = [];

    for (const tld of ownedTLDs) {
      const normalizedName = tld.name.toLowerCase().trim();

      try {
        // Check if TLD already exists in database
        const existingTLD = await query('SELECT id, name FROM tlds WHERE name = $1', [normalizedName]);

        if (existingTLD.rows.length > 0) {
          existing.push(normalizedName);
          continue;
        }

        // Create new TLD
        const result = await query(
          'INSERT INTO tlds (name, is_active) VALUES ($1, true) RETURNING *',
          [normalizedName]
        );

        // Create PowerDNS zone for the new TLD
        try {
          await pdnsService.ensureZone(normalizedName);
        } catch (dnsErr) {
          console.error(`Failed to create DNS zone for ${normalizedName}:`, dnsErr.message);
        }

        added.push({
          id: result.rows[0].id,
          name: normalizedName,
          state: tld.state,
          height: tld.height,
        });

        // Log action
        await this.logAdminAction('tld_synced', 'tld', result.rows[0].id, adminWallet, {
          name: normalizedName,
          source: 'hns_wallet_sync',
          hnsState: tld.state,
        });
      } catch (error) {
        console.error(`Failed to sync TLD ${normalizedName}:`, error.message);
        failed.push({ name: normalizedName, error: error.message });
      }
    }

    return {
      success: true,
      scanned: ownedTLDs.length,
      added,
      existing,
      failed,
      message: added.length > 0
        ? `Added ${added.length} new TLD(s)`
        : 'No new TLDs found',
    };
  }

  /**
   * Create a new TLD with optional pricing config
   */
  async createTLD(name, adminWallet, options = {}) {
    const normalizedName = name.toLowerCase().trim();

    // Validate name
    if (!/^[a-z0-9]+$/.test(normalizedName)) {
      throw new Error('TLD name must contain only lowercase letters and numbers');
    }

    // Check if exists
    const existing = await query('SELECT id FROM tlds WHERE name = $1', [normalizedName]);
    if (existing.rows.length > 0) {
      throw new Error('TLD already exists');
    }

    const {
      description = null,
      icon_url = null,
      base_price_usd = 10.00,
      price_multiplier_ultra = 50.00,
      price_multiplier_premium = 20.00,
      price_multiplier_standard_plus = 8.00,
      renewal_price_multiplier = 0.80,
      display_order = 100,
      featured = false,
      registration_open = true,
    } = options;

    // Create TLD with pricing
    const result = await query(
      `INSERT INTO tlds (
        name, is_active, registration_open, description, icon_url,
        base_price_usd, price_multiplier_ultra, price_multiplier_premium,
        price_multiplier_standard_plus, renewal_price_multiplier,
        display_order, featured, updated_at
      ) VALUES ($1, true, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *`,
      [
        normalizedName, registration_open, description, icon_url,
        base_price_usd, price_multiplier_ultra, price_multiplier_premium,
        price_multiplier_standard_plus, renewal_price_multiplier,
        display_order, featured
      ]
    );

    // Create PowerDNS zone for the new TLD
    try {
      await pdnsService.ensureZone(normalizedName);
    } catch (dnsErr) {
      console.error(`Failed to create DNS zone for ${normalizedName}:`, dnsErr.message);
    }

    // Log action
    await this.logAdminAction('tld_created', 'tld', result.rows[0].id, adminWallet, {
      name: normalizedName,
      base_price_usd,
    });

    return result.rows[0];
  }

  /**
   * Update TLD settings and pricing
   */
  async updateTLD(tldId, updates, adminWallet) {
    const current = await query('SELECT * FROM tlds WHERE id = $1', [tldId]);
    if (current.rows.length === 0) {
      throw new Error('TLD not found');
    }

    const allowedFields = [
      'is_active', 'registration_open', 'description', 'icon_url',
      'base_price_usd', 'price_multiplier_ultra', 'price_multiplier_premium',
      'price_multiplier_standard_plus', 'renewal_price_multiplier',
      'display_order', 'featured'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return { success: true, message: 'No changes' };
    }

    // Add updated_at
    setClauses.push(`updated_at = NOW()`);

    // Add tldId as last parameter
    values.push(tldId);

    await query(
      `UPDATE tlds SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Log action with changes
    const changes = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined && updates[field] !== current.rows[0][field]) {
        changes[field] = { from: current.rows[0][field], to: updates[field] };
      }
    }

    await this.logAdminAction('tld_updated', 'tld', tldId, adminWallet, {
      name: current.rows[0].name,
      changes,
    });

    // Get updated TLD
    const updated = await query('SELECT * FROM tlds WHERE id = $1', [tldId]);
    return { success: true, tld: updated.rows[0] };
  }

  /**
   * Get audit log with pagination and filters
   */
  async getAuditLog({ page = 1, limit = 50, action = '', entityType = '', startDate = '', endDate = '' }) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex}`);
      params.push(entityType);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query(`SELECT COUNT(*) as total FROM audit_log ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const dataParams = [...params, limit, offset];
    const dataResult = await query(`
      SELECT * FROM audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, dataParams);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Export audit log as CSV
   */
  async exportAuditLog(filters) {
    const { data } = await this.getAuditLog({ ...filters, limit: 10000 });

    const headers = ['ID', 'Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Actor Wallet', 'Details'];
    const rows = data.map(row => [
      row.id,
      row.created_at,
      row.action,
      row.entity_type,
      row.entity_id,
      row.actor_wallet || '',
      JSON.stringify(row.details || {})
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Get reserved words
   */
  async getReservedWords() {
    const result = await query('SELECT * FROM reserved_words ORDER BY word');
    return result.rows;
  }

  /**
   * Add reserved word
   */
  async addReservedWord(word, reason, adminWallet) {
    const normalizedWord = word.toLowerCase().trim();

    // Check if exists
    const existing = await query('SELECT id FROM reserved_words WHERE word = $1', [normalizedWord]);
    if (existing.rows.length > 0) {
      throw new Error('Word is already reserved');
    }

    const result = await query(
      'INSERT INTO reserved_words (word, reason, added_by) VALUES ($1, $2, $3) RETURNING *',
      [normalizedWord, reason, adminWallet]
    );

    await this.logAdminAction('reserved_word_added', 'reserved_word', result.rows[0].id, adminWallet, {
      word: normalizedWord,
      reason
    });

    return result.rows[0];
  }

  /**
   * Remove reserved word
   */
  async removeReservedWord(word, adminWallet) {
    const normalizedWord = word.toLowerCase().trim();

    const existing = await query('SELECT * FROM reserved_words WHERE word = $1', [normalizedWord]);
    if (existing.rows.length === 0) {
      throw new Error('Word is not reserved');
    }

    await query('DELETE FROM reserved_words WHERE word = $1', [normalizedWord]);

    await this.logAdminAction('reserved_word_removed', 'reserved_word', existing.rows[0].id, adminWallet, {
      word: normalizedWord
    });

    return { success: true };
  }

  /**
   * Get price comparison (FTSO vs on-chain)
   */
  async getPriceComparison() {
    const priceSyncStatus = priceSync.getStatus();
    let ftsoPrice = null;

    try {
      ftsoPrice = await ftsoService.getFLRPrice();
    } catch (e) {
      ftsoPrice = { error: e.message };
    }

    return {
      ftso: ftsoPrice,
      onChain: {
        price: priceSyncStatus.currentOnChainPrice,
        lastUpdate: priceSyncStatus.lastSyncTime
      },
      difference: priceSyncStatus.currentDifference,
      threshold: priceSyncStatus.threshold,
      needsSync: priceSyncStatus.currentDifference >= priceSyncStatus.threshold
    };
  }

  /**
   * Get price sync history
   */
  async getPriceSyncHistory(limit = 100) {
    const result = await query(`
      SELECT * FROM price_sync_history
      ORDER BY synced_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  /**
   * Start HNS node (hsd service)
   */
  async startHNSNode(adminWallet) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      // Try systemctl first, fallback to direct command
      try {
        await execAsync('systemctl start hsd');
      } catch {
        // If systemctl fails, try starting hsd directly
        await execAsync('hsd --daemon');
      }

      // Log the action
      await this.logAdminAction('service_started', 'service', 'hns_node', adminWallet, {});

      // Wait a moment for the service to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if it's now connected
      const status = await hnsService.isReady();

      return {
        success: true,
        message: 'HNS node start command executed',
        connected: status.connected
      };
    } catch (error) {
      console.error('Failed to start HNS node:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop HNS node (hsd service)
   */
  async stopHNSNode(adminWallet) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      // Try systemctl first, fallback to hsd-cli
      try {
        await execAsync('systemctl stop hsd');
      } catch {
        // If systemctl fails, try hsd-cli stop
        await execAsync('hsd-cli stop');
      }

      // Log the action
      await this.logAdminAction('service_stopped', 'service', 'hns_node', adminWallet, {});

      return {
        success: true,
        message: 'HNS node stop command executed'
      };
    } catch (error) {
      console.error('Failed to stop HNS node:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get HNS wallet info
   */
  async getHNSWalletInfo() {
    try {
      const [walletInfo, ownedTLDs] = await Promise.all([
        hnsService.getWalletInfo(),
        hnsService.getOwnedTLDs()
      ]);

      return {
        address: walletInfo.address || 'N/A',
        balance: walletInfo.balance || '0',
        unconfirmed: walletInfo.unconfirmed || '0',
        txCount: walletInfo.txCount || 0,
        ownedTLDs: ownedTLDs.tlds || []
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  /**
   * Get FLR (Flare) wallet info
   */
  async getFLRWalletInfo() {
    try {
      if (!config.flare?.privateKey) {
        return { error: 'Backend wallet not configured' };
      }

      const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
      const wallet = new ethers.Wallet(config.flare.privateKey, provider);

      const [balance, network] = await Promise.all([
        provider.getBalance(wallet.address),
        provider.getNetwork()
      ]);

      // Convert from wei to FLR (18 decimals)
      const balanceFLR = ethers.formatEther(balance);

      return {
        address: wallet.address,
        balance: parseFloat(balanceFLR).toFixed(4),
        network: network.name || `Chain ${network.chainId}`,
        chainId: Number(network.chainId)
      };
    } catch (e) {
      console.error('getFLRWalletInfo error:', e.message);
      return { error: e.message };
    }
  }

  /**
   * Get all system addresses (wallets and contracts)
   */
  async getSystemAddresses() {
    try {
      const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);

      // Get backend wallet address
      let backendWallet = null;
      if (config.flare?.privateKey) {
        const wallet = new ethers.Wallet(config.flare.privateKey, provider);
        const balance = await provider.getBalance(wallet.address);
        backendWallet = {
          address: wallet.address,
          balance: parseFloat(ethers.formatEther(balance)).toFixed(4)
        };
      }

      // Get platform wallet balance
      let platformWallet = null;
      if (config.platformWallet) {
        const balance = await provider.getBalance(config.platformWallet);
        platformWallet = {
          address: config.platformWallet,
          balance: parseFloat(ethers.formatEther(balance)).toFixed(4)
        };
      }

      return {
        wallets: {
          backend: backendWallet,
          platform: platformWallet
        },
        contracts: {
          nft: config.contracts?.nft || null,
          escrow: config.contracts?.escrow || null,
          dnsOracle: config.contracts?.dnsOracle || null,
          priceOracle: config.contracts?.priceOracle || null
        }
      };
    } catch (e) {
      console.error('getSystemAddresses error:', e.message);
      return { error: e.message };
    }
  }

  /**
   * Get pending purchases
   */
  async getPendingPurchases() {
    const result = await query(`
      SELECT * FROM pending_purchases
      WHERE status NOT IN ('completed', 'refunded')
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  /**
   * Get contract listener statistics
   */
  async getListenerStats() {
    const [processedEvents, recentEvents] = await Promise.all([
      query(`
        SELECT event_type, COUNT(*) as count
        FROM processed_events
        GROUP BY event_type
      `),
      query(`
        SELECT * FROM processed_events
        ORDER BY processed_at DESC
        LIMIT 10
      `)
    ]);

    return {
      eventCounts: processedEvents.rows.reduce((acc, row) => {
        acc[row.event_type] = parseInt(row.count, 10);
        return acc;
      }, {}),
      recentEvents: recentEvents.rows,
      ...contractListener.getStatus()
    };
  }

  /**
   * Log admin action to audit log
   */
  async logAdminAction(action, entityType, entityId, adminWallet, details = {}) {
    try {
      await query(`
        INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
        VALUES ($1, $2, $3, $4, $5)
      `, [action, entityType, String(entityId), adminWallet, JSON.stringify(details)]);
    } catch (e) {
      console.error('Failed to log admin action:', e.message);
    }
  }

  /**
   * Get all feature flags
   */
  async getFeatureFlags() {
    const result = await query('SELECT key, value, updated_at FROM system_settings');
    const flags = {};

    for (const row of result.rows) {
      flags[row.key] = {
        enabled: row.value === 'true',
        updatedAt: row.updated_at,
      };
    }

    // Include defaults for missing flags
    const defaults = {
      bulk_registration_enabled: true,
    };

    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (!flags[key]) {
        flags[key] = { enabled: defaultValue, updatedAt: null };
      }
    }

    return flags;
  }

  /**
   * Set a feature flag
   */
  async setFeatureFlag(key, enabled, adminWallet) {
    const allowedFlags = ['bulk_registration_enabled'];

    if (!allowedFlags.includes(key)) {
      throw new Error(`Unknown feature flag: ${key}`);
    }

    const value = enabled ? 'true' : 'false';

    // Upsert the setting
    await query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = $2, updated_at = NOW()
    `, [key, value]);

    // Log action
    await this.logAdminAction('feature_flag_updated', 'system_settings', key, adminWallet, {
      key,
      enabled,
    });

    return { key, enabled, updatedAt: new Date().toISOString() };
  }
}

export const adminService = new AdminService();
export default adminService;
