import { Router } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { query } from '../db/index.js';
import config from '../config/index.js';
import ftsoService from '../services/ftso.js';
import hsdClient from '../services/hsdClient.js';
import hnsService from '../services/hns.js';
import auth from '../middleware/auth.js';
import { loggers } from '../utils/logger.js';

const log = loggers.api;
const router = Router();

const TLD_CLAIM_MANAGER_ABI = ['function stakingFeeUsd() view returns (uint256)'];
let stakingFeeCache = { feeUsdCents: null, ts: 0 };

function sendError(res, error, statusCode = 500, userMessage) {
  log.error({ err: error, statusCode }, userMessage || 'Request failed');
  res.status(statusCode).json({ error: userMessage || 'Internal error' });
}

// =============================================================
//                        SEARCH
// =============================================================

/**
 * GET /search?q=alice&tld=coolname
 * Availability check + price + suggestions
 */
router.get('/search', async (req, res) => {
  try {
    const { q, tld } = req.query;
    if (!q || typeof q !== 'string' || q.length < 1) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const label = q.toLowerCase().trim();

    // Validate label format
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      return res.status(400).json({ error: 'Invalid label format' });
    }

    // If tld specified, check single TLD; otherwise check all active TLDs
    let tldFilter = '';
    const params = [label];

    if (tld) {
      tldFilter = 'AND t.label = $2';
      params.push(tld.toLowerCase().trim());
    }

    // Find matching TLDs and check availability
    const result = await query(`
      SELECT
        t.id AS tld_id,
        t.label AS tld_label,
        t.namehash AS tld_namehash,
        t.registration_enabled,
        p.length_prices,
        p.multi_year_discounts,
        s.id AS sld_id,
        s.owner_address,
        s.expiry_time
      FROM tlds_v2 t
      LEFT JOIN tld_pricing_v2 p ON p.tld_id = t.id
      LEFT JOIN slds_v2 s ON s.tld_id = t.id AND s.label = $1
      WHERE t.registration_enabled = true ${tldFilter}
      ORDER BY t.label ASC
      LIMIT 20
    `, params);

    // Get FLR price for conversion
    let flrPriceUsd = null;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUsd = priceData.price;
    } catch { /* price unavailable */ }

    const results = result.rows.map(row => {
      const available = !row.sld_id || new Date(row.expiry_time) < new Date();
      const priceUsdCents = getPriceForLabel(label, row.length_prices);
      const priceFlr = flrPriceUsd && priceUsdCents
        ? (priceUsdCents / 100) / flrPriceUsd
        : null;

      return {
        fullName: `${label}.${row.tld_label}`,
        tld: row.tld_label,
        label,
        available,
        owner: available ? null : row.owner_address,
        expiry: available ? null : row.expiry_time,
        price: {
          usdCents: priceUsdCents,
          flr: priceFlr ? parseFloat(priceFlr.toFixed(2)) : null,
        },
      };
    });

    // Generate suggestions if exact match is taken
    const suggestions = [];
    if (tld && results.length > 0 && !results[0].available && label.length > 2) {
      const prefixes = [label + 's', label + 'x', 'my' + label, label + '0'];
      for (const alt of prefixes) {
        if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(alt)) {
          suggestions.push(alt);
        }
      }
    }

    res.json({ query: label, tld: tld || null, results, suggestions, flrPriceUsd });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                          TLDS
// =============================================================

/**
 * GET /tlds — list all active TLDs with registration counts, pricing
 */
router.get('/tlds', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        t.id, t.token_id, t.label, t.namehash, t.owner_address,
        t.registration_enabled, t.strategy_address, t.resolver_address,
        t.is_official, t.display_name, t.created_at,
        p.length_prices, p.multi_year_discounts,
        COUNT(s.id) AS sld_count
      FROM tlds_v2 t
      LEFT JOIN tld_pricing_v2 p ON p.tld_id = t.id
      LEFT JOIN slds_v2 s ON s.tld_id = t.id
      GROUP BY t.id, p.tld_id, p.length_prices, p.multi_year_discounts
      ORDER BY t.label ASC
    `);

    const tlds = result.rows.map(row => ({
      tokenId: row.token_id,
      label: row.label,
      displayName: row.display_name || null,
      namehash: row.namehash,
      owner: row.owner_address,
      isOfficial: row.is_official || false,
      registrationEnabled: row.registration_enabled,
      sldCount: parseInt(row.sld_count),
      pricing: row.length_prices ? {
        lengthPricesUsdCents: row.length_prices,
        multiYearDiscounts: row.multi_year_discounts,
      } : null,
      createdAt: row.created_at,
    }));

    // flrPriceUsd omitted — frontend uses /v2/price/flr-rate separately
    res.json({ tlds, count: tlds.length });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /tld/:tldLabel — TLD details with pricing config and SLD count
 */
router.get('/tld/:tldLabel', async (req, res) => {
  try {
    const label = req.params.tldLabel.toLowerCase();

    const result = await query(`
      SELECT
        t.id, t.token_id, t.label, t.namehash, t.owner_address,
        t.registration_enabled, t.strategy_address, t.resolver_address,
        t.display_name, t.description, t.logo_url,
        t.created_at, t.updated_at,
        p.length_prices, p.multi_year_discounts,
        COUNT(s.id) AS sld_count
      FROM tlds_v2 t
      LEFT JOIN tld_pricing_v2 p ON p.tld_id = t.id
      LEFT JOIN slds_v2 s ON s.tld_id = t.id
      WHERE t.label = $1
      GROUP BY t.id, p.tld_id, p.length_prices, p.multi_year_discounts
    `, [label]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'TLD not found' });
    }

    const row = result.rows[0];

    // Get premium and reserved names
    const [premiums, reserved] = await Promise.all([
      query('SELECT label, price_usd_cents FROM premium_names_v2 WHERE tld_id = $1', [row.id]),
      query('SELECT label, reserved_for FROM reserved_names_v2 WHERE tld_id = $1', [row.id]),
    ]);

    res.json({
      tokenId: row.token_id,
      label: row.label,
      displayName: row.display_name || null,
      description: row.description || null,
      logoUrl: row.logo_url || null,
      namehash: row.namehash,
      owner: row.owner_address,
      registrationEnabled: row.registration_enabled,
      strategyAddress: row.strategy_address,
      resolverAddress: row.resolver_address,
      sldCount: parseInt(row.sld_count),
      pricing: row.length_prices ? {
        lengthPricesUsdCents: row.length_prices,
        multiYearDiscounts: row.multi_year_discounts,
      } : null,
      premiumNames: premiums.rows,
      reservedNames: reserved.rows,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                          SLDS
// =============================================================

/**
 * GET /sld/:fullName — SLD details (e.g., /sld/alice.cryptofans)
 */
router.get('/sld/:fullName', async (req, res) => {
  try {
    const fullName = req.params.fullName.toLowerCase();
    const dotIndex = fullName.indexOf('.');
    if (dotIndex < 1) {
      return res.status(400).json({ error: 'Invalid domain format. Use label.tld' });
    }

    const result = await query(`
      SELECT
        s.id, s.token_id, s.label, s.namehash, s.full_name,
        s.owner_address, s.registration_time, s.expiry_time,
        s.registration_price_usd_cents, s.resolver_address,
        s.created_at, s.updated_at,
        t.label AS tld_label, t.namehash AS tld_namehash,
        a.status AS artwork_status, a.ipfs_cid AS artwork_cid,
        a.generation_time_ms AS artwork_time_ms
      FROM slds_v2 s
      JOIN tlds_v2 t ON t.id = s.tld_id
      LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id
      WHERE s.full_name = $1
    `, [fullName]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SLD not found' });
    }

    const row = result.rows[0];
    res.json({
      tokenId: row.token_id,
      label: row.label,
      tld: row.tld_label,
      fullName: row.full_name,
      namehash: row.namehash,
      owner: row.owner_address,
      registrationTime: row.registration_time,
      expiryTime: row.expiry_time,
      registrationPriceUsdCents: row.registration_price_usd_cents,
      resolverAddress: row.resolver_address,
      artwork: {
        status: row.artwork_status || 'none',
        ipfsCid: row.artwork_cid || null,
        imageUrl: row.artwork_cid ? `https://gateway.pinata.cloud/ipfs/${row.artwork_cid}` : null,
        generationTimeMs: row.artwork_time_ms,
      },
      createdAt: row.created_at,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                        PRICING
// =============================================================

/**
 * GET /price/flr-rate — current FLR/USD rate from FTSO
 */
router.get('/price/flr-rate', async (req, res) => {
  try {
    const priceData = await ftsoService.getFLRPrice();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      flrPriceUsd: priceData.price,
      source: priceData.source || 'ftso',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({ error: 'Price feed unavailable', flrPriceUsd: null });
  }
});

/**
 * GET /price/:tldLabel/:label/:years — price quote in USD and FLR
 */
router.get('/price/:tldLabel/:label/:years', async (req, res) => {
  try {
    const tldLabel = req.params.tldLabel.toLowerCase();
    const label = req.params.label.toLowerCase();
    const years = parseInt(req.params.years);

    if (!years || years < 1 || years > 10) {
      return res.status(400).json({ error: 'Years must be 1-10' });
    }

    // Get TLD pricing
    const tldResult = await query(`
      SELECT t.id, p.length_prices, p.multi_year_discounts
      FROM tlds_v2 t
      JOIN tld_pricing_v2 p ON p.tld_id = t.id
      WHERE t.label = $1
    `, [tldLabel]);

    if (tldResult.rows.length === 0) {
      return res.status(404).json({ error: 'TLD not found or no pricing configured' });
    }

    const { id: tldId, length_prices, multi_year_discounts } = tldResult.rows[0];

    // Check for premium price override
    const premiumResult = await query(
      'SELECT price_usd_cents FROM premium_names_v2 WHERE tld_id = $1 AND label = $2',
      [tldId, label]
    );

    // Check if reserved
    const reservedResult = await query(
      'SELECT reserved_for FROM reserved_names_v2 WHERE tld_id = $1 AND label = $2',
      [tldId, label]
    );

    if (reservedResult.rows.length > 0) {
      return res.json({
        tld: tldLabel,
        label,
        years,
        reserved: true,
        reservedFor: reservedResult.rows[0].reserved_for,
      });
    }

    // Calculate price
    let pricePerYearUsdCents;
    if (premiumResult.rows.length > 0) {
      pricePerYearUsdCents = premiumResult.rows[0].price_usd_cents;
    } else {
      pricePerYearUsdCents = getPriceForLabel(label, length_prices);
    }

    // Apply multi-year discount (basis points)
    let discountBps = 0;
    if (multi_year_discounts && years >= 2 && years <= 10) {
      discountBps = multi_year_discounts[years - 1] || 0;
    }

    const totalUsdCents = pricePerYearUsdCents * years;
    const discountAmount = Math.floor(totalUsdCents * discountBps / 10000);
    const finalUsdCents = totalUsdCents - discountAmount;

    // Convert to FLR
    let flrAmount = null;
    let flrPriceUsd = null;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUsd = priceData.price;
      flrAmount = parseFloat(((finalUsdCents / 100) / flrPriceUsd).toFixed(2));
    } catch { /* price unavailable */ }

    res.json({
      tld: tldLabel,
      label,
      years,
      premium: premiumResult.rows.length > 0,
      pricePerYearUsdCents,
      discountBps,
      totalUsdCents,
      discountAmount,
      finalUsdCents,
      flrAmount,
      flrPriceUsd,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                      RESOLUTION
// =============================================================

/**
 * GET /resolve/:fullName — resolve domain to on-chain records
 */
router.get('/resolve/:fullName', async (req, res) => {
  try {
    const fullName = req.params.fullName.toLowerCase();

    const result = await query(`
      SELECT s.token_id, s.owner_address, s.expiry_time, s.resolver_address,
             s.full_name, t.label AS tld_label
      FROM slds_v2 s
      JOIN tlds_v2 t ON t.id = s.tld_id
      WHERE s.full_name = $1 AND s.expiry_time > NOW()
    `, [fullName]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found or expired' });
    }

    const row = result.rows[0];
    res.json({
      fullName: row.full_name,
      tld: row.tld_label,
      owner: row.owner_address,
      tokenId: row.token_id,
      expiryTime: row.expiry_time,
      resolverAddress: row.resolver_address,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /reverse/:address — reverse lookup: address → primary domain
 */
router.get('/reverse/:address', async (req, res) => {
  try {
    const address = req.params.address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    const result = await query(`
      SELECT s.full_name, s.token_id, s.expiry_time, t.label AS tld_label
      FROM slds_v2 s
      JOIN tlds_v2 t ON t.id = s.tld_id
      WHERE s.owner_address = $1 AND s.expiry_time > NOW()
      ORDER BY s.registration_time ASC
      LIMIT 10
    `, [address.toLowerCase()]);

    res.json({
      address,
      primaryName: result.rows[0]?.full_name || null,
      domains: result.rows.map(r => ({
        fullName: r.full_name,
        tld: r.tld_label,
        tokenId: r.token_id,
        expiryTime: r.expiry_time,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                        STATS
// =============================================================

/**
 * GET /stats — platform stats
 */
router.get('/stats', async (req, res) => {
  try {
    const [tldCount, sldCount, eventStats] = await Promise.all([
      query('SELECT COUNT(*) AS count FROM tlds_v2'),
      query('SELECT COUNT(*) AS count FROM slds_v2'),
      query(`
        SELECT
          COUNT(*) AS total_events,
          SUM(CASE WHEN event_type = 'register' THEN 1 ELSE 0 END) AS registrations,
          SUM(CASE WHEN event_type = 'renew' THEN 1 ELSE 0 END) AS renewals,
          COALESCE(SUM(flr_amount), 0) AS total_flr_volume,
          COALESCE(SUM(usd_amount), 0) AS total_usd_volume
        FROM registration_events_v2
      `),
    ]);

    const stats = eventStats.rows[0];

    res.json({
      totalTlds: parseInt(tldCount.rows[0].count),
      totalSlds: parseInt(sldCount.rows[0].count),
      totalRegistrations: parseInt(stats.registrations || 0),
      totalRenewals: parseInt(stats.renewals || 0),
      volume: {
        flr: parseFloat(stats.total_flr_volume || 0),
        usd: parseFloat(stats.total_usd_volume || 0),
      },
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                       ARTWORK
// =============================================================

/**
 * GET /artwork/:tokenId — artwork status and IPFS URL
 */
router.get('/artwork/:tokenId', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    if (isNaN(tokenId)) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }

    const result = await query(`
      SELECT a.status, a.ipfs_cid, a.prompt, a.seed, a.gpu_worker,
             a.generation_time_ms, a.attempts, a.created_at, a.completed_at,
             s.full_name, s.label, t.label AS tld_label
      FROM sld_artwork_v2 a
      JOIN slds_v2 s ON s.id = a.sld_id
      JOIN tlds_v2 t ON t.id = s.tld_id
      WHERE a.token_id = $1
    `, [tokenId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Artwork not found for this token' });
    }

    const row = result.rows[0];
    res.json({
      tokenId,
      fullName: row.full_name,
      status: row.status,
      ipfsCid: row.ipfs_cid,
      imageUrl: row.ipfs_cid ? `https://gateway.pinata.cloud/ipfs/${row.ipfs_cid}` : null,
      seed: row.seed,
      gpuWorker: row.gpu_worker,
      generationTimeMs: row.generation_time_ms,
      attempts: row.attempts,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                   NFT METADATA
// =============================================================

/**
 * GET /metadata/sld/:tokenId — ERC-721 tokenURI metadata JSON for SLD NFTs
 * This is the endpoint that on-chain tokenURI points to.
 */
router.get('/metadata/sld/:tokenId', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    if (isNaN(tokenId)) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }

    const result = await query(`
      SELECT s.token_id, s.label, s.full_name, s.namehash,
             s.owner_address, s.registration_time, s.expiry_time,
             t.label AS tld_label,
             a.status AS artwork_status, a.ipfs_cid AS artwork_cid
      FROM slds_v2 s
      JOIN tlds_v2 t ON t.id = s.tld_id
      LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id
      WHERE s.token_id = $1
    `, [tokenId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const row = result.rows[0];
    const artworkGenerated = row.artwork_status === 'completed' && row.artwork_cid;
    const imageUrl = artworkGenerated
      ? `ipfs://${row.artwork_cid}`
      : `${req.protocol}://${req.get('host')}/api/v2/placeholder/${row.full_name}`;

    const regTimestamp = Math.floor(new Date(row.registration_time).getTime() / 1000);
    const expTimestamp = Math.floor(new Date(row.expiry_time).getTime() / 1000);

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      name: row.full_name,
      description: `Halcyon Subdomain Registry — ${row.full_name} on Flare Network`,
      image: imageUrl,
      external_url: `https://dev.halcyon-names.io/profile/${row.full_name}`,
      attributes: [
        { trait_type: 'TLD', value: row.tld_label },
        { trait_type: 'Label', value: row.label },
        { trait_type: 'Length', display_type: 'number', value: row.label.length },
        { trait_type: 'Registration Date', display_type: 'date', value: regTimestamp },
        { trait_type: 'Expiry Date', display_type: 'date', value: expTimestamp },
        { trait_type: 'Artwork Generated', value: artworkGenerated ? 'Yes' : 'Pending' },
      ],
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /metadata/tld/:tokenId — ERC-721 tokenURI metadata JSON for TLD NFTs
 */
router.get('/metadata/tld/:tokenId', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    if (isNaN(tokenId)) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }

    const result = await query(`
      SELECT t.token_id, t.label, t.namehash, t.owner_address,
             t.registration_enabled, t.created_at,
             COUNT(s.id) AS sld_count
      FROM tlds_v2 t
      LEFT JOIN slds_v2 s ON s.tld_id = t.id
      WHERE t.token_id = $1
      GROUP BY t.id
    `, [tokenId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'TLD token not found' });
    }

    const row = result.rows[0];
    const createdTimestamp = Math.floor(new Date(row.created_at).getTime() / 1000);

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      name: row.label,
      description: `Halcyon TLD — .${row.label} on Flare Network. Handshake top-level domain staked via FDC verification.`,
      image: `${req.protocol}://${req.get('host')}/api/v2/placeholder/${row.label}`,
      external_url: `https://halcyon.domains/tld/${row.label}`,
      attributes: [
        { trait_type: 'Type', value: 'TLD' },
        { trait_type: 'Label', value: row.label },
        { trait_type: 'Length', display_type: 'number', value: row.label.length },
        { trait_type: 'Registration Enabled', value: row.registration_enabled ? 'Yes' : 'No' },
        { trait_type: 'Subdomains Registered', display_type: 'number', value: parseInt(row.sld_count) },
        { trait_type: 'Created', display_type: 'date', value: createdTimestamp },
      ],
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                   COMMIT-REVEAL
// =============================================================

/**
 * POST /commit — generate commit hash for commit-reveal registration
 * Body: { label, tldNamehash, owner }
 * Returns: { commitHash, secret } — user stores secret, submits commitHash on-chain
 */
router.post('/commit', async (req, res) => {
  try {
    const { label, tldNamehash, owner } = req.body;

    if (!label || !tldNamehash || !owner) {
      return res.status(400).json({ error: 'label, tldNamehash, and owner are required' });
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
      return res.status(400).json({ error: 'Invalid owner address' });
    }

    // Generate random secret
    const secret = '0x' + crypto.randomBytes(32).toString('hex');

    // Compute commit hash: keccak256(abi.encodePacked(label, tldNamehash, owner, secret))
    const commitHash = ethers.keccak256(
      ethers.solidityPacked(
        ['string', 'bytes32', 'address', 'bytes32'],
        [label, tldNamehash, owner, secret]
      )
    );

    res.json({ commitHash, secret, label, tldNamehash, owner });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                    PLACEHOLDER SVG
// =============================================================

/**
 * GET /placeholder/:fullName — deterministic SVG placeholder image
 */
router.get('/placeholder/:fullName', (req, res) => {
  const fullName = req.params.fullName.toLowerCase();
  const hash = crypto.createHash('sha256').update(fullName).digest('hex');

  // Extract colors and shapes from hash
  const hue1 = parseInt(hash.substring(0, 2), 16) * 1.41; // 0-360
  const hue2 = (hue1 + 120) % 360;
  const hue3 = (hue1 + 240) % 360;
  const shapes = [];

  for (let i = 0; i < 6; i++) {
    const offset = i * 8;
    const x = parseInt(hash.substring(offset, offset + 2), 16) % 200 + 50;
    const y = parseInt(hash.substring(offset + 2, offset + 4), 16) % 200 + 50;
    const r = parseInt(hash.substring(offset + 4, offset + 6), 16) % 40 + 15;
    const opacity = (parseInt(hash.substring(offset + 6, offset + 8), 16) % 40 + 20) / 100;
    shapes.push({ x, y, r, opacity });
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue1}, 60%, 15%)"/>
      <stop offset="100%" stop-color="hsl(${hue2}, 50%, 10%)"/>
    </linearGradient>
  </defs>
  <rect width="300" height="300" fill="url(#bg)"/>
  ${shapes.map((s, i) => `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="hsl(${(hue3 + i * 30) % 360}, 70%, 55%)" opacity="${s.opacity}"/>`).join('\n  ')}
  <text x="150" y="260" text-anchor="middle" fill="white" font-family="monospace" font-size="14" opacity="0.8">${fullName.length > 25 ? fullName.substring(0, 22) + '...' : fullName}</text>
</svg>`;

  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

// =============================================================
//                  TLD VERIFY (HSD)
// =============================================================

/**
 * GET /tld/verify/:tldLabel?address=0x...
 * Pre-validation for FDC staking (same as v1 but mounted under v2 too)
 */
router.get('/tld/verify/:tldLabel', async (req, res) => {
  try {
    const { tldLabel } = req.params;
    const { address } = req.query;

    if (!tldLabel || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(tldLabel.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid TLD label' });
    }

    if (address) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid Flare address' });
      }
      const result = await hsdClient.verifyTldOwnership(tldLabel, address);
      const flareAddress = await hsdClient.getFlareAddress(tldLabel);
      // Flatten response so frontend gets state, expired, etc. at top level
      const daysUntilExpire = result.data?.stats?.daysUntilExpire ?? 0;
      return res.json({
        ...result.data,
        expired: daysUntilExpire <= 0,
        flareAddress,
        isOwner: result.valid,
        verifyReason: result.reason,
      });
    }

    const info = await hsdClient.getNameInfo(tldLabel);
    if (!info.success) {
      return res.status(404).json({ error: info.error });
    }

    const flareAddress = await hsdClient.getFlareAddress(tldLabel);
    const daysUntilExpire = info.data?.stats?.daysUntilExpire ?? 0;
    res.json({ ...info.data, expired: daysUntilExpire <= 0, flareAddress });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//               TLD TX STATUS (MEMPOOL CHECK)
// =============================================================

/**
 * GET /tld/tx-status/:tldLabel
 * Check if there's a pending (unconfirmed) UPDATE transaction for this TLD.
 * Used by the stake page to show "TX pending" instead of "no TXT record".
 */
router.get('/tld/tx-status/:tldLabel', async (req, res) => {
  try {
    const { tldLabel } = req.params;

    if (!tldLabel || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(tldLabel.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid TLD label' });
    }

    const result = await hnsService.getPendingUpdateForName(tldLabel.toLowerCase());
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                       STAKING
// =============================================================

/**
 * GET /staking/fee — current TLD staking fee in USD + FLR
 * Reads stakingFeeUsd() from TldClaimManager with 5-min cache.
 */
router.get('/staking/fee', async (req, res) => {
  try {
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const now = Date.now();

    if (!stakingFeeCache.feeUsdCents || now - stakingFeeCache.ts > CACHE_TTL_MS) {
      const provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
      const contract = new ethers.Contract(
        config.contractsV2.tldClaimManager,
        TLD_CLAIM_MANAGER_ABI,
        provider
      );
      const feeRaw = await contract.stakingFeeUsd();
      // Contract stores fee in USD cents as uint256
      stakingFeeCache = { feeUsdCents: Number(feeRaw), ts: now };
    }

    const feeUsdCents = stakingFeeCache.feeUsdCents;
    let feeFlr = null;
    let flrPriceUsd = null;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUsd = priceData.price;
      feeFlr = parseFloat(((feeUsdCents / 100) / flrPriceUsd).toFixed(2));
    } catch { /* price unavailable */ }

    res.json({
      feeUsdCents,
      feeFlr,
      flrPriceUsd,
      contractAddress: config.contractsV2.tldClaimManager,
    });
  } catch (error) {
    sendError(res, error, 500, 'Failed to fetch staking fee');
  }
});

/**
 * GET /staking/status/:tldLabel — claim status for a TLD
 * Returns the most recent pending_claim for this label, or 'minted' if already in tlds_v2.
 */
router.get('/staking/status/:tldLabel', async (req, res) => {
  try {
    const tldLabel = req.params.tldLabel.toLowerCase();

    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(tldLabel)) {
      return res.status(400).json({ error: 'Invalid TLD label' });
    }

    // Check pending_claims
    const claimResult = await query(
      `SELECT id, tld_label, claimer_address, namehash, staking_fee_paid,
              fdc_round_id, status, tx_hash, created_at, completed_at, attempts, last_error
       FROM pending_claims
       WHERE tld_label = $1
       ORDER BY created_at DESC LIMIT 1`,
      [tldLabel]
    );

    if (claimResult.rows.length > 0) {
      const claim = claimResult.rows[0];
      return res.json({
        tldLabel,
        status: claim.status,
        claimerAddress: claim.claimer_address,
        namehash: claim.namehash,
        stakingFeePaid: claim.staking_fee_paid,
        fdcRoundId: claim.fdc_round_id,
        txHash: claim.tx_hash,
        createdAt: claim.created_at,
        completedAt: claim.completed_at,
        attempts: claim.attempts,
        lastError: claim.last_error,
      });
    }

    // Check if already minted in tlds_v2
    const tldResult = await query(
      'SELECT token_id, owner_address, created_at FROM tlds_v2 WHERE label = $1',
      [tldLabel]
    );

    if (tldResult.rows.length > 0) {
      const tld = tldResult.rows[0];
      return res.json({
        tldLabel,
        status: 'minted',
        tokenId: tld.token_id,
        ownerAddress: tld.owner_address,
        mintedAt: tld.created_at,
      });
    }

    res.json({ tldLabel, status: 'none' });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /staking/my-claims — user's pending/completed TLD stakes
 * Auth: verifyWallet (wallet, signature, nonce in body)
 */
router.post('/staking/my-claims', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;

    const result = await query(
      `SELECT pc.id, pc.tld_label, pc.namehash, pc.staking_fee_paid,
              pc.fdc_round_id, pc.status, pc.tx_hash, pc.created_at,
              pc.completed_at, pc.attempts, pc.last_error,
              t.token_id, t.registration_enabled
       FROM pending_claims pc
       LEFT JOIN tlds_v2 t ON t.namehash = pc.namehash
       WHERE pc.claimer_address = $1
       ORDER BY pc.created_at DESC`,
      [wallet]
    );

    const claims = result.rows.map(row => ({
      id: row.id,
      tldLabel: row.tld_label,
      namehash: row.namehash,
      stakingFeePaid: row.staking_fee_paid,
      fdcRoundId: row.fdc_round_id,
      status: row.status,
      txHash: row.tx_hash,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      attempts: row.attempts,
      lastError: row.last_error,
      tokenId: row.token_id || null,
      registrationEnabled: row.registration_enabled || false,
    }));

    res.json({ wallet, claims, count: claims.length });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                       RENEWAL
// =============================================================

/**
 * GET /renew/quote/:fullName/:years — renewal price using price-locked rate
 * Uses slds_v2.registration_price_usd_cents (the rate locked at registration).
 * No multi-year discount — matches contract behavior.
 */
router.get('/renew/quote/:fullName/:years', async (req, res) => {
  try {
    const fullName = req.params.fullName.toLowerCase();
    const years = parseInt(req.params.years);

    if (!years || years < 1 || years > 10) {
      return res.status(400).json({ error: 'Years must be 1-10' });
    }

    const dotIndex = fullName.indexOf('.');
    if (dotIndex < 1) {
      return res.status(400).json({ error: 'Invalid domain format. Use label.tld' });
    }

    const result = await query(
      `SELECT s.registration_price_usd_cents, s.expiry_time, s.owner_address,
              s.token_id, t.label AS tld_label
       FROM slds_v2 s
       JOIN tlds_v2 t ON t.id = s.tld_id
       WHERE s.full_name = $1`,
      [fullName]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const row = result.rows[0];
    const expiryTime = new Date(row.expiry_time);
    const now = new Date();
    const gracePeriodMs = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Check if past grace period
    if (expiryTime.getTime() + gracePeriodMs < now.getTime()) {
      return res.status(410).json({
        error: 'Domain expired beyond grace period',
        expiryTime: row.expiry_time,
        gracePeriodDays: 30,
      });
    }

    const pricePerYearUsdCents = row.registration_price_usd_cents;
    const totalUsdCents = pricePerYearUsdCents * years;

    // New expiry: max(currentExpiry, now) + years
    const base = expiryTime > now ? expiryTime : now;
    const newExpiryTime = new Date(base.getTime() + years * 365.25 * 24 * 60 * 60 * 1000);

    let flrAmount = null;
    let flrPriceUsd = null;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUsd = priceData.price;
      flrAmount = parseFloat(((totalUsdCents / 100) / flrPriceUsd).toFixed(2));
    } catch { /* price unavailable */ }

    res.json({
      fullName,
      tld: row.tld_label,
      years,
      owner: row.owner_address,
      tokenId: row.token_id,
      pricePerYearUsdCents,
      totalUsdCents,
      flrAmount,
      flrPriceUsd,
      currentExpiryTime: row.expiry_time,
      newExpiryTime: newExpiryTime.toISOString(),
      isExpired: expiryTime < now,
      contractAddress: config.contractsV2.sldRegistrationManager,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                     MY DOMAINS
// =============================================================

/**
 * POST /my-domains — user's V2 domains with expiry + artwork
 * Auth: verifyWallet (wallet, signature, nonce in body)
 */
router.post('/my-domains', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;

    const result = await query(
      `SELECT DISTINCT ON (s.id)
              s.id, s.token_id, s.label, s.full_name, s.namehash,
              s.registration_time, s.expiry_time, s.registration_price_usd_cents,
              s.resolver_address,
              t.label AS tld_label, t.namehash AS tld_namehash,
              a.status AS artwork_status, a.ipfs_cid AS artwork_cid,
              a.generation_time_ms AS artwork_time_ms
       FROM slds_v2 s
       JOIN tlds_v2 t ON t.id = s.tld_id
       LEFT JOIN sld_artwork_v2 a ON a.sld_id = s.id
       WHERE s.owner_address = $1
       ORDER BY s.id, a.created_at DESC`,
      [wallet]
    );

    const now = new Date();
    const gracePeriodMs = 30 * 24 * 60 * 60 * 1000;

    const domains = result.rows.map(row => {
      const expiry = new Date(row.expiry_time);
      const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const isExpired = expiry < now;
      const isInGracePeriod = isExpired && (expiry.getTime() + gracePeriodMs > now.getTime());

      return {
        tokenId: row.token_id,
        label: row.label,
        tld: row.tld_label,
        fullName: row.full_name,
        namehash: row.namehash,
        registrationTime: row.registration_time,
        expiryTime: row.expiry_time,
        daysUntilExpiry,
        isExpired,
        isInGracePeriod,
        registrationPriceUsdCents: row.registration_price_usd_cents,
        resolverAddress: row.resolver_address,
        artwork: {
          status: row.artwork_status || 'none',
          ipfsCid: row.artwork_cid || null,
          imageUrl: row.artwork_cid ? `https://gateway.pinata.cloud/ipfs/${row.artwork_cid}` : null,
          generationTimeMs: row.artwork_time_ms,
        },
      };
    });

    res.json({ wallet, domains, count: domains.length });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /my-domains/expiring — domains expiring within N days
 * Auth: verifyWallet (wallet, signature, nonce in body)
 * Query param: ?days=90 (default 90, max 365)
 */
router.post('/my-domains/expiring', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    let days = parseInt(req.query.days) || 90;
    if (days < 1) days = 1;
    if (days > 365) days = 365;

    const result = await query(
      `SELECT s.id, s.token_id, s.label, s.full_name, s.namehash,
              s.registration_time, s.expiry_time, s.registration_price_usd_cents,
              t.label AS tld_label
       FROM slds_v2 s
       JOIN tlds_v2 t ON t.id = s.tld_id
       WHERE s.owner_address = $1
         AND s.expiry_time <= NOW() + ($2 || ' days')::INTERVAL
         AND s.expiry_time > NOW() - INTERVAL '30 days'
       ORDER BY s.expiry_time ASC`,
      [wallet, String(days)]
    );

    // Get FLR price once for all renewal quotes
    let flrPriceUsd = null;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUsd = priceData.price;
    } catch { /* price unavailable */ }

    const now = new Date();
    const domains = result.rows.map(row => {
      const expiry = new Date(row.expiry_time);
      const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const isExpired = expiry < now;
      const renewalCostUsdCents = row.registration_price_usd_cents; // 1-year renewal
      const renewalCostFlr = flrPriceUsd
        ? parseFloat(((renewalCostUsdCents / 100) / flrPriceUsd).toFixed(2))
        : null;

      return {
        tokenId: row.token_id,
        label: row.label,
        tld: row.tld_label,
        fullName: row.full_name,
        expiryTime: row.expiry_time,
        daysUntilExpiry,
        isExpired,
        renewalCostUsdCents,
        renewalCostFlr,
      };
    });

    res.json({ wallet, days, domains, count: domains.length, flrPriceUsd });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//              MARKETPLACE BROWSE & SEARCH (v2)
// =============================================================

/**
 * GET /tlds/browse?filter=all|official|community&sort=popular|newest|cheapest|most-slds&search=crypto&page=1&limit=24
 * Public TLD browser for the /explore page.
 * Uses tld_stats materialized view for fast reads.
 */
router.get('/tlds/browse', async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const sort = req.query.sort || 'popular';
    const search = (req.query.search || '').toLowerCase().trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 24));
    const offset = (page - 1) * limit;

    let filterClause = '';
    if (filter === 'official') filterClause = 'AND ts.is_official = true';
    else if (filter === 'community') filterClause = 'AND ts.is_official = false';

    let searchClause = '';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      searchClause = `AND ts.label ILIKE $${params.length}`;
    }

    let orderBy = 'ts.sld_count DESC, ts.label ASC'; // popular
    if (sort === 'newest') orderBy = 'ts.created_at DESC';
    else if (sort === 'cheapest') orderBy = 'ts.starting_price_usd_cents ASC NULLS LAST, ts.label ASC';
    else if (sort === 'most-slds') orderBy = 'ts.sld_count DESC';

    // Count total
    const countResult = await query(`
      SELECT COUNT(*) FROM tld_stats ts
      WHERE ts.registration_enabled = true ${filterClause} ${searchClause}
    `, params);
    const total = parseInt(countResult.rows[0].count);

    // Fetch page
    params.push(limit, offset);
    const result = await query(`
      SELECT ts.*, p.length_prices, t.display_name
      FROM tld_stats ts
      LEFT JOIN tld_pricing_v2 p ON p.tld_id = ts.tld_id
      LEFT JOIN tlds_v2 t ON t.id = ts.tld_id
      WHERE ts.registration_enabled = true ${filterClause} ${searchClause}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    // Get FLR price for conversion
    let flrPriceUsd = null;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUsd = priceData.price;
    } catch { /* unavailable */ }

    const tlds = result.rows.map(row => {
      const startingPriceUsdCents = row.starting_price_usd_cents || (row.length_prices ? row.length_prices[4] : 0);
      return {
        label: row.label,
        displayName: row.display_name || null,
        tokenId: row.token_id,
        owner: row.owner_address,
        isOfficial: row.is_official || false,
        sldCount: parseInt(row.sld_count),
        startingPriceUsdCents,
        startingPriceFlr: flrPriceUsd && startingPriceUsdCents
          ? parseFloat(((startingPriceUsdCents / 100) / flrPriceUsd).toFixed(2))
          : null,
        stakedAt: row.staked_at,
        createdAt: row.created_at,
      };
    });

    res.json({ tlds, total, page, limit, hasMore: offset + tlds.length < total });
  } catch (error) {
    // If materialized view doesn't exist yet, fall back to direct query
    if (error.message?.includes('tld_stats')) {
      return res.json({ tlds: [], total: 0, page: 1, limit: 24, hasMore: false, warning: 'Materialized view not ready' });
    }
    sendError(res, error);
  }
});

/**
 * GET /search/multi?q=alice&filter=all|official|community&limit=20
 * Multi-TLD availability search — checks name across all active TLDs.
 */
router.get('/search/multi', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q || q.length < 1) return res.status(400).json({ error: 'Query parameter "q" required' });
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(q)) {
      return res.status(400).json({ error: 'Invalid label format' });
    }

    const filter = req.query.filter || 'all';
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    let filterClause = '';
    if (filter === 'official') filterClause = 'AND t.is_official = true';
    else if (filter === 'community') filterClause = 'AND t.is_official = false';

    const result = await query(`
      SELECT
        t.label AS tld_label, t.is_official, t.namehash AS tld_namehash,
        p.length_prices, p.multi_year_discounts,
        s.id AS sld_id, s.owner_address AS sld_owner, s.expiry_time
      FROM tlds_v2 t
      LEFT JOIN tld_pricing_v2 p ON p.tld_id = t.id
      LEFT JOIN slds_v2 s ON s.tld_id = t.id AND s.label = $1
      WHERE t.registration_enabled = true ${filterClause}
      ORDER BY t.is_official DESC, t.label ASC
      LIMIT $2
    `, [q, limit]);

    let flrPriceUsd = null;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUsd = priceData.price;
    } catch { /* unavailable */ }

    const results = result.rows.map(row => {
      const available = !row.sld_id;
      const priceUsdCents = available ? getPriceForLabel(q, row.length_prices) : 0;
      const priceFlr = flrPriceUsd && priceUsdCents
        ? parseFloat(((priceUsdCents / 100) / flrPriceUsd).toFixed(2))
        : null;

      return {
        tld: row.tld_label,
        label: q,
        fullName: `${q}.${row.tld_label}`,
        available,
        priceUsdCents: available ? priceUsdCents : null,
        priceFlr: available ? priceFlr : null,
        isOfficial: row.is_official || false,
        currentOwner: available ? null : row.sld_owner,
      };
    });

    res.json({ query: q, results, count: results.length, flrPriceUsd });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /tld/:label/public — public TLD detail for non-owners
 */
router.get('/tld/:label/public', async (req, res) => {
  try {
    const label = req.params.label.toLowerCase();

    const tldResult = await query(`
      SELECT
        t.id, t.token_id, t.label, t.namehash, t.owner_address,
        t.is_official, t.registration_enabled, t.staked_at,
        t.display_name, t.description, t.logo_url, t.created_at,
        p.length_prices, p.multi_year_discounts,
        COUNT(s.id) AS sld_count
      FROM tlds_v2 t
      LEFT JOIN tld_pricing_v2 p ON p.tld_id = t.id
      LEFT JOIN slds_v2 s ON s.tld_id = t.id
      WHERE t.label = $1
      GROUP BY t.id, p.tld_id, p.length_prices, p.multi_year_discounts
    `, [label]);

    if (tldResult.rows.length === 0) {
      return res.status(404).json({ error: 'TLD not found' });
    }

    const row = tldResult.rows[0];

    // Recent registrations (last 10)
    const recentResult = await query(`
      SELECT s.label, s.full_name, s.created_at
      FROM slds_v2 s
      WHERE s.tld_id = $1
      ORDER BY s.created_at DESC
      LIMIT 10
    `, [row.id]);

    res.json({
      label: row.label,
      displayName: row.display_name || null,
      description: row.description || null,
      logoUrl: row.logo_url || null,
      tokenId: row.token_id,
      namehash: row.namehash,
      owner: row.owner_address,
      isOfficial: row.is_official || false,
      registrationEnabled: row.registration_enabled,
      sldCount: parseInt(row.sld_count),
      stakedAt: row.staked_at,
      createdAt: row.created_at,
      pricing: row.length_prices ? {
        lengthPricesUsdCents: row.length_prices,
        multiYearDiscounts: row.multi_year_discounts,
      } : null,
      recentRegistrations: recentResult.rows.map(r => ({
        label: r.label,
        fullName: r.full_name,
        registeredAt: r.created_at,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /tld/:label/revenue — TLD owner revenue dashboard (auth required)
 */
router.post('/tld/:label/revenue', auth.verifyWallet, async (req, res) => {
  try {
    const label = req.params.label.toLowerCase();
    const wallet = req.authenticatedWallet;

    // Verify the caller owns this TLD
    const tldResult = await query(
      `SELECT id, owner_address FROM tlds_v2 WHERE label = $1`, [label]
    );
    if (tldResult.rows.length === 0) return res.status(404).json({ error: 'TLD not found' });
    if (tldResult.rows[0].owner_address !== wallet) {
      return res.status(403).json({ error: 'Not the TLD owner' });
    }

    const tldId = tldResult.rows[0].id;

    // Total earned + registration history
    const revenueResult = await query(`
      SELECT
        COALESCE(SUM(re.usd_amount), 0) AS total_earned_usd,
        COALESCE(SUM(re.flr_amount), 0) AS total_earned_flr,
        COUNT(re.id) AS total_registrations
      FROM registration_events_v2 re
      JOIN slds_v2 s ON s.id = re.sld_id
      WHERE s.tld_id = $1 AND re.event_type = 'registration'
    `, [tldId]);

    // Recent registration events
    const historyResult = await query(`
      SELECT s.label, s.full_name, re.flr_amount, re.usd_amount, re.timestamp
      FROM registration_events_v2 re
      JOIN slds_v2 s ON s.id = re.sld_id
      WHERE s.tld_id = $1
      ORDER BY re.timestamp DESC
      LIMIT 50
    `, [tldId]);

    const stats = revenueResult.rows[0];
    res.json({
      tld: label,
      totalEarnedUsd: parseFloat(stats.total_earned_usd),
      totalEarnedFlr: parseFloat(stats.total_earned_flr),
      totalRegistrations: parseInt(stats.total_registrations),
      registrationHistory: historyResult.rows.map(r => ({
        label: r.label,
        fullName: r.full_name,
        flrAmount: parseFloat(r.flr_amount),
        usdAmount: parseFloat(r.usd_amount),
        timestamp: r.timestamp,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /stats/platform — public platform-wide statistics for homepage
 */
router.get('/stats/platform', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM tlds_v2) AS total_tlds,
        (SELECT COUNT(*) FROM tlds_v2 WHERE is_official = true) AS official_tlds,
        (SELECT COUNT(*) FROM tlds_v2 WHERE is_official = false) AS community_tlds,
        (SELECT COUNT(*) FROM slds_v2) AS total_slds,
        (SELECT COALESCE(SUM(flr_amount), 0) FROM registration_events_v2) AS total_volume_flr,
        (SELECT COALESCE(SUM(usd_amount), 0) FROM registration_events_v2) AS total_volume_usd,
        (SELECT COUNT(DISTINCT owner_address) FROM tlds_v2) AS active_tld_owners
    `);

    const stats = result.rows[0];
    res.json({
      totalTlds: parseInt(stats.total_tlds),
      officialTlds: parseInt(stats.official_tlds),
      communityTlds: parseInt(stats.community_tlds),
      totalSlds: parseInt(stats.total_slds),
      totalVolumeFlr: parseFloat(stats.total_volume_flr),
      totalVolumeUsd: parseFloat(stats.total_volume_usd),
      activeTldOwners: parseInt(stats.active_tld_owners),
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /tld-stats/refresh — refresh the materialized view (admin only)
 */
router.post('/tld-stats/refresh', async (req, res) => {
  try {
    await query('REFRESH MATERIALIZED VIEW CONCURRENTLY tld_stats');
    res.json({ ok: true, refreshedAt: new Date().toISOString() });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                    TLD PROFILE
// =============================================================

/**
 * PUT /tld/:label/profile — Update TLD display name, description, logo URL.
 * Auth required — only the TLD owner can update.
 */
router.put('/tld/:label/profile', auth.verifyWallet, async (req, res) => {
  try {
    const label = req.params.label.toLowerCase();
    const wallet = req.authenticatedWallet;

    // Verify ownership
    const tldResult = await query(
      `SELECT id, owner_address FROM tlds_v2 WHERE label = $1`, [label]
    );
    if (tldResult.rows.length === 0) return res.status(404).json({ error: 'TLD not found' });
    if (tldResult.rows[0].owner_address.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(403).json({ error: 'Not the TLD owner' });
    }

    const { displayName, description, logoUrl } = req.body;
    const updates = [];
    const values = [];
    let paramIdx = 1;

    if (displayName !== undefined) {
      const trimmed = (displayName || '').trim().slice(0, 100);
      updates.push(`display_name = $${paramIdx++}`);
      values.push(trimmed || null);
    }
    if (description !== undefined) {
      const trimmed = (description || '').trim().slice(0, 500);
      updates.push(`description = $${paramIdx++}`);
      values.push(trimmed || null);
    }
    if (logoUrl !== undefined) {
      updates.push(`logo_url = $${paramIdx++}`);
      values.push(logoUrl || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(tldResult.rows[0].id);

    await query(
      `UPDATE tlds_v2 SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
//                       HELPERS
// =============================================================

/**
 * Get USD-cent price for a label based on its length.
 * length_prices is INTEGER[10] — index 0 = 1-char, index 9 = 10+ chars
 */
function getPriceForLabel(label, lengthPrices) {
  if (!lengthPrices || !Array.isArray(lengthPrices)) return 0;
  const idx = Math.min(label.length - 1, 9);
  return lengthPrices[idx] || 0;
}

export default router;
