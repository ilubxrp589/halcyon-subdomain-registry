import { Router } from 'express';
import path from 'path';
import { existsSync } from 'fs';
import pg from 'pg';
import { loggers } from '../utils/logger.js';
import { pool as hsrPool } from '../db/index.js';

const { Pool } = pg;
const log = loggers.api;
const router = Router();

// Screenshot directory for HNS Indexer
const SCREENSHOTS_DIR = process.env.HNS_SCREENSHOTS_DIR
  || path.resolve('/home/localai/Desktop/HNS-Indexer/data/screenshots');

// Separate connection pool for the hns_indexer database
const indexerPool = new Pool({
  connectionString: process.env.HNS_INDEXER_DB_URL || 'postgresql://subdomain_user:REDACTED@localhost:5432/hns_indexer',
  max: 10,
});

indexerPool.on('error', (err) => {
  log.error({ err }, 'HNS indexer DB pool error');
});

// =============================================================
//                     SCREENSHOTS
// =============================================================

/**
 * GET /screenshots/:filename — serve domain screenshot images
 */
router.get('/screenshots/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  if (!/^[\w.\-]+\.jpg$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Screenshot not found' });
  }
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24h
  res.sendFile(filePath);
});

// =============================================================
//                        STATS
// =============================================================

/**
 * GET /stats — aggregate statistics from the HNS indexer
 */
router.get('/stats', async (req, res) => {
  try {
    const [stats, clusters] = await Promise.all([
      indexerPool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE classification = 'real') AS real,
          COUNT(*) FILTER (WHERE classification = 'parking') AS parking,
          COUNT(*) FILTER (WHERE classification = 'empty') AS empty,
          COUNT(*) FILTER (WHERE classification = 'error') AS error,
          COUNT(*) FILTER (WHERE status = 'alive') AS alive,
          COUNT(*) FILTER (WHERE https = true) AS https,
          COUNT(*) FILTER (WHERE title IS NOT NULL) AS with_title,
          MAX(last_checked) AS last_scan,
          COUNT(DISTINCT ip) AS unique_ips
        FROM domains
      `),
      indexerPool.query(`
        SELECT COUNT(*) AS total, SUM(domain_count) AS domains_in_clusters
        FROM ip_clusters
      `),
    ]);

    res.json({
      domains: stats.rows[0],
      ip_clusters: clusters.rows[0],
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch indexer stats');
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// =============================================================
//                       DOMAINS
// =============================================================

/**
 * GET /domains — paginated, filtered domain listing
 * Query params: page, limit, classification, status, ip, https, has_title,
 *               letter, show_clusters, sort
 */
router.get('/domains', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 24));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    let paramIdx = 1;

    if (req.query.classification) {
      where.push(`d.classification = $${paramIdx++}`);
      params.push(req.query.classification);
    }
    if (req.query.status) {
      where.push(`d.status = $${paramIdx++}`);
      params.push(req.query.status);
    }
    if (req.query.ip) {
      where.push(`d.ip = $${paramIdx++}`);
      params.push(req.query.ip);
    }
    if (req.query.https === 'true') {
      where.push(`d.https = true`);
    }
    if (req.query.has_title === 'true') {
      where.push(`d.title IS NOT NULL`);
    }
    if (req.query.letter) {
      const letter = req.query.letter.toLowerCase().charAt(0);
      if (letter >= 'a' && letter <= 'z') {
        where.push(`LOWER(LEFT(d.name, 1)) = $${paramIdx++}`);
        params.push(letter);
      } else if (letter === '#') {
        where.push(`LEFT(d.name, 1) ~ '^[^a-zA-Z]'`);
      }
    }
    if (req.query.show_clusters !== 'true' && req.query.classification !== 'real') {
      where.push(`(ic.domain_count IS NULL OR ic.domain_count < 50)`);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const countResult = await indexerPool.query(
      `SELECT COUNT(*) FROM domains d
       LEFT JOIN ip_clusters ic ON d.ip_cluster_id = ic.id
       ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const sortOptions = {
      name: 'd.name ASC',
      response_time: 'd.response_time_ms ASC NULLS LAST',
      newest: 'd.first_seen DESC',
      checked: 'd.last_checked DESC',
    };
    const sort = sortOptions[req.query.sort] || 'd.name ASC';

    params.push(limit, offset);
    const result = await indexerPool.query(
      `SELECT d.id, d.name, d.ip, d.status, d.http_status, d.https, d.title, d.description,
              d.classification, d.class_reason, d.content_type, d.response_time_ms,
              d.redirect, d.first_seen, d.last_checked, d.last_alive, d.screenshot_path,
              ic.domain_count AS cluster_size, ic.hosting_provider
       FROM domains d
       LEFT JOIN ip_clusters ic ON d.ip_cluster_id = ic.id
       ${whereClause}
       ORDER BY ${sort}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    res.json({
      data: result.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch indexed domains');
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// =============================================================
//                    DOMAIN DETAIL
// =============================================================

/**
 * GET /domain/:name — single domain detail
 */
router.get('/domain/:name', async (req, res) => {
  try {
    const name = req.params.name.toLowerCase().replace(/[^a-z0-9\-_.]/g, '');
    if (!name) {
      return res.status(400).json({ error: 'Invalid domain name' });
    }

    const result = await indexerPool.query(
      `SELECT d.*, ic.domain_count AS cluster_size, ic.hosting_provider
       FROM domains d
       LEFT JOIN ip_clusters ic ON d.ip_cluster_id = ic.id
       WHERE d.name = $1`,
      [name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found in index' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    log.error({ err }, 'Failed to fetch domain detail');
    res.status(500).json({ error: 'Failed to fetch domain' });
  }
});

// =============================================================
//                       SEARCH
// =============================================================

/**
 * GET /search?q= — full-text search across indexed Handshake domains
 * Query params: q (required), page, limit, classification, status, https,
 *               has_title, show_clusters
 */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 24));
    const offset = (page - 1) * limit;

    // Build tsquery from plain text input
    const terms = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[^\w]/g, ''));
    if (terms.length === 0) {
      return res.status(400).json({ error: 'No valid search terms' });
    }
    const tsquery = terms.join(' & ');

    // Extra filters
    const staticFilters = [];
    const paramFilters = [];
    const extraParamValues = [];

    if (req.query.classification) {
      paramFilters.push({ col: 'd.classification' });
      extraParamValues.push(req.query.classification);
    }
    if (req.query.status) {
      paramFilters.push({ col: 'd.status' });
      extraParamValues.push(req.query.status);
    }
    if (req.query.https === 'true') {
      staticFilters.push(`d.https = true`);
    }
    if (req.query.has_title === 'true') {
      staticFilters.push(`d.title IS NOT NULL`);
    }
    if (req.query.show_clusters !== 'true' && req.query.classification !== 'real') {
      staticFilters.push(`(ic.domain_count IS NULL OR ic.domain_count < 50)`);
    }

    const buildExtraClause = (startParam) => {
      const parts = [...staticFilters];
      let p = startParam;
      for (const f of paramFilters) {
        parts.push(`${f.col} = $${p++}`);
      }
      return parts.length > 0 ? 'AND ' + parts.join(' AND ') : '';
    };

    // Count: $1=tsquery, extra params start at $2
    const countClause = buildExtraClause(2);
    const countResult = await indexerPool.query(
      `SELECT COUNT(*) FROM domains d
       LEFT JOIN ip_clusters ic ON d.ip_cluster_id = ic.id
       WHERE to_tsvector('english',
         COALESCE(d.name,'') || ' ' || COALESCE(d.title,'') || ' ' ||
         COALESCE(d.description,'') || ' ' || COALESCE(d.body_text,'')
       ) @@ to_tsquery('english', $1)
       ${countClause}`,
      [tsquery, ...extraParamValues]
    );
    const total = parseInt(countResult.rows[0].count);

    // Search: $1=tsquery, $2=limit, $3=offset, extra params start at $4
    const dataClause = buildExtraClause(4);
    const result = await indexerPool.query(
      `SELECT d.id, d.name, d.ip, d.status, d.http_status, d.https, d.title, d.description,
              d.classification, d.response_time_ms, d.last_checked,
              d.screenshot_path, ic.domain_count AS cluster_size, ic.hosting_provider,
              ts_rank(
                to_tsvector('english',
                  COALESCE(d.name,'') || ' ' || COALESCE(d.title,'') || ' ' ||
                  COALESCE(d.description,'') || ' ' || COALESCE(d.body_text,'')
                ),
                to_tsquery('english', $1)
              ) AS rank
       FROM domains d
       LEFT JOIN ip_clusters ic ON d.ip_cluster_id = ic.id
       WHERE to_tsvector('english',
         COALESCE(d.name,'') || ' ' || COALESCE(d.title,'') || ' ' ||
         COALESCE(d.description,'') || ' ' || COALESCE(d.body_text,'')
       ) @@ to_tsquery('english', $1)
       ${dataClause}
       ORDER BY rank DESC, d.name ASC
       LIMIT $2 OFFSET $3`,
      [tsquery, limit, offset, ...extraParamValues]
    );

    res.json({
      query: q,
      data: result.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    log.error({ err }, 'Failed to search indexed domains');
    res.status(500).json({ error: 'Failed to search domains' });
  }
});

// =============================================================
//                      CLUSTERS
// =============================================================

/**
 * GET /clusters — large IP clusters (50+ domains) hidden from default listing
 */
router.get('/clusters', async (req, res) => {
  try {
    const result = await indexerPool.query(`
      SELECT ic.id, ic.ip, ic.domain_count, ic.hosting_provider,
             (SELECT title FROM domains WHERE ip_cluster_id = ic.id AND title IS NOT NULL LIMIT 1) AS sample_title,
             (SELECT classification FROM domains WHERE ip_cluster_id = ic.id LIMIT 1) AS sample_class,
             (SELECT screenshot_path FROM domains WHERE ip_cluster_id = ic.id AND screenshot_path IS NOT NULL LIMIT 1) AS sample_screenshot
      FROM ip_clusters ic
      WHERE ic.domain_count >= 50
      ORDER BY ic.domain_count DESC
    `);
    res.json({ clusters: result.rows });
  } catch (err) {
    log.error({ err }, 'Failed to fetch clusters');
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

// =============================================================
//                    TLD MATCHING (HSR database)
// =============================================================

// Cache for TLD list — refreshes every 5 minutes
let tldListCache = { labels: [], ts: 0 };
const TLD_CACHE_TTL = 5 * 60 * 1000;

async function getEnabledTlds() {
  if (Date.now() - tldListCache.ts < TLD_CACHE_TTL && tldListCache.labels.length > 0) {
    return tldListCache.labels;
  }
  const result = await hsrPool.query(
    `SELECT label FROM tlds_v2 WHERE registration_enabled = true ORDER BY label`
  );
  tldListCache = { labels: result.rows.map(r => r.label), ts: Date.now() };
  return tldListCache.labels;
}

/**
 * GET /tld-list — all registration-enabled TLD labels from HSR
 * Used by frontend TldMatchProvider for O(1) lookup
 */
router.get('/tld-list', async (req, res) => {
  try {
    const labels = await getEnabledTlds();
    res.json({ tlds: labels });
  } catch (err) {
    log.error({ err }, 'Failed to fetch TLD list');
    res.status(500).json({ error: 'Failed to fetch TLD list' });
  }
});

/**
 * GET /tld-match/:name — check if an indexed domain name matches an HSR TLD
 */
router.get('/tld-match/:name', async (req, res) => {
  try {
    const name = req.params.name.toLowerCase().replace(/[^a-z0-9\-]/g, '');
    if (!name) {
      return res.status(400).json({ match: false });
    }
    const result = await hsrPool.query(
      `SELECT label, registration_enabled, is_official FROM tlds_v2 WHERE label = $1 AND registration_enabled = true`,
      [name]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      res.json({ match: true, tld: row.label, is_official: row.is_official });
    } else {
      res.json({ match: false });
    }
  } catch (err) {
    log.error({ err }, 'Failed to check TLD match');
    res.status(500).json({ match: false });
  }
});

export default router;
