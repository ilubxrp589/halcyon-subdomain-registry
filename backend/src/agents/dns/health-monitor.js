/**
 * DNS Health Monitor — agent-dns-001
 *
 * Runs 9 health checks every 60 seconds:
 * 1. ICANN resolution (google.com, cloudflare.com)
 * 2. HNS TLD resolution (SOA for active TLDs)
 * 3. Auth zone subdomain (keeper.cryptomusic → 10.0.0.39)
 * 4. ICANN priority (com NS must contain gtld-servers.net)
 * 5. DoH endpoint (JSON API via HTTPS)
 * 6. DoT endpoint (TCP connect to port 853)
 * 7. Container status (docker ps)
 * 8. HSD process (dig on port 5349)
 * 9. dns-json-api (local HTTP)
 *
 * Alerting:
 * - 3 consecutive failures → Discord warning
 * - 10 consecutive failures → Discord critical
 * - Recovery (back to 0 failures) → Discord green
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import net from 'net';
import config from './config.js';
import { query } from './db.js';
import { sendAlert } from './discord.js';
import { createLogger } from '../../utils/logger.js';

const execFileAsync = promisify(execFile);
const log = createLogger('dns-health');
const hc = config.health;

class HealthMonitor {
  constructor() {
    this.timer = null;
    this.running = false;
    this.lastResults = [];
  }

  start() {
    if (this.timer) return;
    log.info({ intervalMs: hc.intervalMs }, 'Health monitor starting');
    this.timer = setInterval(() => this.runCycle(), hc.intervalMs);
    // Run immediately on start
    this.runCycle();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('Health monitor stopped');
  }

  isRunning() {
    return this.timer !== null;
  }

  getStatus() {
    return {
      running: this.isRunning(),
      lastResults: this.lastResults,
    };
  }

  async runCycle() {
    if (this.running) {
      log.debug('Health check cycle already running, skipping');
      return;
    }
    this.running = true;
    const cycleStart = Date.now();

    try {
      const checks = await this.runAllChecks();
      this.lastResults = checks;
      await this.storeResults(checks);
      await this.updateSummaries(checks);

      const failed = checks.filter(c => !c.success);
      const elapsed = Date.now() - cycleStart;
      log.info({ total: checks.length, passed: checks.length - failed.length, failed: failed.length, elapsed }, 'Health check cycle complete');
    } catch (err) {
      log.error({ err }, 'Health check cycle error');
    } finally {
      this.running = false;
    }
  }

  async runAllChecks() {
    const results = [];

    // 1. ICANN resolution
    for (const domain of hc.checks.icannDomains) {
      results.push(await this.checkDig('icann_resolution', domain, 'A'));
    }

    // 2. HNS TLD resolution — query active TLDs from DB (V1 + V2)
    try {
      const { rows: v1Tlds } = await query('SELECT name FROM tlds WHERE is_active = true LIMIT 10');
      let v2Tlds = [];
      try {
        const v2Result = await query('SELECT label AS name FROM tlds_v2 WHERE registration_enabled = true LIMIT 10');
        v2Tlds = v2Result.rows;
      } catch { /* V2 table may not exist yet */ }
      const allTlds = [...v1Tlds, ...v2Tlds];
      const seen = new Set();
      for (const row of allTlds) {
        if (seen.has(row.name)) continue;
        seen.add(row.name);
        results.push(await this.checkDig('hns_tld_resolution', row.name, 'SOA'));
      }
    } catch {
      results.push({ check_type: 'hns_tld_resolution', target: 'db_query', success: false, latency_ms: 0, error_message: 'Failed to query TLDs from database' });
    }

    // 3. Auth zone subdomain
    const sub = hc.checks.authSubdomain;
    results.push(await this.checkDigExpectIP('auth_subdomain', sub.name, sub.expectedIp));

    // 4. ICANN priority
    results.push(await this.checkIcannPriority());

    // 5. DoH endpoint
    results.push(await this.checkHttp('doh_endpoint', hc.checks.dohEndpoint));

    // 6. DoT endpoint (TCP connect)
    results.push(await this.checkTcpConnect('dot_endpoint', hc.checks.dotHost, hc.checks.dotPort));

    // 7. Container status
    results.push(await this.checkContainer('container_status', hc.checks.containerName));

    // 8. HSD process — query root NS; hsd returns _synth NS records proving it's alive
    results.push(await this.checkDig('hsd_process', '.', 'NS', hc.checks.hsdPort));

    // 9. dns-json-api
    results.push(await this.checkHttp('json_api', hc.checks.jsonApiEndpoint));

    return results;
  }

  /** dig @127.0.0.1 <target> <type> with optional port */
  async checkDig(checkType, target, rrtype, port = 53) {
    const start = Date.now();
    try {
      const args = ['@127.0.0.1', `-p${port}`, target, rrtype, '+short', '+time=5', '+tries=1'];
      const { stdout } = await execFileAsync('dig', args, { timeout: (hc.digTimeout + 2) * 1000 });
      const latency = Date.now() - start;
      const answer = stdout.trim();
      if (!answer) {
        return { check_type: checkType, target, success: false, latency_ms: latency, error_message: 'Empty answer' };
      }
      return { check_type: checkType, target, success: true, latency_ms: latency, error_message: null };
    } catch (err) {
      return { check_type: checkType, target, success: false, latency_ms: Date.now() - start, error_message: err.message.substring(0, 500) };
    }
  }

  /** dig and verify the A record matches an expected IP */
  async checkDigExpectIP(checkType, target, expectedIp) {
    const start = Date.now();
    try {
      const args = ['@127.0.0.1', target, 'A', '+short', '+time=5', '+tries=1'];
      const { stdout } = await execFileAsync('dig', args, { timeout: (hc.digTimeout + 2) * 1000 });
      const latency = Date.now() - start;
      const answer = stdout.trim();
      if (answer.includes(expectedIp)) {
        return { check_type: checkType, target, success: true, latency_ms: latency, error_message: null };
      }
      return { check_type: checkType, target, success: false, latency_ms: latency, error_message: `Expected ${expectedIp}, got: ${answer.substring(0, 100)}` };
    } catch (err) {
      return { check_type: checkType, target, success: false, latency_ms: Date.now() - start, error_message: err.message.substring(0, 500) };
    }
  }

  /** Check ICANN priority: dig com NS must contain gtld-servers.net */
  async checkIcannPriority() {
    const start = Date.now();
    try {
      const args = ['@127.0.0.1', 'com', 'NS', '+short', '+time=5', '+tries=1'];
      const { stdout } = await execFileAsync('dig', args, { timeout: (hc.digTimeout + 2) * 1000 });
      const latency = Date.now() - start;
      if (stdout.includes('gtld-servers.net')) {
        return { check_type: 'icann_priority', target: 'com NS', success: true, latency_ms: latency, error_message: null };
      }
      return { check_type: 'icann_priority', target: 'com NS', success: false, latency_ms: latency, error_message: `No gtld-servers.net in answer: ${stdout.trim().substring(0, 200)}` };
    } catch (err) {
      return { check_type: 'icann_priority', target: 'com NS', success: false, latency_ms: Date.now() - start, error_message: err.message.substring(0, 500) };
    }
  }

  /** HTTP check with timeout */
  async checkHttp(checkType, url) {
    const start = Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(hc.httpTimeoutMs),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { check_type: checkType, target: url, success: true, latency_ms: latency, error_message: null };
      }
      return { check_type: checkType, target: url, success: false, latency_ms: latency, error_message: `HTTP ${res.status}` };
    } catch (err) {
      return { check_type: checkType, target: url, success: false, latency_ms: Date.now() - start, error_message: err.message.substring(0, 500) };
    }
  }

  /** TCP connect check (for DoT on 853) */
  async checkTcpConnect(checkType, host, port) {
    const start = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({ check_type: checkType, target: `${host}:${port}`, success: false, latency_ms: Date.now() - start, error_message: 'Connection timeout' });
      }, hc.httpTimeoutMs);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        const latency = Date.now() - start;
        socket.destroy();
        resolve({ check_type: checkType, target: `${host}:${port}`, success: true, latency_ms: latency, error_message: null });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ check_type: checkType, target: `${host}:${port}`, success: false, latency_ms: Date.now() - start, error_message: err.message.substring(0, 500) });
      });
    });
  }

  /** Docker container check */
  async checkContainer(checkType, containerName) {
    const start = Date.now();
    try {
      const { stdout } = await execFileAsync('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Status}}'], { timeout: 10_000 });
      const latency = Date.now() - start;
      const status = stdout.trim();
      if (status && status.toLowerCase().startsWith('up')) {
        return { check_type: checkType, target: containerName, success: true, latency_ms: latency, error_message: null };
      }
      return { check_type: checkType, target: containerName, success: false, latency_ms: latency, error_message: status ? `Container status: ${status}` : 'Container not found' };
    } catch (err) {
      return { check_type: checkType, target: containerName, success: false, latency_ms: Date.now() - start, error_message: err.message.substring(0, 500) };
    }
  }

  /** Batch-insert check results */
  async storeResults(checks) {
    if (checks.length === 0) return;
    const values = [];
    const params = [];
    let idx = 1;
    for (const c of checks) {
      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(c.check_type, c.target, c.success, c.latency_ms, c.error_message);
    }
    await query(
      `INSERT INTO dns_health_checks (check_type, target, success, latency_ms, error_message)
       VALUES ${values.join(', ')}`,
      params,
    );
  }

  /** Update summary table and send Discord alerts on state transitions */
  async updateSummaries(checks) {
    // Group by check_type
    const byType = {};
    for (const c of checks) {
      if (!byType[c.check_type]) byType[c.check_type] = [];
      byType[c.check_type].push(c);
    }

    for (const [checkType, typeChecks] of Object.entries(byType)) {
      const allPassed = typeChecks.every(c => c.success);
      const anyFailed = typeChecks.some(c => !c.success);

      // Upsert summary
      const { rows } = await query(
        `INSERT INTO dns_health_summary (check_type, last_success, last_failure, consecutive_failures, total_checks, total_successes, uptime_pct, alert_state, updated_at)
         VALUES ($1,
           ${allPassed ? 'NOW()' : 'NULL'},
           ${anyFailed ? 'NOW()' : 'NULL'},
           ${allPassed ? '0' : '1'},
           $2, $3, 100.000, 'ok', NOW())
         ON CONFLICT (check_type) DO UPDATE SET
           last_success = CASE WHEN $4 THEN NOW() ELSE dns_health_summary.last_success END,
           last_failure = CASE WHEN $5 THEN NOW() ELSE dns_health_summary.last_failure END,
           consecutive_failures = CASE WHEN $4 THEN 0 ELSE dns_health_summary.consecutive_failures + 1 END,
           total_checks = dns_health_summary.total_checks + $2,
           total_successes = dns_health_summary.total_successes + $3,
           uptime_pct = ROUND(((dns_health_summary.total_successes + $3)::numeric / (dns_health_summary.total_checks + $2)::numeric) * 100, 3),
           updated_at = NOW()
         RETURNING consecutive_failures, alert_state`,
        [checkType, typeChecks.length, typeChecks.filter(c => c.success).length, allPassed, anyFailed],
      );

      if (rows.length === 0) continue;
      const { consecutive_failures: failures, alert_state: prevState } = rows[0];

      // Alert state transitions
      let newState = 'ok';
      if (failures >= hc.criticalAfterFailures) newState = 'critical';
      else if (failures >= hc.warnAfterFailures) newState = 'warning';

      if (newState !== prevState) {
        await query('UPDATE dns_health_summary SET alert_state = $1 WHERE check_type = $2', [newState, checkType]);

        if (newState === 'warning') {
          await sendAlert({
            level: 'warning',
            title: `DNS Health Warning: ${checkType}`,
            description: `${failures} consecutive failures detected.`,
            fields: [
              { name: 'Check Type', value: checkType, inline: true },
              { name: 'Failures', value: String(failures), inline: true },
              { name: 'Failed Targets', value: typeChecks.filter(c => !c.success).map(c => c.target).join(', ').substring(0, 200) || 'N/A' },
            ],
          });
        } else if (newState === 'critical') {
          await sendAlert({
            level: 'critical',
            title: `DNS Health CRITICAL: ${checkType}`,
            description: `${failures} consecutive failures! Immediate attention required.`,
            fields: [
              { name: 'Check Type', value: checkType, inline: true },
              { name: 'Failures', value: String(failures), inline: true },
              { name: 'Errors', value: typeChecks.filter(c => !c.success).map(c => `${c.target}: ${c.error_message}`).join('\n').substring(0, 500) || 'N/A' },
            ],
          });
        } else if (newState === 'ok' && (prevState === 'warning' || prevState === 'critical')) {
          await sendAlert({
            level: 'ok',
            title: `DNS Health Recovered: ${checkType}`,
            description: 'All checks passing again.',
            fields: [
              { name: 'Check Type', value: checkType, inline: true },
              { name: 'Previous State', value: prevState, inline: true },
            ],
          });
        }
      }
    }
  }

  /** Cleanup old check results beyond retention */
  async cleanup() {
    const { rowCount } = await query(
      `DELETE FROM dns_health_checks WHERE created_at < NOW() - INTERVAL '${hc.retentionDays} days'`,
    );
    if (rowCount > 0) {
      log.info({ deleted: rowCount }, 'Cleaned up old health check records');
    }
  }
}

export default HealthMonitor;
