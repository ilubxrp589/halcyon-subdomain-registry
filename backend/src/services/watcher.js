/**
 * Watcher Service
 * Monitors HNS propagation, DNS resolution, and system health
 * Adaptive timing: 15min for 2hrs → 10min for 30min → 5min until found
 */

import { query } from '../db/index.js';
import hnsService from './hns.js';
import pdnsService from './pdns.js';
import dns from 'dns';
import { exec } from 'child_process';

// HNS resolvers - local checks are authoritative, external are informational
const HNS_RESOLVERS = [
  // Authoritative (required for propagated status)
  { name: 'Local HNS', ip: '127.0.0.1', port: 5349, isLocal: true, required: true },
  { name: 'Local PDNS', ip: '192.0.2.39:5300', isPDNS: true, required: true },
  // External (informational only, uses TCP due to UDP issues)
  { name: 'Public Resolver (Unbound)', ip: '192.0.2.67', isDNS: true, required: false },
  { name: 'HDNS.io', ip: '103.196.38.38', useTcp: true, required: false },
];

// Timing schedule (in ms)
const SCHEDULE = {
  PHASE_1: { duration: 2 * 60 * 60 * 1000, interval: 15 * 60 * 1000 },  // 2 hours @ 15 min
  PHASE_2: { duration: 30 * 60 * 1000, interval: 10 * 60 * 1000 },       // 30 min @ 10 min
  PHASE_3: { interval: 5 * 60 * 1000 },                                   // Until found @ 5 min
};

class WatcherService {
  constructor() {
    this.isRunning = false;
    this.timeout = null;
    this.startTime = null;
    this.propagatedTlds = new Set();
    this.activeTlds = []; // Track all active TLDs to monitor
    this.status = {
      lastCheck: null,
      startedAt: null,
      elapsedTime: null,
      currentPhase: null,
      nextCheckIn: null,
      hnsNode: null,
      nsPropagation: {},
      pendingTx: [],
      dnsHealth: null,
    };
    this.listeners = [];
  }

  /**
   * Get current interval based on elapsed time
   */
  getCurrentInterval() {
    if (!this.startTime) return SCHEDULE.PHASE_1.interval;

    const elapsed = Date.now() - this.startTime;

    if (elapsed < SCHEDULE.PHASE_1.duration) {
      this.status.currentPhase = 'Phase 1 (every 15 min)';
      return SCHEDULE.PHASE_1.interval;
    } else if (elapsed < SCHEDULE.PHASE_1.duration + SCHEDULE.PHASE_2.duration) {
      this.status.currentPhase = 'Phase 2 (every 10 min)';
      return SCHEDULE.PHASE_2.interval;
    } else {
      this.status.currentPhase = 'Phase 3 (every 5 min)';
      return SCHEDULE.PHASE_3.interval;
    }
  }

  /**
   * Format elapsed time
   */
  formatElapsed(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  /**
   * Start the watcher
   */
  start() {
    if (this.isRunning) return;

    this.startTime = Date.now();
    this.status.startedAt = new Date().toISOString();
    this.isRunning = true;

    console.log('🔍 Watcher service started');
    console.log(`   Schedule: 15min × 2hrs → 10min × 30min → 5min until propagated`);

    // Run immediately
    this.check();
  }

  /**
   * Schedule next check
   */
  scheduleNext() {
    if (!this.isRunning) return;

    const interval = this.getCurrentInterval();
    this.status.nextCheckIn = new Date(Date.now() + interval).toISOString();

    console.log(`   Next check in ${interval / 60000} minutes`);

    this.timeout = setTimeout(() => this.check(), interval);
  }

  /**
   * Stop the watcher
   */
  stop() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.isRunning = false;
    console.log('🔍 Watcher service stopped');
  }

  /**
   * Add a status listener
   */
  onStatus(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notify all listeners
   */
  notify(event, data) {
    this.listeners.forEach(l => {
      try {
        l(event, data);
      } catch (e) {
        console.error('Watcher listener error:', e);
      }
    });
  }

  /**
   * Run all checks
   */
  async check() {
    const now = Date.now();
    this.status.lastCheck = new Date().toISOString();
    this.status.elapsedTime = this.formatElapsed(now - this.startTime);

    console.log(`\n🔍 [${new Date().toLocaleTimeString()}] Watcher check (${this.status.elapsedTime} elapsed)`);

    try {
      // Check HNS node status
      await this.checkHnsNode();

      // Check NS propagation to HNS resolvers
      await this.checkNsPropagation();

      // Check pending transactions
      await this.checkPendingTransactions();

      // Check local DNS health
      await this.checkDnsHealth();

      // Print summary
      this.printSummary();

      // Notify listeners
      this.notify('status', this.status);

    } catch (error) {
      console.error('   ✗ Watcher check error:', error.message);
      this.notify('error', error.message);
    }

    // Schedule next check if not all propagated
    if (!this.allPropagated()) {
      this.scheduleNext();
    } else {
      console.log('\n🎉 All TLDs propagated! Watcher complete.');
      this.stop();
    }
  }

  /**
   * Check if all TLDs are propagated
   * Must check ALL active TLDs, not just ones in nsPropagation
   */
  allPropagated() {
    // Must have active TLDs to monitor
    if (this.activeTlds.length === 0) {
      return false;
    }

    // Check that ALL active TLDs are in nsPropagation and are propagated
    for (const tld of this.activeTlds) {
      const data = this.status.nsPropagation[tld];
      // If TLD hasn't been checked yet, not all propagated
      if (!data) {
        return false;
      }
      // If TLD is not fully propagated, not all propagated
      if (!data.allPropagated) {
        return false;
      }
    }

    return true;
  }

  /**
   * Print status summary
   */
  printSummary() {
    console.log(`   Phase: ${this.status.currentPhase}`);

    for (const [tld, data] of Object.entries(this.status.nsPropagation)) {
      const resolvers = Object.entries(data.resolvers);
      const propagated = resolvers.filter(([_, r]) => r.status === 'propagated').length;

      if (data.allPropagated) {
        console.log(`   ✓ ${tld}: Fully propagated! (${propagated}/${resolvers.length})`);
      } else {
        console.log(`   ◐ ${tld}: ${propagated}/${resolvers.length} resolvers`);
        resolvers.forEach(([name, r]) => {
          const icon = r.status === 'propagated' ? '✓' : r.status === 'error' ? '✗' : '○';
          console.log(`      ${icon} ${name}: ${r.status}${r.ip ? ` (${r.ip})` : ''}`);
        });
      }
    }
  }

  /**
   * Check HNS node status
   */
  async checkHnsNode() {
    const status = await hnsService.isReady();
    this.status.hnsNode = {
      connected: status.connected,
      synced: status.synced,
      height: status.height,
      progress: status.progress,
    };
  }

  /**
   * Check NS propagation to HNS resolvers
   */
  async checkNsPropagation() {
    const tlds = await this.getActiveTlds();

    // Update the active TLDs list for allPropagated() check
    this.activeTlds = tlds;

    for (const tld of tlds) {
      // Skip already propagated
      if (this.propagatedTlds.has(tld)) {
        continue;
      }

      const wasAllPropagated = this.status.nsPropagation[tld]?.allPropagated || false;

      this.status.nsPropagation[tld] = {
        resolvers: {},
        allPropagated: true,
      };

      for (const resolver of HNS_RESOLVERS) {
        try {
          const result = await this.queryResolver(resolver, `ns1.${tld}`);
          this.status.nsPropagation[tld].resolvers[resolver.name] = {
            status: result ? 'propagated' : 'pending',
            ip: result === '0.0.0.1' ? 'configured (no glue)' : result,
            lastCheck: new Date().toISOString(),
            required: resolver.required !== false, // Default to required if not specified
          };

          // Only required resolvers affect allPropagated status
          if (!result && resolver.required !== false) {
            this.status.nsPropagation[tld].allPropagated = false;
          }
        } catch (error) {
          this.status.nsPropagation[tld].resolvers[resolver.name] = {
            status: 'error',
            error: error.message,
            lastCheck: new Date().toISOString(),
            required: resolver.required !== false,
          };
          // Only required resolvers affect allPropagated status
          if (resolver.required !== false) {
            this.status.nsPropagation[tld].allPropagated = false;
          }
        }
      }

      // Check if newly propagated
      if (this.status.nsPropagation[tld].allPropagated && !wasAllPropagated) {
        console.log(`\n   🎉 ${tld} is now FULLY PROPAGATED!`);
        this.propagatedTlds.add(tld);
        this.notify('propagated', { tld, elapsedTime: this.status.elapsedTime });
      }
    }
  }

  /**
   * Query a specific DNS resolver
   * For local HNS node, uses RPC instead of DNS
   */
  async queryResolver(resolverConfig, hostname) {
    const { ip: resolverIp, port, isLocal } = typeof resolverConfig === 'string'
      ? { ip: resolverConfig, port: 53, isLocal: false }
      : resolverConfig;

    // For local HNS node, use RPC to check name resource
    if (isLocal) {
      try {
        // Extract TLD from hostname (e.g., ns1.cryptofans -> cryptofans)
        const tld = hostname.split('.').pop();
        const result = await hnsService.getNameResource(tld);

        // hnsService.getNameResource returns { success, data: { records: [...] } }
        if (result && result.success && result.data && result.data.records) {
          const records = result.data.records;

          // GLUE4 records have trailing dots (e.g., "ns1.cryptofans.")
          const hostnameWithDot = hostname.endsWith('.') ? hostname : `${hostname}.`;

          // Look for GLUE4 record matching the hostname
          const glueRecord = records.find(r =>
            r.type === 'GLUE4' && r.ns === hostnameWithDot
          );
          if (glueRecord && glueRecord.address) {
            return glueRecord.address;
          }
          // Also check if NS record exists
          const nsRecord = records.find(r =>
            r.type === 'NS' && r.ns === hostnameWithDot
          );
          if (nsRecord) {
            // NS exists, return a marker IP to indicate configured
            return '0.0.0.1'; // Marker: NS exists but no glue
          }
        }
        return null;
      } catch (error) {
        console.error(`   Local HNS RPC error for ${hostname}:`, error.message);
        return null;
      }
    }

    // For PDNS, check if zone is being served (query SOA for TLD)
    if (resolverConfig.isPDNS) {
      return new Promise((resolve) => {
        const resolver = new dns.Resolver();
        resolver.setServers([resolverIp]);

        const timeout = setTimeout(() => {
          resolve(null);
        }, 5000);

        // Extract TLD from hostname (e.g., ns1.cryptofans -> cryptofans)
        const tld = hostname.split('.').pop();

        // Query SOA record to verify zone is being served
        resolver.resolveSoa(tld, (err, soa) => {
          clearTimeout(timeout);
          if (err || !soa) {
            resolve(null);
          } else {
            // SOA exists - zone is being served, return the primary NS
            resolve(soa.nsname || 'zone-active');
          }
        });
      });
    }

    // For remote resolvers with TCP flag, use dig command
    if (resolverConfig.useTcp) {
      return new Promise((resolve) => {
        const tld = hostname.split('.').pop();

        exec(`dig @${resolverIp} +tcp +time=5 +tries=1 ${tld} NS +short`, { timeout: 10000 }, (err, stdout) => {
          if (err || !stdout.trim()) {
            resolve(null);
          } else {
            // Return first NS record
            const ns = stdout.trim().split('\n')[0];
            resolve(ns || null);
          }
        });
      });
    }

    // For remote resolvers (UDP), use Node's dns module
    return new Promise((resolve) => {
      const resolver = new dns.Resolver();
      resolver.setServers([resolverIp]);

      const timeout = setTimeout(() => {
        resolve(null);
      }, 5000);

      resolver.resolve4(hostname, (err, addresses) => {
        clearTimeout(timeout);
        if (err) {
          resolve(null);
        } else {
          resolve(addresses[0] || null);
        }
      });
    });
  }

  /**
   * Get active TLDs from database
   */
  async getActiveTlds() {
    try {
      const v1Result = await query('SELECT name FROM tlds WHERE is_active = true');
      const names = v1Result.rows.map(r => r.name);
      try {
        const v2Result = await query('SELECT label AS name FROM tlds_v2 WHERE registration_enabled = true');
        for (const r of v2Result.rows) {
          if (!names.includes(r.name)) names.push(r.name);
        }
      } catch { /* V2 table may not exist */ }
      return names;
    } catch (error) {
      console.error('   ⚠ Failed to fetch active TLDs:', error.message);
      return [];
    }
  }

  /**
   * Check pending HNS transactions
   */
  async checkPendingTransactions() {
    try {
      const result = await query(`
        SELECT * FROM pending_purchases
        WHERE status = 'pending'
        ORDER BY created_at DESC
        LIMIT 20
      `);

      this.status.pendingTx = result.rows.map(row => ({
        id: row.id,
        subdomain: row.fqdn,
        wallet: row.wallet_address,
        createdAt: row.created_at,
        age: Date.now() - new Date(row.created_at).getTime(),
      }));
    } catch (error) {
      // Ignore DB errors for pending check
    }
  }

  /**
   * Check local DNS health
   */
  async checkDnsHealth() {
    const pdnsHealth = await pdnsService.healthCheck();

    let testResolution = false;
    try {
      // Test PDNS by querying SOA for first active TLD
      const activeTlds = await this.getActiveTlds();
      const testTld = activeTlds[0] || 'cryptofans';

      // Query local PDNS (192.0.2.39) for SOA record
      const result = await this.queryResolver(
        { ip: '192.0.2.39:5300', isPDNS: true },
        `ns1.${testTld}`
      );
      testResolution = !!result; // SOA exists = working
    } catch {
      testResolution = false;
    }

    this.status.dnsHealth = {
      pdnsApi: pdnsHealth.success ? 'healthy' : 'unhealthy',
      localResolution: testResolution ? 'working' : 'failed',
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      ...this.status,
      isRunning: this.isRunning,
      activeTlds: this.activeTlds,
      propagationSummary: this.getPropagationSummary(),
    };
  }

  /**
   * Get propagation summary
   */
  getPropagationSummary() {
    const summary = {};

    for (const [tld, data] of Object.entries(this.status.nsPropagation)) {
      const resolvers = Object.entries(data.resolvers);
      const requiredResolvers = resolvers.filter(([_, r]) => r.required !== false);
      const optionalResolvers = resolvers.filter(([_, r]) => r.required === false);

      const requiredPropagated = requiredResolvers.filter(([_, r]) => r.status === 'propagated').length;
      const optionalPropagated = optionalResolvers.filter(([_, r]) => r.status === 'propagated').length;

      summary[tld] = {
        propagated: requiredPropagated,
        total: requiredResolvers.length,
        percentage: requiredResolvers.length > 0
          ? Math.round((requiredPropagated / requiredResolvers.length) * 100)
          : 100,
        allPropagated: data.allPropagated,
        // Additional info about external resolvers
        external: {
          propagated: optionalPropagated,
          total: optionalResolvers.length,
        },
      };
    }

    return summary;
  }
}

export const watcherService = new WatcherService();
export { watcherService as watcher };
export default watcherService;
