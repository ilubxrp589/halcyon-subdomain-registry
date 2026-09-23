/**
 * Zone Sync Watcher — agent-dns-003
 *
 * Every 5 minutes:
 * 1. Query active TLDs from DB
 * 2. For each TLD: parse zone file, query DB for expected records, compare
 * 3. Report drift (DB records missing from zone, or stale orphans in zone)
 * 4. Discord alert after 3 consecutive drift detections for same TLD
 *
 * Zone dir: /home/localai/volume-resolver-data/auth_zones/
 */

import { readFile, readdir } from 'fs/promises';
import path from 'path';
import config from './config.js';
import { query } from './db.js';
import { sendAlert } from './discord.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('dns-zone-sync');
const zc = config.zoneSync;

class ZoneSyncWatcher {
  constructor() {
    this.timer = null;
    this.running = false;
    this.lastSync = null;
  }

  start() {
    if (this.timer) return;
    log.info({ intervalMs: zc.intervalMs, zoneDir: config.zoneDir }, 'Zone sync watcher starting');
    this.timer = setInterval(() => this.runCycle(), zc.intervalMs);
    this.runCycle();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('Zone sync watcher stopped');
  }

  isRunning() {
    return this.timer !== null;
  }

  getStatus() {
    return {
      running: this.isRunning(),
      lastSync: this.lastSync,
    };
  }

  async runCycle() {
    if (this.running) return;
    this.running = true;
    const start = Date.now();

    try {
      // Get active TLDs from DB (V1 + V2)
      const { rows: tlds } = await query('SELECT name FROM tlds WHERE is_active = true');
      let tldsV2 = [];
      try {
        const v2Result = await query('SELECT label AS name FROM tlds_v2 WHERE registration_enabled = true');
        tldsV2 = v2Result.rows;
      } catch (err) { log.warn({ err }, 'Failed to query V2 TLDs'); }
      // Also include zone files that exist on disk (catch zones not in DB yet)
      const zoneFiles = await this.listZoneFiles();

      // Merge: check all TLDs that have either DB entry or zone file
      const allTlds = new Set([...tlds.map(t => t.name), ...tldsV2.map(t => t.name), ...zoneFiles]);
      const results = [];

      for (const tld of allTlds) {
        try {
          const result = await this.checkTld(tld);
          results.push(result);
        } catch (err) {
          log.warn({ err, tld }, 'Failed to check TLD sync');
        }
      }

      this.lastSync = {
        timestamp: new Date().toISOString(),
        tldsChecked: results.length,
        driftsDetected: results.filter(r => r.hasDrift).length,
        elapsed: Date.now() - start,
      };

      log.info(this.lastSync, 'Zone sync cycle complete');
    } catch (err) {
      log.error({ err }, 'Zone sync cycle error');
    } finally {
      this.running = false;
    }
  }

  /** List zone files in the auth_zones directory */
  async listZoneFiles() {
    try {
      const entries = await readdir(config.zoneDir);
      // Filter out non-zone entries (no dots, no CLAUDE.md, no hidden files)
      return entries.filter(e => !e.startsWith('.') && !e.includes('.') && e !== 'CLAUDE' && e.toLowerCase() !== 'claude.md');
    } catch (err) {
      log.warn({ err, dir: config.zoneDir }, 'Failed to list zone directory');
      return [];
    }
  }

  /**
   * Check a single TLD: compare zone file records against DB registrations
   */
  async checkTld(tld) {
    // Parse zone file
    const zoneRecords = await this.parseZoneFile(tld);

    // Get registered subdomains from DB
    const dbRecords = await this.getDbSubdomains(tld);

    // Compare
    const missingFromZone = []; // In DB but not in zone
    const orphanedInZone = []; // In zone but not in DB

    // Check each DB record is in the zone
    for (const dbRec of dbRecords) {
      const label = dbRec.subdomain;
      if (!zoneRecords.has(label)) {
        missingFromZone.push(label);
      }
    }

    // Check each zone record is in the DB (exclude infrastructure records like ns1, ns2, @)
    const infraLabels = new Set(['@', 'ns1', 'ns2', 'ns3']);
    for (const [label] of zoneRecords) {
      if (infraLabels.has(label)) continue;
      if (!dbRecords.some(r => r.subdomain === label)) {
        orphanedInZone.push(label);
      }
    }

    const hasDrift = missingFromZone.length > 0 || orphanedInZone.length > 0;

    // Update sync status in DB
    await this.updateSyncStatus(tld, {
      zoneRecordCount: zoneRecords.size,
      dbRecordCount: dbRecords.length,
      missingFromZone: missingFromZone.length,
      orphanedInZone: orphanedInZone.length,
      hasDrift,
    });

    // Log event if drift detected
    if (hasDrift) {
      await this.logZoneEvent(tld, 'drift_detected', {
        missing_from_zone: missingFromZone,
        orphaned_in_zone: orphanedInZone,
      });
    }

    return { tld, hasDrift, missingFromZone, orphanedInZone, zoneRecords: zoneRecords.size, dbRecords: dbRecords.length };
  }

  /**
   * Parse a BIND zone file and extract subdomain labels with their record types.
   * Returns a Map<label, [{type, value}]>
   */
  async parseZoneFile(tld) {
    const records = new Map();
    const filePath = path.join(config.zoneDir, tld);

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        // Skip empty, comments, SOA continuation, directives
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('$') || trimmed.startsWith(')')) continue;

        // Match zone record lines: label [TTL] [class] type value
        // Examples:
        //   keeper IN A 10.0.0.39
        //   jimmy IN TXT "owner=0x..."
        //   @ IN NS ns1.cryptofans.
        //   ns1 IN A 10.0.0.39
        const match = trimmed.match(/^(\S+)\s+(?:\d+\s+)?(?:IN\s+)?(\w+)\s+(.+)/);
        if (!match) continue;

        const [, label, rrtype, value] = match;
        // Skip SOA records
        if (rrtype === 'SOA') continue;

        if (!records.has(label)) {
          records.set(label, []);
        }
        records.get(label).push({ type: rrtype, value: value.trim() });
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        log.debug({ tld }, 'Zone file not found');
      } else {
        log.warn({ err, tld }, 'Failed to parse zone file');
      }
    }

    return records;
  }

  /** Get registered subdomains from the database for a TLD (V1 + V2) */
  async getDbSubdomains(tld) {
    const results = [];

    // V1: domains table
    try {
      const { rows } = await query(
        `SELECT d.subdomain, d.status
         FROM domains d
         JOIN tlds t ON d.tld_id = t.id
         WHERE t.name = $1 AND d.status IN ('active', 'expiring_soon')`,
        [tld],
      );
      results.push(...rows);
    } catch (err) {
      log.warn({ err, tld }, 'Failed to query V1 DB subdomains');
    }

    // V2: slds_v2 table
    try {
      const { rows } = await query(
        `SELECT s.label AS subdomain, 'active' AS status
         FROM slds_v2 s
         JOIN tlds_v2 t ON s.tld_id = t.id
         WHERE t.label = $1 AND s.expiry_time > NOW()`,
        [tld],
      );
      results.push(...rows);
    } catch (err) {
      log.warn({ err, tld }, 'Failed to query V2 DB subdomains');
    }

    return results;
  }

  /** Update dns_zone_sync_status with latest comparison results */
  async updateSyncStatus(tld, { zoneRecordCount, dbRecordCount, missingFromZone, orphanedInZone, hasDrift }) {
    const { rows } = await query(
      `INSERT INTO dns_zone_sync_status (tld, zone_record_count, db_record_count, missing_from_zone, orphaned_in_zone, consecutive_drifts, last_sync_at, last_drift_at, alert_state, updated_at)
       VALUES ($1, $2, $3, $4, $5,
         ${hasDrift ? '1' : '0'},
         NOW(),
         ${hasDrift ? 'NOW()' : 'NULL'},
         'ok', NOW())
       ON CONFLICT (tld) DO UPDATE SET
         zone_record_count = $2,
         db_record_count = $3,
         missing_from_zone = $4,
         orphaned_in_zone = $5,
         consecutive_drifts = CASE WHEN $6 THEN dns_zone_sync_status.consecutive_drifts + 1 ELSE 0 END,
         last_sync_at = NOW(),
         last_drift_at = CASE WHEN $6 THEN NOW() ELSE dns_zone_sync_status.last_drift_at END,
         updated_at = NOW()
       RETURNING consecutive_drifts, alert_state`,
      [tld, zoneRecordCount, dbRecordCount, missingFromZone, orphanedInZone, hasDrift],
    );

    if (rows.length === 0) return;
    const { consecutive_drifts: drifts, alert_state: prevState } = rows[0];

    // Alert on consecutive drifts
    if (hasDrift && drifts >= zc.alertAfterConsecutiveDrifts && prevState !== 'warning') {
      await query('UPDATE dns_zone_sync_status SET alert_state = $1 WHERE tld = $2', ['warning', tld]);
      await sendAlert({
        level: 'warning',
        title: `Zone Sync Drift: ${tld}`,
        description: `${drifts} consecutive sync cycles with drift detected.`,
        fields: [
          { name: 'TLD', value: tld, inline: true },
          { name: 'Missing from Zone', value: String(missingFromZone), inline: true },
          { name: 'Orphaned in Zone', value: String(orphanedInZone), inline: true },
        ],
      });
    } else if (!hasDrift && prevState === 'warning') {
      await query('UPDATE dns_zone_sync_status SET alert_state = $1 WHERE tld = $2', ['ok', tld]);
      await sendAlert({
        level: 'ok',
        title: `Zone Sync Recovered: ${tld}`,
        description: 'Zone and database are now in sync.',
      });
    }
  }

  /** Log a zone event */
  async logZoneEvent(tld, eventType, details) {
    await query(
      'INSERT INTO dns_zone_events (tld, event_type, details) VALUES ($1, $2, $3)',
      [tld, eventType, JSON.stringify(details)],
    );
  }

  /** Cleanup old zone events beyond retention */
  async cleanup() {
    const { rowCount } = await query(
      `DELETE FROM dns_zone_events WHERE created_at < NOW() - INTERVAL '${zc.retentionDays} days'`,
    );
    if (rowCount > 0) {
      log.info({ deleted: rowCount }, 'Cleaned up old zone events');
    }
  }

  /** Query zone sync status for API */
  async queryStatus(tld) {
    if (tld) {
      const { rows } = await query('SELECT * FROM dns_zone_sync_status WHERE tld = $1', [tld]);
      return rows;
    }
    const { rows } = await query('SELECT * FROM dns_zone_sync_status ORDER BY tld');
    return rows;
  }
}

export default ZoneSyncWatcher;
