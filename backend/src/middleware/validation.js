/**
 * Input Validation Middleware
 * Validates and sanitizes all user inputs
 */

import { ethers } from 'ethers';
import { query } from '../db/index.js';

// DNS label constraints (RFC 1035)
const MAX_LABEL_LENGTH = 63;
const MIN_LABEL_LENGTH = 1;

// Reserved subdomains that cannot be registered
const RESERVED_SUBDOMAINS = new Set([
  // Infrastructure
  'www', 'ftp', 'mail', 'smtp', 'pop', 'pop3', 'imap', 'webmail',
  'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'dns', 'dns1', 'dns2',
  'mx', 'mx1', 'mx2', 'relay', 'gateway',
  // Admin/system
  'admin', 'administrator', 'root', 'system', 'sys', 'superuser',
  'api', 'api1', 'api2', 'rest', 'graphql', 'rpc',
  'app', 'apps', 'application',
  // Security
  'auth', 'login', 'logout', 'signin', 'signout', 'signup', 'register',
  'account', 'accounts', 'user', 'users', 'profile', 'settings',
  'password', 'reset', 'verify', 'confirm', 'oauth', 'sso',
  // Reserved/special
  'test', 'testing', 'dev', 'development', 'stage', 'staging', 'prod', 'production',
  'demo', 'example', 'sample', 'localhost', 'local',
  'null', 'undefined', 'nil', 'void', 'none', 'empty',
  'true', 'false', 'yes', 'no',
  // Common services
  'blog', 'shop', 'store', 'cdn', 'static', 'assets', 'media', 'images', 'img',
  'help', 'support', 'docs', 'documentation', 'wiki', 'faq',
  'status', 'health', 'ping', 'monitor',
  // Crypto/blockchain specific
  'wallet', 'wallets', 'nft', 'nfts', 'token', 'tokens', 'mint', 'bridge',
  'swap', 'exchange', 'trade', 'stake', 'staking', 'pool', 'vault',
  'halcyon', 'registry', 'oracle', 'escrow',
  // Abuse prevention
  'abuse', 'spam', 'phishing', 'scam', 'hack', 'hacker',
  'official', 'verified', 'secure', 'security',
]);

// Patterns that look like they're trying to impersonate
const SUSPICIOUS_PATTERNS = [
  /^[0o]+$/, // All zeros/o's (could be confused with official)
  /^[1il]+$/, // All 1's/i's/l's (homograph attack)
  /admin/i,
  /support/i,
  /official/i,
  /helpdesk/i,
  /customer/i,
  /service/i,
];

/**
 * Validate Ethereum address format and checksum
 */
export function isValidAddress(address) {
  if (!address || typeof address !== 'string') return false;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return false;

  try {
    // Validates checksum if mixed case
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize Ethereum address to checksummed format
 */
export function normalizeAddress(address) {
  try {
    return ethers.getAddress(address);
  } catch {
    return null;
  }
}

/**
 * Validate subdomain format (RFC 1035 compliant)
 */
export function isValidSubdomain(subdomain) {
  if (!subdomain || typeof subdomain !== 'string') {
    return { valid: false, error: 'Subdomain is required' };
  }

  const normalized = subdomain.toLowerCase().trim();

  // Length check
  if (normalized.length < MIN_LABEL_LENGTH) {
    return { valid: false, error: 'Subdomain is too short' };
  }
  if (normalized.length > MAX_LABEL_LENGTH) {
    return { valid: false, error: `Subdomain exceeds ${MAX_LABEL_LENGTH} characters` };
  }

  // RFC 1035: Must start with letter or number, can contain hyphens, must end with letter or number
  // We allow starting with numbers for flexibility (e.g., "123", "42")
  const validPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!validPattern.test(normalized)) {
    return {
      valid: false,
      error: 'Subdomain can only contain letters, numbers, and hyphens (not at start/end)'
    };
  }

  // No consecutive hyphens (often used in punycode attacks)
  if (normalized.includes('--')) {
    return { valid: false, error: 'Subdomain cannot contain consecutive hyphens' };
  }

  // Check reserved names
  if (RESERVED_SUBDOMAINS.has(normalized)) {
    return { valid: false, error: 'This subdomain is reserved' };
  }

  // Check suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(normalized)) {
      return { valid: false, error: 'This subdomain is not allowed' };
    }
  }

  return { valid: true, normalized };
}

/**
 * Validate TLD exists and is active
 */
export async function isValidTLD(tld) {
  if (!tld || typeof tld !== 'string') {
    return { valid: false, error: 'TLD is required' };
  }

  const normalized = tld.toLowerCase().trim();

  // Basic format check (allow hyphens for TLDs like halcyon-domains)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
    return { valid: false, error: 'Invalid TLD format' };
  }

  if (normalized.length > MAX_LABEL_LENGTH) {
    return { valid: false, error: 'TLD is too long' };
  }

  // Check database (V1 first, then V2)
  try {
    const result = await query(
      'SELECT id, is_active FROM tlds WHERE name = $1',
      [normalized]
    );

    if (result.rows.length > 0) {
      if (!result.rows[0].is_active) {
        return { valid: false, error: 'TLD is not active' };
      }
      return { valid: true, normalized, tldId: result.rows[0].id };
    }

    // Fallback: check V2 tlds_v2
    const v2Result = await query(
      'SELECT id FROM tlds_v2 WHERE label = $1',
      [normalized]
    );

    if (v2Result.rows.length > 0) {
      return { valid: true, normalized, tldId: v2Result.rows[0].id, isV2: true };
    }

    return { valid: false, error: 'TLD not found' };
  } catch (error) {
    console.error('TLD validation error:', error.message);
    return { valid: false, error: 'Failed to validate TLD' };
  }
}

/**
 * Validate positive integer
 */
export function isValidPositiveInt(value, fieldName = 'Value') {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    return { valid: false, error: `${fieldName} must be a positive integer` };
  }

  return { valid: true, value: parsed };
}

/**
 * Validate token ID (bigint string or number)
 */
export function isValidTokenId(tokenId) {
  if (tokenId === undefined || tokenId === null) {
    return { valid: false, error: 'Token ID is required' };
  }

  try {
    const bigInt = BigInt(tokenId);
    if (bigInt < 0n) {
      return { valid: false, error: 'Token ID must be positive' };
    }
    return { valid: true, value: bigInt.toString() };
  } catch {
    return { valid: false, error: 'Invalid token ID format' };
  }
}

/**
 * Validate escrow ID
 */
export function isValidEscrowId(escrowId) {
  return isValidTokenId(escrowId); // Same format
}

/**
 * Validate DNS records object
 */
export function isValidDNSRecords(records) {
  if (!records || typeof records !== 'object') {
    return { valid: true, records: {} }; // Empty is OK
  }

  const validated = {};
  const errors = [];

  // IPv4 validation
  if (records.ipv4) {
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Pattern.test(records.ipv4)) {
      errors.push('Invalid IPv4 address format');
    } else {
      const parts = records.ipv4.split('.').map(Number);
      if (parts.some(p => p > 255)) {
        errors.push('Invalid IPv4 address');
      } else {
        validated.ipv4 = records.ipv4;
      }
    }
  }

  // IPv6 validation (simplified)
  if (records.ipv6) {
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^([0-9a-fA-F]{1,4}:)*:([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
    if (!ipv6Pattern.test(records.ipv6)) {
      errors.push('Invalid IPv6 address format');
    } else {
      validated.ipv6 = records.ipv6;
    }
  }

  // CNAME validation
  if (records.cname) {
    // Must be a valid hostname
    const cnamePattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\.?$/i;
    if (!cnamePattern.test(records.cname)) {
      errors.push('Invalid CNAME format');
    } else {
      validated.cname = records.cname.endsWith('.') ? records.cname : `${records.cname}.`;
    }
  }

  // TXT validation
  if (records.txt) {
    if (typeof records.txt !== 'string') {
      errors.push('TXT record must be a string');
    } else if (records.txt.length > 255) {
      errors.push('TXT record exceeds 255 characters');
    } else {
      validated.txt = records.txt;
    }
  }

  // TTL validation
  if (records.ttl !== undefined) {
    const ttl = parseInt(records.ttl, 10);
    if (isNaN(ttl) || ttl < 60 || ttl > 86400) {
      errors.push('TTL must be between 60 and 86400 seconds');
    } else {
      validated.ttl = ttl;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, records: validated };
}

/**
 * Sanitize string input (prevent injection)
 */
export function sanitizeString(input, maxLength = 255) {
  if (!input || typeof input !== 'string') return '';

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Basic XSS prevention
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}

// =============================================================
//                     EXPRESS MIDDLEWARE
// =============================================================

/**
 * Middleware: Validate subdomain and TLD from params or body
 */
export function validateDomain(source = 'params') {
  return async (req, res, next) => {
    const data = source === 'params' ? req.params : req.body;
    const { subdomain, tld } = data;

    // Validate subdomain
    const subdomainResult = isValidSubdomain(subdomain);
    if (!subdomainResult.valid) {
      return res.status(400).json({ error: subdomainResult.error });
    }

    // Validate TLD
    const tldResult = await isValidTLD(tld);
    if (!tldResult.valid) {
      return res.status(400).json({ error: tldResult.error });
    }

    // Attach validated values to request
    req.validatedDomain = {
      subdomain: subdomainResult.normalized,
      tld: tldResult.normalized,
      tldId: tldResult.tldId,
      fqdn: `${subdomainResult.normalized}.${tldResult.normalized}`,
    };

    next();
  };
}

/**
 * Middleware: Validate wallet address from body
 */
export function validateWallet(fieldName = 'wallet') {
  return (req, res, next) => {
    const wallet = req.body[fieldName];

    if (!wallet) {
      return res.status(400).json({ error: `${fieldName} is required` });
    }

    if (!isValidAddress(wallet)) {
      return res.status(400).json({ error: `Invalid ${fieldName} address` });
    }

    req.body[fieldName] = normalizeAddress(wallet);
    next();
  };
}

/**
 * Middleware: Validate DNS records from body
 */
export function validateDNS(req, res, next) {
  const { records } = req.body;

  const result = isValidDNSRecords(records);
  if (!result.valid) {
    return res.status(400).json({ error: 'Invalid DNS records', details: result.errors });
  }

  req.body.records = result.records;
  next();
}

/**
 * Middleware: Validate registration completion data
 */
export function validateRegistration(req, res, next) {
  const { escrowId, tokenId, subdomain, tld } = req.body;
  const errors = [];

  // Validate escrowId
  const escrowResult = isValidEscrowId(escrowId);
  if (!escrowResult.valid) {
    errors.push(`escrowId: ${escrowResult.error}`);
  }

  // Validate tokenId
  const tokenResult = isValidTokenId(tokenId);
  if (!tokenResult.valid) {
    errors.push(`tokenId: ${tokenResult.error}`);
  }

  // Validate subdomain
  const subdomainResult = isValidSubdomain(subdomain);
  if (!subdomainResult.valid) {
    errors.push(`subdomain: ${subdomainResult.error}`);
  }

  // TLD will be validated separately
  if (!tld) {
    errors.push('tld: TLD is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Normalize values
  req.body.escrowId = escrowResult.value;
  req.body.tokenId = tokenResult.value;
  req.body.subdomain = subdomainResult.normalized;

  next();
}

/**
 * Middleware: Validate URL forward data from body
 */
export function validateUrlForward(req, res, next) {
  const { target_url, redirect_type, path_forwarding, enabled } = req.body;

  if (!target_url || typeof target_url !== 'string') {
    return res.status(400).json({ error: 'target_url is required' });
  }

  // Validate URL format
  try {
    const url = new URL(target_url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return res.status(400).json({ error: 'target_url must use http or https protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'target_url must be a valid URL' });
  }

  if (target_url.length > 2048) {
    return res.status(400).json({ error: 'target_url exceeds maximum length of 2048 characters' });
  }

  // Validate redirect_type
  if (redirect_type !== undefined && redirect_type !== 301 && redirect_type !== 302) {
    return res.status(400).json({ error: 'redirect_type must be 301 or 302' });
  }

  // Normalize values
  req.body.redirect_type = redirect_type || 301;
  req.body.path_forwarding = !!path_forwarding;
  req.body.enabled = enabled !== false;

  next();
}

/**
 * Middleware: Validate contenthash (IPFS CID) from body
 */
export function validateContenthash(req, res, next) {
  const { cid } = req.body;

  if (!cid || typeof cid !== 'string') {
    return res.status(400).json({ error: 'cid is required' });
  }

  const trimmed = cid.trim();

  // IPFS CIDv0 (Qm...) or CIDv1 (bafy...)
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,})$/.test(trimmed)) {
    return res.status(400).json({ error: 'Invalid IPFS CID format. Must be CIDv0 (Qm...) or CIDv1 (bafy...)' });
  }

  if (trimmed.length > 128) {
    return res.status(400).json({ error: 'CID exceeds maximum length' });
  }

  req.body.cid = trimmed;
  next();
}

/**
 * Middleware: Validate profile settings from body
 */
export function validateProfileSettings(req, res, next) {
  const { bio, layout, primary_color, bg_color, domain_mode } = req.body;

  if (bio !== undefined && bio !== null) {
    if (typeof bio !== 'string') {
      return res.status(400).json({ error: 'bio must be a string' });
    }
    if (bio.length > 500) {
      return res.status(400).json({ error: 'bio exceeds maximum length of 500 characters' });
    }
  }

  const validLayouts = ['standard', 'minimal', 'card'];
  if (layout !== undefined && !validLayouts.includes(layout)) {
    return res.status(400).json({ error: `layout must be one of: ${validLayouts.join(', ')}` });
  }

  const colorPattern = /^#[0-9a-fA-F]{6}$/;
  if (primary_color !== undefined && primary_color !== '' && !colorPattern.test(primary_color)) {
    return res.status(400).json({ error: 'primary_color must be a valid hex color (#RRGGBB)' });
  }
  if (bg_color !== undefined && bg_color !== '' && !colorPattern.test(bg_color)) {
    return res.status(400).json({ error: 'bg_color must be a valid hex color (#RRGGBB)' });
  }

  const validModes = ['redirect', 'profile'];
  if (domain_mode !== undefined && !validModes.includes(domain_mode)) {
    return res.status(400).json({ error: `domain_mode must be one of: ${validModes.join(', ')}` });
  }

  next();
}

export default {
  isValidAddress,
  normalizeAddress,
  isValidSubdomain,
  isValidTLD,
  isValidPositiveInt,
  isValidTokenId,
  isValidEscrowId,
  isValidDNSRecords,
  sanitizeString,
  validateDomain,
  validateWallet,
  validateDNS,
  validateRegistration,
  validateUrlForward,
  validateContenthash,
  validateProfileSettings,
};
