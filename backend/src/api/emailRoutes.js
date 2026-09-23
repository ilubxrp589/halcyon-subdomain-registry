import { Router } from 'express';
import emailService from '../services/emailService.js';
import auth from '../middleware/auth.js';
import { loggers } from '../utils/logger.js';

const log = loggers.api;
const router = Router();

/**
 * Email Routes
 * Handles email registration, verification, preferences, and unsubscribe
 */

/**
 * POST /email/register
 * Register email for notifications (requires wallet auth)
 * Body: { email }
 */
router.post('/register', auth.verifyWallet, async (req, res) => {
  try {
    const { email } = req.body;
    const wallet = req.authenticatedWallet;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const result = await emailService.sendVerificationEmail(wallet, email.toLowerCase().trim());

    if (result.success) {
      res.json({
        success: true,
        message: 'Verification email sent. Please check your inbox.',
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send verification email' });
    }

  } catch (error) {
    log.error({ err: error }, 'Email registration error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /email/verify
 * Verify email using token (no auth required)
 * Query: ?token=xxx
 */
router.get('/verify', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }

    const result = await emailService.verifyEmail(token);

    if (result.success) {
      // Redirect to success page or return JSON
      if (req.headers.accept?.includes('text/html')) {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Email Verified - HSR</title>
            <style>
              body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .card { background: #1e293b; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; }
              h1 { color: #22c55e; margin-bottom: 16px; }
              a { color: #6366f1; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Email Verified!</h1>
              <p>Your email has been verified successfully. You'll now receive notifications for your HSR domains.</p>
              <p><a href="https://halcyon-names.io/dashboard">Go to Dashboard</a></p>
            </div>
          </body>
          </html>
        `);
      } else {
        res.json({ success: true, message: 'Email verified successfully' });
      }
    } else {
      if (req.headers.accept?.includes('text/html')) {
        res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Verification Failed - HSR</title>
            <style>
              body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .card { background: #1e293b; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; }
              h1 { color: #ef4444; margin-bottom: 16px; }
              a { color: #6366f1; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Verification Failed</h1>
              <p>${result.error || 'Invalid or expired verification link.'}</p>
              <p><a href="https://halcyon-names.io/dashboard">Go to Dashboard</a></p>
            </div>
          </body>
          </html>
        `);
      } else {
        res.status(400).json({ error: result.error || 'Verification failed' });
      }
    }

  } catch (error) {
    log.error({ err: error }, 'Email verification error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /email/status
 * Get email status for authenticated wallet
 */
router.post('/status', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const status = await emailService.getEmailStatus(wallet);
    res.json(status);
  } catch (error) {
    log.error({ err: error }, 'Email status error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /email/preferences
 * Get current preferences (legacy endpoint for backwards compatibility)
 */
router.post('/preferences', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const status = await emailService.getEmailStatus(wallet);

    if (!status.registered) {
      return res.status(404).json({ error: 'No email registered' });
    }

    res.json({
      email: status.email,
      verified: status.verified,
      preferences: status.preferences,
    });
  } catch (error) {
    log.error({ err: error }, 'Get preferences error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /email/preferences
 * Update email preferences
 * Body: { registration?: boolean, marketplace?: boolean, renewal?: boolean, marketing?: boolean }
 */
router.put('/preferences', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const preferences = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Preferences object required' });
    }

    const result = await emailService.updatePreferences(wallet, preferences);

    if (result.success) {
      res.json({ success: true, preferences: result.preferences });
    } else {
      res.status(400).json({ error: result.error });
    }

  } catch (error) {
    log.error({ err: error }, 'Update preferences error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /email/unsubscribe
 * Unsubscribe from all emails using token (no auth required)
 * Query: ?token=xxx
 */
router.get('/unsubscribe', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }

    const result = await emailService.unsubscribeAll(token);

    if (result.success) {
      if (req.headers.accept?.includes('text/html')) {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Unsubscribed - HSR</title>
            <style>
              body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .card { background: #1e293b; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; }
              h1 { margin-bottom: 16px; }
              a { color: #6366f1; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Unsubscribed</h1>
              <p>You've been unsubscribed from all HSR email notifications.</p>
              <p>You can re-enable notifications from your <a href="https://halcyon-names.io/dashboard">dashboard settings</a>.</p>
            </div>
          </body>
          </html>
        `);
      } else {
        res.json({ success: true, message: 'Unsubscribed from all emails' });
      }
    } else {
      res.status(400).json({ error: result.error || 'Unsubscribe failed' });
    }

  } catch (error) {
    log.error({ err: error }, 'Unsubscribe error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /email
 * Delete email registration (requires wallet auth)
 */
router.delete('/', auth.verifyWallet, async (req, res) => {
  try {
    const wallet = req.authenticatedWallet;
    const result = await emailService.deleteEmail(wallet);

    if (result.success) {
      res.json({ success: true, message: 'Email registration deleted' });
    } else {
      res.status(500).json({ error: result.error });
    }

  } catch (error) {
    log.error({ err: error }, 'Delete email error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
