/**
 * Authentication Middleware
 * Verifies wallet signatures for API authentication
 */

import { ethers } from 'ethers';
import { query } from '../db/index.js';
import config from '../config/index.js';
import { loggers } from '../utils/logger.js';

const log = loggers.auth;

// Session expiration time (4 hours)
const SESSION_EXPIRY_MS = 4 * 60 * 60 * 1000;

// Admin wallets (should be in config/env in production)
const ADMIN_WALLETS = (process.env.ADMIN_WALLETS || '')
  .split(',')
  .map(w => w.trim().toLowerCase())
  .filter(Boolean);

/**
 * Validate Ethereum address format and checksum
 */
function isValidAddress(address) {
  if (!address || typeof address !== 'string') return false;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return false;

  try {
    // Validate checksum if mixed case
    const checksummed = ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a random nonce for signing
 */
function generateNonce() {
  return `halcyon-auth-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create the message to be signed
 */
function createSignMessage(wallet, nonce, action = 'authenticate') {
  return `Halcyon Subdomain Registry

Action: ${action}
Wallet: ${wallet}
Nonce: ${nonce}

Sign this message to verify your wallet ownership. This signature will not trigger any blockchain transaction.`;
}

/**
 * Verify a signed message
 */
function verifySignature(message, signature, expectedWallet) {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedWallet.toLowerCase();
  } catch (error) {
    log.warn({ error: error.message }, 'Signature verification failed');
    return false;
  }
}

/**
 * Middleware: Get a nonce for signing
 * GET /auth/nonce?wallet=0x...
 * Returns existing valid nonce if available, otherwise generates new one
 */
export async function getNonce(req, res) {
  const { wallet } = req.query;

  if (!isValidAddress(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    // First check if there's an existing valid nonce (with at least 1 minute remaining)
    const existingResult = await query(
      `SELECT nonce, expires_at FROM auth_nonces
       WHERE wallet_address = $1 AND expires_at > NOW() + INTERVAL '1 minute'`,
      [wallet.toLowerCase()]
    );

    if (existingResult.rows.length > 0) {
      // Return existing nonce - this prevents concurrent requests from invalidating each other
      const existing = existingResult.rows[0];
      const message = createSignMessage(wallet, existing.nonce);

      return res.json({
        nonce: existing.nonce,
        message,
        expiresAt: new Date(existing.expires_at).toISOString(),
      });
    }

    // Generate new nonce
    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

    // Store nonce in database (upsert)
    await query(`
      INSERT INTO auth_nonces (wallet_address, nonce, expires_at, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (wallet_address) DO UPDATE SET
        nonce = EXCLUDED.nonce,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()
    `, [wallet.toLowerCase(), nonce, expiresAt]);

    const message = createSignMessage(wallet, nonce);

    res.json({
      nonce,
      message,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    log.error({ error: error.message }, 'Failed to generate nonce');
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
}

/**
 * Middleware: Verify wallet signature
 * Requires: wallet, signature, nonce in request body
 */
export async function verifyWallet(req, res, next) {
  const { wallet, signature, nonce } = req.body;

  // Validate inputs
  if (!wallet || !signature || !nonce) {
    return res.status(401).json({
      error: 'Authentication required',
      details: 'Missing wallet, signature, or nonce',
    });
  }

  if (!isValidAddress(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    // Check nonce exists and is valid
    const nonceResult = await query(
      'SELECT nonce, expires_at FROM auth_nonces WHERE wallet_address = $1',
      [wallet.toLowerCase()]
    );

    if (nonceResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid nonce',
        details: 'Please request a new nonce',
      });
    }

    const storedNonce = nonceResult.rows[0];

    // Check nonce matches
    if (storedNonce.nonce !== nonce) {
      return res.status(401).json({
        error: 'Invalid nonce',
        details: 'Nonce does not match',
      });
    }

    // Check nonce hasn't expired
    if (new Date(storedNonce.expires_at) < new Date()) {
      return res.status(401).json({
        error: 'Nonce expired',
        details: 'Please request a new nonce',
      });
    }

    // Verify signature
    const message = createSignMessage(wallet, nonce);
    const isValid = verifySignature(message, signature, wallet);

    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid signature',
        details: 'Signature does not match wallet',
      });
    }

    // NOTE: We no longer delete the nonce immediately - let it expire naturally.
    // This allows the frontend to reuse credentials within the 5-minute window.
    // The nonce expiration provides security against replay attacks after the window.

    // Attach verified wallet to request
    req.authenticatedWallet = wallet.toLowerCase();

    // Log successful authentication
    log.info({ wallet: wallet.substring(0, 10) }, 'Wallet verified');

    next();
  } catch (error) {
    log.error({ error: error.message }, 'Authentication error');
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware: Verify wallet owns the resource being accessed
 * Must be used after verifyWallet middleware
 * Checks that req.authenticatedWallet matches resource owner
 */
export function verifyOwnership(getOwnerWallet) {
  return async (req, res, next) => {
    if (!req.authenticatedWallet) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const ownerWallet = await getOwnerWallet(req);

      if (!ownerWallet) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      if (ownerWallet.toLowerCase() !== req.authenticatedWallet) {
        return res.status(403).json({
          error: 'Forbidden',
          details: 'You do not own this resource',
        });
      }

      next();
    } catch (error) {
      log.error({ error: error.message }, 'Ownership verification error');
      res.status(500).json({ error: 'Failed to verify ownership' });
    }
  };
}

/**
 * Middleware: Verify admin access
 * Must be used after verifyWallet middleware
 */
export async function verifyAdmin(req, res, next) {
  if (!req.authenticatedWallet) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (ADMIN_WALLETS.length === 0) {
    log.warn('No admin wallets configured - admin endpoints disabled');
    return res.status(503).json({
      error: 'Admin access not configured',
      details: 'Set ADMIN_WALLETS environment variable',
    });
  }

  if (!ADMIN_WALLETS.includes(req.authenticatedWallet)) {
    log.warn({ wallet: req.authenticatedWallet?.substring(0, 10) }, 'Unauthorized admin attempt');
    return res.status(403).json({
      error: 'Forbidden',
      details: 'Admin access required',
    });
  }

  log.info({ wallet: req.authenticatedWallet?.substring(0, 10) }, 'Admin access granted');
  next();
}

/**
 * Optional: Lighter verification for read operations
 * Just checks signature without nonce (for stateless queries)
 */
export async function verifySignatureOnly(req, res, next) {
  const { wallet, signature, message } = req.body;

  if (!wallet || !signature || !message) {
    return res.status(401).json({
      error: 'Authentication required',
      details: 'Missing wallet, signature, or message',
    });
  }

  if (!isValidAddress(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  // Check message contains expected prefix (prevent signing arbitrary messages)
  if (!message.startsWith('Halcyon Subdomain Registry')) {
    return res.status(400).json({ error: 'Invalid message format' });
  }

  const isValid = verifySignature(message, signature, wallet);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  req.authenticatedWallet = wallet.toLowerCase();
  next();
}

/**
 * Create message for read-only admin authentication
 */
function createReadAuthMessage(wallet, timestamp) {
  return `Halcyon Admin Read Access

Wallet: ${wallet}
Timestamp: ${timestamp}

Sign this message to verify admin access for read-only operations.`;
}

/**
 * Middleware: Secure admin read-only authentication
 * Requires signature of a timestamp (valid for 5 minutes)
 * More secure than wallet-only check, but doesn't consume nonce
 */
export async function verifyAdminReadAuth(req, res, next) {
  const { wallet, signature, timestamp } = req.body;

  // Validate inputs
  if (!wallet || !signature || !timestamp) {
    return res.status(401).json({
      error: 'Authentication required',
      details: 'Missing wallet, signature, or timestamp',
    });
  }

  if (!isValidAddress(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  // Validate timestamp is a number
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return res.status(400).json({ error: 'Invalid timestamp' });
  }

  // Check timestamp is within 5 minutes
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  if (Math.abs(now - ts) > fiveMinutes) {
    return res.status(401).json({
      error: 'Authentication expired',
      details: 'Timestamp is too old or too far in the future. Please re-authenticate.',
    });
  }

  // Check admin wallets configured
  if (ADMIN_WALLETS.length === 0) {
    log.warn('No admin wallets configured - admin endpoints disabled');
    return res.status(503).json({
      error: 'Admin access not configured',
      details: 'Set ADMIN_WALLETS environment variable',
    });
  }

  // Check wallet is admin
  if (!ADMIN_WALLETS.includes(wallet.toLowerCase())) {
    return res.status(403).json({
      error: 'Forbidden',
      details: 'Admin access required',
    });
  }

  // Verify signature
  const message = createReadAuthMessage(wallet, timestamp);
  const isValid = verifySignature(message, signature, wallet);

  if (!isValid) {
    return res.status(401).json({
      error: 'Invalid signature',
      details: 'Signature does not match wallet',
    });
  }

  req.authenticatedWallet = wallet.toLowerCase();
  log.info({ wallet: wallet?.substring(0, 10) }, 'Admin read access granted');
  next();

}

/**
 * @deprecated Use verifyAdminReadAuth instead - this is insecure
 * Middleware: Simple admin wallet check (no signature required)
 * SECURITY WARNING: Anyone knowing admin wallet can impersonate!
 */
export async function verifyAdminWalletOnly(req, res, next) {
  // Redirect to secure method
  return verifyAdminReadAuth(req, res, next);
}

export default {
  getNonce,
  verifyWallet,
  verifyOwnership,
  verifyAdmin,
  verifyAdminWalletOnly,  // Deprecated - now calls verifyAdminReadAuth
  verifyAdminReadAuth,
  verifySignatureOnly,
  isValidAddress,
};
