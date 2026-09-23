import { Router } from 'express';
import { query } from '../db/index.js';
import auth from '../middleware/auth.js';
import { loggers } from '../utils/logger.js';

const log = loggers.api;
const router = Router();

/**
 * Domain Defaults Routes
 * Handles user default DNS settings that auto-apply to new domains
 */

/**
 * POST /defaults
 * Get defaults for authenticated wallet
 */
router.post('/', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;

    const result = await query(`
      SELECT ipv4, ipv6, cname, txt, default_layout, auto_apply
      FROM user_domain_defaults
      WHERE wallet_address = $1
    `, [wallet]);

    if (result.rows.length === 0) {
      return res.json({
        ipv4: '',
        ipv6: '',
        cname: '',
        txt: '',
        defaultLayout: 'standard',
        autoApply: true,
      });
    }

    const row = result.rows[0];
    res.json({
      ipv4: row.ipv4 || '',
      ipv6: row.ipv6 || '',
      cname: row.cname || '',
      txt: row.txt || '',
      defaultLayout: row.default_layout || 'standard',
      autoApply: row.auto_apply !== false,
    });

  } catch (error) {
    log.error({ err: error }, 'Get defaults error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /defaults
 * Save defaults for authenticated wallet
 * Body: { ipv4?, ipv6?, cname?, txt?, defaultLayout?, autoApply? }
 */
router.put('/', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const { ipv4, ipv6, cname, txt, defaultLayout, autoApply } = req.body;

    // Validate inputs
    if (ipv4 && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ipv4)) {
      return res.status(400).json({ error: 'Invalid IPv4 address' });
    }
    if (ipv6 && !/^[0-9a-fA-F:]+$/.test(ipv6)) {
      return res.status(400).json({ error: 'Invalid IPv6 address' });
    }
    if (cname && cname.length > 255) {
      return res.status(400).json({ error: 'CNAME too long' });
    }
    if (txt && txt.length > 2048) {
      return res.status(400).json({ error: 'TXT record too long' });
    }
    if (defaultLayout && !['standard', 'minimal', 'card'].includes(defaultLayout)) {
      return res.status(400).json({ error: 'Invalid layout' });
    }

    const result = await query(`
      INSERT INTO user_domain_defaults (wallet_address, ipv4, ipv6, cname, txt, default_layout, auto_apply)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (wallet_address) DO UPDATE SET
        ipv4 = EXCLUDED.ipv4,
        ipv6 = EXCLUDED.ipv6,
        cname = EXCLUDED.cname,
        txt = EXCLUDED.txt,
        default_layout = EXCLUDED.default_layout,
        auto_apply = EXCLUDED.auto_apply,
        updated_at = NOW()
      RETURNING ipv4, ipv6, cname, txt, default_layout, auto_apply
    `, [
      wallet,
      ipv4 || null,
      ipv6 || null,
      cname || null,
      txt || null,
      defaultLayout || 'standard',
      autoApply !== false,
    ]);

    const row = result.rows[0];
    log.info({ wallet }, 'Domain defaults saved');

    res.json({
      success: true,
      ipv4: row.ipv4 || '',
      ipv6: row.ipv6 || '',
      cname: row.cname || '',
      txt: row.txt || '',
      defaultLayout: row.default_layout || 'standard',
      autoApply: row.auto_apply !== false,
    });

  } catch (error) {
    log.error({ err: error }, 'Save defaults error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get defaults for a wallet (internal use by contractListener)
 */
export async function getDefaultsForWallet(walletAddress) {
  try {
    const result = await query(`
      SELECT ipv4, ipv6, cname, txt, default_layout, auto_apply
      FROM user_domain_defaults
      WHERE wallet_address = $1 AND auto_apply = true
    `, [walletAddress]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ipv4: row.ipv4,
      ipv6: row.ipv6,
      cname: row.cname,
      txt: row.txt,
      defaultLayout: row.default_layout,
    };
  } catch (error) {
    log.error({ err: error, walletAddress }, 'Failed to get defaults for wallet');
    return null;
  }
}

export default router;
