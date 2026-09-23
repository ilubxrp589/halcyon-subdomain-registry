/**
 * URL Redirect Server
 * Standalone Express app on port 8080
 * Catches all requests, looks up hostname in url_forwards table,
 * and returns 301/302 redirects to the configured target URL.
 */

import express from 'express';
import { pool } from './db/index.js';

const app = express();
const PORT = process.env.REDIRECT_PORT || 8080;

// In-memory cache with 60s TTL
const cache = new Map();
const CACHE_TTL = 60 * 1000;

const CACHE_MISS = Symbol('cache_miss');

function getCached(fqdn) {
  const entry = cache.get(fqdn);
  if (!entry) return CACHE_MISS;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(fqdn);
    return CACHE_MISS;
  }
  return entry.data;
}

function setCache(fqdn, data) {
  cache.set(fqdn, { data, timestamp: Date.now() });
}

// Health check
app.get('/_health', (req, res) => {
  res.json({ status: 'ok', service: 'redirect-server' });
});

// Catch all requests
app.get('*', async (req, res) => {
  const hostname = req.hostname;

  if (!hostname) {
    return res.status(400).send('Bad Request');
  }

  try {
    // Check cache first
    let forward = getCached(hostname);

    if (forward === CACHE_MISS) {
      // Not in cache, query DB
      const result = await pool.query(
        'SELECT target_url, redirect_type, path_forwarding, enabled, domain_mode FROM url_forwards WHERE fqdn = $1',
        [hostname]
      );

      if (result.rows.length === 0) {
        setCache(hostname, null);
        return res.status(404).send(`
          <html>
            <head><title>Not Found</title></head>
            <body>
              <h1>404 - No forwarding configured</h1>
              <p>No URL forward is configured for <strong>${hostname}</strong></p>
            </body>
          </html>
        `);
      }

      forward = result.rows[0];
      setCache(hostname, forward);
    }

    // Profile mode: redirect to frontend profile page
    if (forward && forward.domain_mode === 'profile') {
      const profileUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile/${hostname}`;
      return res.redirect(302, profileUrl);
    }

    if (!forward || !forward.enabled) {
      return res.status(404).send(`
        <html>
          <head><title>Not Found</title></head>
          <body>
            <h1>404 - Forwarding disabled</h1>
            <p>URL forwarding for <strong>${hostname}</strong> is currently disabled.</p>
          </body>
        </html>
      `);
    }

    let targetUrl = forward.target_url;

    // Path forwarding: append the request path to the target URL
    if (forward.path_forwarding && req.path && req.path !== '/') {
      // Remove trailing slash from target, add request path
      targetUrl = targetUrl.replace(/\/+$/, '') + req.path;
    }

    res.redirect(forward.redirect_type, targetUrl);
  } catch (error) {
    console.error('Redirect lookup error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`Redirect server running on port ${PORT}`);
});

export default app;
