/**
 * API Key Authentication Middleware
 * Provides alternative auth via x-api-key header (alongside wallet signatures)
 */

import crypto from 'crypto';
import { query } from '../db/index.js';
import { loggers } from '../utils/logger.js';

const log = loggers.auth;

// Rate limits per tier (requests per minute)
const TIER_LIMITS = {
  free: 60,
  basic: 300,
  pro: 1000,
};

// In-memory sliding window rate limiter
// Map<keyHash, { timestamps: number[] }>
const rateLimitMap = new Map();

// Batch usage counter updates (flush every 30s)
const usageBatch = new Map(); // keyHash -> { today: number, month: number }
let batchFlushTimer = null;

function startBatchFlush() {
  if (batchFlushTimer) return;
  batchFlushTimer = setInterval(flushUsageBatch, 30000);
}

async function flushUsageBatch() {
  if (usageBatch.size === 0) return;
  const entries = [...usageBatch.entries()];
  usageBatch.clear();

  for (const [keyHash, counts] of entries) {
    try {
      await query(
        `UPDATE api_keys SET
          requests_today = requests_today + $1,
          requests_month = requests_month + $2,
          last_request_at = NOW()
        WHERE key_hash = $3 AND is_active = true`,
        [counts.today, counts.month, keyHash]
      );
    } catch (err) {
      log.error({ err, keyHash: keyHash.substring(0, 8) }, 'Failed to flush API key usage');
    }
  }
}

function incrementUsage(keyHash) {
  const existing = usageBatch.get(keyHash) || { today: 0, month: 0 };
  existing.today += 1;
  existing.month += 1;
  usageBatch.set(keyHash, existing);
  startBatchFlush();
}

function checkRateLimit(keyHash, limit) {
  const now = Date.now();
  const windowMs = 60000;
  let entry = rateLimitMap.get(keyHash);

  if (!entry) {
    entry = { timestamps: [] };
    rateLimitMap.set(keyHash, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    return false;
  }

  entry.timestamps.push(now);
  return true;
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (entry.timestamps.length === 0 || now - entry.timestamps[entry.timestamps.length - 1] > 120000) {
      rateLimitMap.delete(key);
    }
  }
}, 300000);

/**
 * Middleware: Authenticate via x-api-key header
 * Sets req.apiKey with key metadata if valid
 */
export async function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  if (typeof apiKey !== 'string' || apiKey.length !== 64) {
    return res.status(401).json({ error: 'Invalid API key format' });
  }

  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  try {
    const result = await query(
      `SELECT id, wallet_address, label, tier, requests_today, requests_month, created_at
       FROM api_keys WHERE key_hash = $1 AND is_active = true`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }

    const keyData = result.rows[0];
    const limit = TIER_LIMITS[keyData.tier] || TIER_LIMITS.free;

    if (!checkRateLimit(keyHash, limit)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit,
        tier: keyData.tier,
        retryAfter: 60,
      });
    }

    incrementUsage(keyHash);

    req.apiKey = keyData;
    req.authenticatedWallet = keyData.wallet_address;

    next();
  } catch (error) {
    log.error({ error: error.message }, 'API key verification error');
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware: Accept either wallet signature OR API key
 * Tries x-api-key header first, falls back to wallet auth
 */
export function verifyApiKeyOrWallet(walletMiddleware) {
  return async (req, res, next) => {
    if (req.headers['x-api-key']) {
      return verifyApiKey(req, res, next);
    }
    return walletMiddleware(req, res, next);
  };
}

export default { verifyApiKey, verifyApiKeyOrWallet };
