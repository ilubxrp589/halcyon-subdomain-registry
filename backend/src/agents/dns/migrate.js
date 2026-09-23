/**
 * DNS Agent Database Migration
 *
 * Creates 6 tables for the DNS monitoring agents.
 * All tables are idempotent (CREATE IF NOT EXISTS).
 */

import { query, close } from './db.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('dns-agent-migrate');

const MIGRATION_SQL = `
-- ============================================
-- Agent 1: Health Monitor tables
-- ============================================

-- Individual check results (7-day retention)
CREATE TABLE IF NOT EXISTS dns_health_checks (
  id BIGSERIAL PRIMARY KEY,
  check_type VARCHAR(50) NOT NULL,
  target VARCHAR(255) NOT NULL,
  success BOOLEAN NOT NULL,
  latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_checks_type_created
  ON dns_health_checks (check_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_created
  ON dns_health_checks (created_at);

-- Per-check-type summary (permanent)
CREATE TABLE IF NOT EXISTS dns_health_summary (
  check_type VARCHAR(50) PRIMARY KEY,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  total_checks BIGINT DEFAULT 0,
  total_successes BIGINT DEFAULT 0,
  uptime_pct NUMERIC(6, 3) DEFAULT 100.000,
  alert_state VARCHAR(20) DEFAULT 'ok',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Agent 2: Prometheus Scraper tables
-- ============================================

-- Raw scraped metric samples (7-day retention)
CREATE TABLE IF NOT EXISTS dns_prometheus_metrics (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(30) NOT NULL,
  metric_name VARCHAR(200) NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  labels JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prom_metrics_source_name_created
  ON dns_prometheus_metrics (source, metric_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prom_metrics_created
  ON dns_prometheus_metrics (created_at);

-- Hourly aggregations (30-day retention)
CREATE TABLE IF NOT EXISTS dns_prometheus_hourly (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(30) NOT NULL,
  metric_name VARCHAR(200) NOT NULL,
  hour TIMESTAMPTZ NOT NULL,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  avg_value DOUBLE PRECISION,
  sample_count INTEGER,
  UNIQUE (source, metric_name, hour)
);
CREATE INDEX IF NOT EXISTS idx_prom_hourly_source_name_hour
  ON dns_prometheus_hourly (source, metric_name, hour DESC);

-- ============================================
-- Agent 3: Zone Sync Watcher tables
-- ============================================

-- Per-TLD zone sync state (permanent)
CREATE TABLE IF NOT EXISTS dns_zone_sync_status (
  tld VARCHAR(63) PRIMARY KEY,
  zone_record_count INTEGER DEFAULT 0,
  db_record_count INTEGER DEFAULT 0,
  missing_from_zone INTEGER DEFAULT 0,
  orphaned_in_zone INTEGER DEFAULT 0,
  consecutive_drifts INTEGER DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  last_drift_at TIMESTAMPTZ,
  alert_state VARCHAR(20) DEFAULT 'ok',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Zone generation/drift events (30-day retention)
CREATE TABLE IF NOT EXISTS dns_zone_events (
  id BIGSERIAL PRIMARY KEY,
  tld VARCHAR(63) NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zone_events_tld_created
  ON dns_zone_events (tld, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zone_events_created
  ON dns_zone_events (created_at);
`;

export async function runMigration() {
  log.info('Running DNS agent database migration...');
  try {
    await query(MIGRATION_SQL);
    log.info('DNS agent migration completed successfully');
  } catch (err) {
    log.error({ err }, 'DNS agent migration failed');
    throw err;
  }
}

// Allow running directly: node --experimental-modules src/agents/dns/migrate.js
if (process.argv[1]?.endsWith('agents/dns/migrate.js')) {
  runMigration()
    .then(() => {
      console.log('Migration complete.');
      return close();
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
