/**
 * Prometheus Scraper — agent-dns-002
 *
 * Scrapes metrics from:
 * - BIND exporter (port 9119, Prometheus text format)
 * - HAProxy (port 8405, Prometheus text format)
 * - dnsdist (port 8083, JSON API)
 *
 * Stores whitelisted metrics in dns_prometheus_metrics (raw, 7-day retention)
 * and aggregates hourly into dns_prometheus_hourly (30-day retention).
 */

import config from './config.js';
import { query } from './db.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('dns-prometheus');
const pc = config.prometheus;

class PrometheusScraper {
  constructor() {
    this.timer = null;
    this.running = false;
    this.lastScrape = null;
  }

  start() {
    if (this.timer) return;
    log.info({ intervalMs: pc.intervalMs }, 'Prometheus scraper starting');
    this.timer = setInterval(() => this.runCycle(), pc.intervalMs);
    this.runCycle();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('Prometheus scraper stopped');
  }

  isRunning() {
    return this.timer !== null;
  }

  getStatus() {
    return {
      running: this.isRunning(),
      lastScrape: this.lastScrape,
    };
  }

  async runCycle() {
    if (this.running) return;
    this.running = true;
    const start = Date.now();

    try {
      const allMetrics = [];

      // Scrape BIND
      const bindMetrics = await this.scrapePrometheusText('bind', pc.endpoints.bind);
      allMetrics.push(...bindMetrics);

      // Scrape HAProxy
      const haproxyMetrics = await this.scrapePrometheusText('haproxy', pc.endpoints.haproxy);
      allMetrics.push(...haproxyMetrics);

      // Scrape dnsdist (JSON)
      const dnsdistMetrics = await this.scrapeDnsdistJson();
      allMetrics.push(...dnsdistMetrics);

      // Store raw metrics
      if (allMetrics.length > 0) {
        await this.storeMetrics(allMetrics);
      }

      this.lastScrape = {
        timestamp: new Date().toISOString(),
        bind: bindMetrics.length,
        haproxy: haproxyMetrics.length,
        dnsdist: dnsdistMetrics.length,
        elapsed: Date.now() - start,
      };

      log.info(this.lastScrape, 'Prometheus scrape cycle complete');
    } catch (err) {
      log.error({ err }, 'Prometheus scrape cycle error');
    } finally {
      this.running = false;
    }
  }

  /**
   * Parse Prometheus text exposition format and filter by whitelist
   */
  async scrapePrometheusText(source, url) {
    const whitelist = pc.whitelist[source] || [];
    if (whitelist.length === 0) return [];

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(pc.httpTimeoutMs) });
      if (!res.ok) {
        log.warn({ source, status: res.status }, 'Prometheus endpoint returned non-OK');
        return [];
      }

      const text = await res.text();
      return this.parsePrometheusText(text, source, whitelist);
    } catch (err) {
      log.warn({ err, source, url }, 'Failed to scrape Prometheus endpoint');
      return [];
    }
  }

  /**
   * Parse Prometheus text exposition format
   * Lines like: metric_name{label="value"} 123.45
   */
  parsePrometheusText(text, source, whitelist) {
    const metrics = [];
    const lines = text.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) continue;

      // Match: metric_name{labels} value  OR  metric_name value
      const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?([^}]*)\}?\s+([\d.eE+-]+|NaN|Inf|-Inf)/);
      if (!match) continue;

      const [, metricName, labelsStr, valueStr] = match;

      // Check whitelist — match by prefix
      if (!whitelist.some(w => metricName.startsWith(w))) continue;

      const value = parseFloat(valueStr);
      if (isNaN(value) || !isFinite(value)) continue;

      // Parse labels
      let labels = null;
      if (labelsStr) {
        labels = {};
        const labelPairs = labelsStr.match(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g);
        if (labelPairs) {
          for (const pair of labelPairs) {
            const [key, val] = pair.split('=');
            labels[key] = val.replace(/^"|"$/g, '');
          }
        }
      }

      metrics.push({ source, metric_name: metricName, metric_value: value, labels });
    }

    return metrics;
  }

  /**
   * Scrape dnsdist JSON stats API
   */
  async scrapeDnsdistJson() {
    const { url, apiKey } = pc.endpoints.dnsdist;
    const whitelist = pc.whitelist.dnsdist || [];
    if (whitelist.length === 0) return [];

    try {
      const res = await fetch(url, {
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(pc.httpTimeoutMs),
      });
      if (!res.ok) {
        log.warn({ status: res.status }, 'dnsdist API returned non-OK');
        return [];
      }

      const data = await res.json();
      const metrics = [];

      for (const key of whitelist) {
        if (data[key] !== undefined) {
          const value = parseFloat(data[key]);
          if (!isNaN(value) && isFinite(value)) {
            metrics.push({
              source: 'dnsdist',
              metric_name: `dnsdist_${key.replace(/-/g, '_')}`,
              metric_value: value,
              labels: null,
            });
          }
        }
      }

      return metrics;
    } catch (err) {
      log.warn({ err, url }, 'Failed to scrape dnsdist JSON API');
      return [];
    }
  }

  /** Batch-insert scraped metrics */
  async storeMetrics(metrics) {
    if (metrics.length === 0) return;

    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < metrics.length; i += batchSize) {
      const batch = metrics.slice(i, i + batchSize);
      const values = [];
      const params = [];
      let idx = 1;
      for (const m of batch) {
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        params.push(m.source, m.metric_name, m.metric_value, m.labels ? JSON.stringify(m.labels) : null);
      }
      await query(
        `INSERT INTO dns_prometheus_metrics (source, metric_name, metric_value, labels)
         VALUES ${values.join(', ')}`,
        params,
      );
    }
  }

  /**
   * Aggregate raw metrics into hourly buckets.
   * Run this once per cycle — it upserts the current hour.
   */
  async aggregateHourly() {
    try {
      await query(`
        INSERT INTO dns_prometheus_hourly (source, metric_name, hour, min_value, max_value, avg_value, sample_count)
        SELECT
          source,
          metric_name,
          date_trunc('hour', created_at) AS hour,
          MIN(metric_value),
          MAX(metric_value),
          AVG(metric_value),
          COUNT(*)
        FROM dns_prometheus_metrics
        WHERE created_at >= date_trunc('hour', NOW())
          AND created_at < date_trunc('hour', NOW()) + INTERVAL '1 hour'
        GROUP BY source, metric_name, date_trunc('hour', created_at)
        ON CONFLICT (source, metric_name, hour) DO UPDATE SET
          min_value = LEAST(dns_prometheus_hourly.min_value, EXCLUDED.min_value),
          max_value = GREATEST(dns_prometheus_hourly.max_value, EXCLUDED.max_value),
          avg_value = EXCLUDED.avg_value,
          sample_count = EXCLUDED.sample_count
      `);
    } catch (err) {
      log.error({ err }, 'Hourly aggregation failed');
    }
  }

  /** Cleanup old data beyond retention */
  async cleanup() {
    const rawResult = await query(
      `DELETE FROM dns_prometheus_metrics WHERE created_at < NOW() - INTERVAL '${pc.retentionDays} days'`,
    );
    const hourlyResult = await query(
      `DELETE FROM dns_prometheus_hourly WHERE hour < NOW() - INTERVAL '${pc.hourlyRetentionDays} days'`,
    );
    if (rawResult.rowCount > 0 || hourlyResult.rowCount > 0) {
      log.info({ rawDeleted: rawResult.rowCount, hourlyDeleted: hourlyResult.rowCount }, 'Cleaned up old Prometheus data');
    }
  }

  /** Query metrics for API responses */
  async queryMetrics({ source, metric, hours = 24 }) {
    const { rows } = await query(
      `SELECT metric_name, metric_value, labels, created_at
       FROM dns_prometheus_metrics
       WHERE source = $1
         AND ($2::text IS NULL OR metric_name = $2)
         AND created_at > NOW() - INTERVAL '1 hour' * $3
       ORDER BY created_at DESC
       LIMIT 1000`,
      [source, metric || null, hours],
    );
    return rows;
  }

  async queryHourly({ source, metric, hours = 168 }) {
    const { rows } = await query(
      `SELECT metric_name, hour, min_value, max_value, avg_value, sample_count
       FROM dns_prometheus_hourly
       WHERE source = $1
         AND ($2::text IS NULL OR metric_name = $2)
         AND hour > NOW() - INTERVAL '1 hour' * $3
       ORDER BY hour DESC
       LIMIT 500`,
      [source, metric || null, hours],
    );
    return rows;
  }
}

export default PrometheusScraper;
