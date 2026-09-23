import { query } from '../db/index.js';

/**
 * Shared V1→V2 domain lookup helpers.
 *
 * Every function tries V1 tables first (`domains`, `tlds`) and falls back
 * to V2 tables (`slds_v2`, `tlds_v2`).  The returned objects are normalised
 * so callers don't need to know which table the data came from.
 *
 * The `source` field ('v1' | 'v2') is always included.
 */

// ---------------------------------------------------------------------------
// findDomainByFqdn
// ---------------------------------------------------------------------------

/**
 * Look up a single domain by its FQDN.
 *
 * Returns a normalised object:
 *   { id, fqdn, subdomain, tld_name, owner_wallet, token_id,
 *     nft_image_cid, nft_status, tld_id, source }
 *
 * Returns null if not found in either table.
 */
export async function findDomainByFqdn(fqdn) {
  const normalized = fqdn.toLowerCase();

  // --- V1 ---
  const v1 = await query(
    `SELECT d.*, t.name AS tld_name
     FROM domains d
     JOIN tlds t ON d.tld_id = t.id
     WHERE d.fqdn = $1`,
    [normalized],
  );
  if (v1.rows.length > 0) {
    const r = v1.rows[0];
    return {
      ...r,
      subdomain: r.subdomain,
      owner_wallet: r.owner_wallet,
      source: 'v1',
    };
  }

  // --- V2 ---
  const v2 = await query(
    `SELECT s.id, s.token_id, s.label AS subdomain, s.full_name AS fqdn,
            s.owner_address AS owner_wallet, s.namehash, s.tld_id,
            s.registration_time, s.expiry_time, s.resolver_address,
            t.label AS tld_name,
            a.ipfs_cid AS nft_image_cid, a.status AS nft_status
     FROM slds_v2 s
     JOIN tlds_v2 t ON t.id = s.tld_id
     LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id AND a.status = 'completed'
     WHERE s.full_name = $1
     ORDER BY a.completed_at DESC NULLS LAST
     LIMIT 1`,
    [normalized],
  );
  if (v2.rows.length > 0) {
    return { ...v2.rows[0], source: 'v2' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// verifyDomainOwnership
// ---------------------------------------------------------------------------

/**
 * Return the domain row only if `walletAddress` is the owner.
 * Returns null if the domain doesn't exist or the wallet doesn't own it.
 */
export async function verifyDomainOwnership(fqdn, walletAddress) {
  const domain = await findDomainByFqdn(fqdn);
  if (!domain) return null;

  if (domain.owner_wallet.toLowerCase() !== walletAddress.toLowerCase()) {
    return null;
  }
  return domain;
}

// ---------------------------------------------------------------------------
// findTldByName
// ---------------------------------------------------------------------------

/**
 * Look up a TLD by its name/label.
 *
 * Returns: { id, name, source, ...extra columns }
 * Returns null if not found.
 */
export async function findTldByName(tldName) {
  const normalized = tldName.toLowerCase();

  // --- V1 ---
  const v1 = await query(
    `SELECT * FROM tlds WHERE name = $1`,
    [normalized],
  );
  if (v1.rows.length > 0) {
    return { ...v1.rows[0], name: v1.rows[0].name, source: 'v1' };
  }

  // --- V2 ---
  const v2 = await query(
    `SELECT t.*, p.length_prices, p.multi_year_discounts
     FROM tlds_v2 t
     LEFT JOIN tld_pricing_v2 p ON p.tld_id = t.id
     WHERE t.label = $1`,
    [normalized],
  );
  if (v2.rows.length > 0) {
    const r = v2.rows[0];
    return { ...r, name: r.label, source: 'v2' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// getDomainsByOwner
// ---------------------------------------------------------------------------

/**
 * Get all domains owned by a wallet — combined V1 + V2.
 * Each row includes `source`.
 */
export async function getDomainsByOwner(walletAddress) {
  const wallet = walletAddress.toLowerCase();

  const [v1, v2] = await Promise.all([
    query(
      `SELECT d.*, t.name AS tld_name
       FROM domains d
       JOIN tlds t ON d.tld_id = t.id
       WHERE LOWER(d.owner_wallet) = $1
       ORDER BY d.created_at DESC`,
      [wallet],
    ),
    query(
      `SELECT s.id, s.token_id, s.label AS subdomain, s.full_name AS fqdn,
              s.owner_address AS owner_wallet, s.namehash, s.tld_id,
              s.registration_time, s.expiry_time, s.resolver_address,
              t.label AS tld_name,
              a.ipfs_cid AS nft_image_cid, a.status AS nft_status
       FROM slds_v2 s
       JOIN tlds_v2 t ON t.id = s.tld_id
       LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id AND a.status = 'completed'
       WHERE LOWER(s.owner_address) = $1
       ORDER BY s.created_at DESC`,
      [wallet],
    ),
  ]);

  const v1Rows = v1.rows.map(r => ({ ...r, source: 'v1' }));
  const v2Rows = v2.rows.map(r => ({ ...r, source: 'v2' }));

  // De-duplicate: if the same fqdn appears in both, prefer V2
  const seen = new Set();
  const combined = [];
  for (const row of v2Rows) {
    seen.add(row.fqdn);
    combined.push(row);
  }
  for (const row of v1Rows) {
    if (!seen.has(row.fqdn)) {
      combined.push(row);
    }
  }
  return combined;
}

// ---------------------------------------------------------------------------
// checkAvailability
// ---------------------------------------------------------------------------

/**
 * Check if a domain (fqdn) is already registered in either V1 or V2.
 *
 * Returns: { available: boolean, owner?: string, tokenId?: number, source?: string }
 */
export async function checkAvailability(fqdn) {
  const normalized = fqdn.toLowerCase();

  // --- V1 ---
  const v1 = await query(
    'SELECT owner_wallet, token_id FROM domains WHERE fqdn = $1',
    [normalized],
  );
  if (v1.rows.length > 0) {
    return {
      available: false,
      owner: v1.rows[0].owner_wallet,
      tokenId: v1.rows[0].token_id,
      source: 'v1',
    };
  }

  // --- V2 ---
  const v2 = await query(
    'SELECT owner_address AS owner_wallet, token_id FROM slds_v2 WHERE full_name = $1',
    [normalized],
  );
  if (v2.rows.length > 0) {
    return {
      available: false,
      owner: v2.rows[0].owner_wallet,
      tokenId: v2.rows[0].token_id,
      source: 'v2',
    };
  }

  return { available: true };
}

// ---------------------------------------------------------------------------
// findDomainOwnerForAuth
// ---------------------------------------------------------------------------

/**
 * Lightweight ownership check — returns { id, owner_wallet, token_id, source }
 * or null.  Faster than findDomainByFqdn because it skips artwork JOINs.
 */
export async function findDomainOwnerForAuth(fqdn) {
  const normalized = fqdn.toLowerCase();

  const v1 = await query(
    'SELECT id, owner_wallet, token_id FROM domains WHERE fqdn = $1',
    [normalized],
  );
  if (v1.rows.length > 0) {
    return { ...v1.rows[0], source: 'v1' };
  }

  const v2 = await query(
    'SELECT id, owner_address AS owner_wallet, token_id FROM slds_v2 WHERE full_name = $1',
    [normalized],
  );
  if (v2.rows.length > 0) {
    return { ...v2.rows[0], source: 'v2' };
  }

  return null;
}
