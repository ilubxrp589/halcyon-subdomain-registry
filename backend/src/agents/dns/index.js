/**
 * DNS Monitoring Agent — Entry Point
 *
 * Starts all 3 monitoring modules and exposes an Express API on port 8070:
 *
 * GET /api/agents/dns/health   — Health monitor status + recent results
 * GET /api/agents/dns/metrics  — Prometheus metrics query
 * GET /api/agents/dns/zones    — Zone sync status
 * GET /api/agents/dns/status   — Overall agent status
 */

import express from 'express';
import config from './config.js';
import { runMigration } from './migrate.js';
import { close as closeDb } from './db.js';
import { createLogger } from '../../utils/logger.js';
import HealthMonitor from './health-monitor.js';
import PrometheusScraper from './prometheus-scraper.js';
import ZoneSyncWatcher from './zone-sync-watcher.js';

const log = createLogger('dns-agent');

// Instantiate modules
const healthMonitor = new HealthMonitor();
const prometheusScraper = new PrometheusScraper();
const zoneSyncWatcher = new ZoneSyncWatcher();

// Express API
const app = express();

app.get('/api/agents/dns/status', (req, res) => {
  res.json({
    success: true,
    data: {
      uptime: process.uptime(),
      health: healthMonitor.getStatus(),
      prometheus: prometheusScraper.getStatus(),
      zoneSync: zoneSyncWatcher.getStatus(),
    },
  });
});

app.get('/api/agents/dns/health', async (req, res) => {
  try {
    const status = healthMonitor.getStatus();
    const { query: dbQuery } = await import('./db.js');
    const { rows: summaries } = await dbQuery('SELECT * FROM dns_health_summary ORDER BY check_type');
    res.json({ success: true, data: { status, summaries } });
  } catch (err) {
    log.error({ err }, 'Health API error');
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/agents/dns/metrics', async (req, res) => {
  try {
    const { source, metric, hours = '24', view = 'raw' } = req.query;
    if (!source) {
      return res.status(400).json({ success: false, error: 'source parameter required (bind, haproxy, dnsdist)' });
    }
    let data;
    if (view === 'hourly') {
      data = await prometheusScraper.queryHourly({ source, metric, hours: parseInt(hours) });
    } else {
      data = await prometheusScraper.queryMetrics({ source, metric, hours: parseInt(hours) });
    }
    res.json({ success: true, data });
  } catch (err) {
    log.error({ err }, 'Metrics API error');
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/agents/dns/zones', async (req, res) => {
  try {
    const { tld } = req.query;
    const data = await zoneSyncWatcher.queryStatus(tld);
    res.json({ success: true, data });
  } catch (err) {
    log.error({ err }, 'Zones API error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cleanup endpoint (can be called by cron or manually)
app.post('/api/agents/dns/cleanup', async (req, res) => {
  try {
    await Promise.all([
      healthMonitor.cleanup(),
      prometheusScraper.cleanup(),
      zoneSyncWatcher.cleanup(),
    ]);
    res.json({ success: true, data: { message: 'Cleanup completed' } });
  } catch (err) {
    log.error({ err }, 'Cleanup error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Startup
async function main() {
  log.info('DNS Monitoring Agent starting...');

  // Run migration first (idempotent)
  await runMigration();

  // Start all modules
  healthMonitor.start();
  prometheusScraper.start();
  zoneSyncWatcher.start();

  // Schedule hourly aggregation for Prometheus data
  setInterval(() => prometheusScraper.aggregateHourly(), 3_600_000);
  // Run initial aggregation after 2 minutes (let some data accumulate)
  setTimeout(() => prometheusScraper.aggregateHourly(), 120_000);

  // Schedule daily cleanup at module level
  setInterval(async () => {
    try {
      await healthMonitor.cleanup();
      await prometheusScraper.cleanup();
      await zoneSyncWatcher.cleanup();
      log.info('Daily cleanup completed');
    } catch (err) {
      log.error({ err }, 'Daily cleanup failed');
    }
  }, 86_400_000); // 24 hours

  // Start Express server
  app.listen(config.port, () => {
    log.info({ port: config.port }, 'DNS Agent API listening');
    console.log(`  ✓ DNS Agent API: http://localhost:${config.port}/api/agents/dns/status`);
    console.log('  ✓ Health Monitor: running');
    console.log('  ✓ Prometheus Scraper: running');
    console.log('  ✓ Zone Sync Watcher: running');
  });
}

// Graceful shutdown
async function shutdown(signal) {
  log.info({ signal }, 'Shutting down DNS agent...');
  healthMonitor.stop();
  prometheusScraper.stop();
  zoneSyncWatcher.stop();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  log.fatal({ err }, 'DNS Agent failed to start');
  console.error('DNS Agent failed to start:', err.message);
  process.exit(1);
});
