import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

/**
 * GET /api/notifications/:wallet
 * Fetch unread/undismissed reminders for a wallet
 */
router.get('/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const result = await query(`
      SELECT dr.id, dr.domain_id, dr.fqdn, dr.reminder_days, dr.reminder_type,
             dr.is_read, dr.created_at,
             d.expiration_date, d.token_id
      FROM domain_reminders dr
      LEFT JOIN domains d ON d.id = dr.domain_id
      WHERE dr.owner_wallet = $1
        AND dr.is_dismissed = false
      ORDER BY dr.created_at DESC
      LIMIT 50
    `, [wallet.toLowerCase()]);

    res.json({ notifications: result.rows });
  } catch (error) {
    console.error('Fetch notifications error:', error.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * GET /api/notifications/:wallet/count
 * Unread notification count (for badge)
 */
router.get('/:wallet/count', async (req, res) => {
  try {
    const { wallet } = req.params;
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const result = await query(`
      SELECT COUNT(*) as count
      FROM domain_reminders
      WHERE owner_wallet = $1
        AND is_read = false
        AND is_dismissed = false
    `, [wallet.toLowerCase()]);

    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    console.error('Notification count error:', error.message);
    res.status(500).json({ error: 'Failed to get notification count' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
      UPDATE domain_reminders SET is_read = true WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error.message);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * PATCH /api/notifications/:id/dismiss
 * Dismiss a notification
 */
router.patch('/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
      UPDATE domain_reminders SET is_dismissed = true WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Dismiss error:', error.message);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

/**
 * PATCH /api/notifications/:wallet/read-all
 * Mark all notifications as read for a wallet
 */
router.patch('/:wallet/read-all', async (req, res) => {
  try {
    const { wallet } = req.params;
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    await query(`
      UPDATE domain_reminders
      SET is_read = true
      WHERE owner_wallet = $1 AND is_read = false AND is_dismissed = false
    `, [wallet.toLowerCase()]);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error.message);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

export default router;
