import { Resend } from 'resend';
import crypto from 'crypto';
import config from '../config/index.js';
import { query } from '../db/index.js';
import { loggers } from '../utils/logger.js';

const log = loggers.app;

/**
 * Email Service
 * Handles transactional email notifications using Resend
 */

class EmailService {
  constructor() {
    this.resend = null;
    this.initialized = false;
  }

  /**
   * Initialize the Resend client
   */
  initialize() {
    if (!config.email.enabled) {
      log.info('Email service disabled (EMAIL_ENABLED != true)');
      return { success: true, enabled: false };
    }

    if (!config.email.apiKey) {
      log.warn('Email service: No RESEND_API_KEY configured');
      return { success: false, error: 'Missing API key' };
    }

    try {
      this.resend = new Resend(config.email.apiKey);
      this.initialized = true;
      log.info('Email service initialized with Resend');
      return { success: true, enabled: true };
    } catch (error) {
      log.error({ err: error }, 'Failed to initialize Resend');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if email service is ready to send
   */
  isReady() {
    return this.initialized && config.email.enabled && this.resend !== null;
  }

  /**
   * Generate email HTML with HSR branding
   */
  generateEmailHTML(content, unsubscribeToken = null) {
    const unsubscribeUrl = unsubscribeToken
      ? `${config.email.unsubscribeUrl}?token=${unsubscribeToken}`
      : null;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HSR Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">HSR</h1>
              <p style="margin: 5px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">Handshake Subdomain Registry</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px; color: #e2e8f0;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; border-top: 1px solid #334155; text-align: center;">
              <p style="margin: 0 0 10px; color: #64748b; font-size: 12px;">
                You're receiving this because you registered for email notifications.
              </p>
              ${unsubscribeUrl ? `
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                <a href="${unsubscribeUrl}" style="color: #6366f1; text-decoration: none;">Unsubscribe from all emails</a>
              </p>
              ` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Email templates
   */
  templates = {
    registration_success: (vars) => ({
      subject: `Welcome! ${vars.fqdn} is now yours`,
      html: `
        <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 24px;">Registration Complete!</h2>
        <p style="margin: 0 0 20px; line-height: 1.6;">
          Congratulations! Your domain <strong style="color: #6366f1;">${vars.fqdn}</strong> has been successfully registered.
        </p>
        <table width="100%" style="background-color: #0f172a; border-radius: 8px; margin: 20px 0;">
          <tr>
            <td style="padding: 20px;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Domain</p>
              <p style="margin: 0; color: #f1f5f9; font-size: 18px; font-weight: 600;">${vars.fqdn}</p>
            </td>
            <td style="padding: 20px;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Token ID</p>
              <p style="margin: 0; color: #f1f5f9; font-size: 18px; font-weight: 600;">#${vars.tokenId}</p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0; line-height: 1.6;">
          You can now configure DNS records, set up a profile page, or customize your NFT from your dashboard.
        </p>
        <a href="https://halcyon-names.io/dashboard" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Go to Dashboard
        </a>
      `,
    }),

    auction_outbid: (vars) => ({
      subject: `You've been outbid on ${vars.fqdn}`,
      html: `
        <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 24px;">You've Been Outbid</h2>
        <p style="margin: 0 0 20px; line-height: 1.6;">
          Someone has placed a higher bid on <strong style="color: #6366f1;">${vars.fqdn}</strong>.
        </p>
        <table width="100%" style="background-color: #0f172a; border-radius: 8px; margin: 20px 0;">
          <tr>
            <td style="padding: 20px;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Your Bid</p>
              <p style="margin: 0; color: #ef4444; font-size: 18px; font-weight: 600; text-decoration: line-through;">${vars.yourBid} FLR</p>
            </td>
            <td style="padding: 20px;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">New High Bid</p>
              <p style="margin: 0; color: #22c55e; font-size: 18px; font-weight: 600;">${vars.newBid} FLR</p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0; line-height: 1.6;">
          Don't miss out! Place a new bid to stay in the running.
        </p>
        <a href="https://halcyon-names.io/marketplace/${vars.fqdn}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Place New Bid
        </a>
      `,
    }),

    renewal_reminder: (vars) => ({
      subject: `${vars.fqdn} expires in ${vars.days} days`,
      html: `
        <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 24px;">Renewal Reminder</h2>
        <p style="margin: 0 0 20px; line-height: 1.6;">
          Your domain <strong style="color: #6366f1;">${vars.fqdn}</strong> will expire in <strong>${vars.days} days</strong>.
        </p>
        <table width="100%" style="background-color: #0f172a; border-radius: 8px; margin: 20px 0;">
          <tr>
            <td style="padding: 20px;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Domain</p>
              <p style="margin: 0; color: #f1f5f9; font-size: 18px; font-weight: 600;">${vars.fqdn}</p>
            </td>
            <td style="padding: 20px;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Expires On</p>
              <p style="margin: 0; color: #fbbf24; font-size: 18px; font-weight: 600;">${vars.expirationDate}</p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0; line-height: 1.6;">
          Renew now to keep your domain and avoid losing your DNS settings and profile.
        </p>
        <a href="https://halcyon-names.io/dashboard" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Renew Domain
        </a>
      `,
    }),

    domain_expiring: (vars) => ({
      subject: `URGENT: ${vars.fqdn} expires TOMORROW`,
      html: `
        <h2 style="margin: 0 0 20px; color: #ef4444; font-size: 24px;">Urgent: Domain Expiring Tomorrow!</h2>
        <p style="margin: 0 0 20px; line-height: 1.6;">
          Your domain <strong style="color: #6366f1;">${vars.fqdn}</strong> will expire <strong style="color: #ef4444;">tomorrow</strong>.
        </p>
        <table width="100%" style="background-color: #7f1d1d; border-radius: 8px; margin: 20px 0;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0 0 10px; color: #fecaca; font-size: 14px;">EXPIRES IN</p>
              <p style="margin: 0; color: #ffffff; font-size: 36px; font-weight: 700;">24 HOURS</p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0; line-height: 1.6;">
          After expiration, your domain will enter a grace period and may be reclaimed by the treasury if not renewed.
        </p>
        <a href="https://halcyon-names.io/dashboard" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #ef4444; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Renew Now
        </a>
      `,
    }),

    offer_received: (vars) => ({
      subject: `New offer received for ${vars.fqdn}`,
      html: `
        <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 24px;">New Offer Received!</h2>
        <p style="margin: 0 0 20px; line-height: 1.6;">
          Someone has made an offer for your domain <strong style="color: #6366f1;">${vars.fqdn}</strong>.
        </p>
        <table width="100%" style="background-color: #0f172a; border-radius: 8px; margin: 20px 0;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Offer Amount</p>
              <p style="margin: 0; color: #22c55e; font-size: 28px; font-weight: 700;">${vars.amount} FLR</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 20px 20px;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
                Expires: ${vars.expiresAt}
              </p>
            </td>
          </tr>
        </table>
        <a href="https://halcyon-names.io/dashboard" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Review Offer
        </a>
      `,
    }),

    sale_completed: (vars) => ({
      subject: `${vars.fqdn} has been sold!`,
      html: `
        <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 24px;">Sale Complete!</h2>
        <p style="margin: 0 0 20px; line-height: 1.6;">
          Your domain <strong style="color: #6366f1;">${vars.fqdn}</strong> has been sold.
        </p>
        <table width="100%" style="background-color: #0f172a; border-radius: 8px; margin: 20px 0;">
          <tr>
            <td style="padding: 20px;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Sale Price</p>
              <p style="margin: 0; color: #22c55e; font-size: 24px; font-weight: 700;">${vars.price} FLR</p>
            </td>
            <td style="padding: 20px;">
              <p style="margin: 0 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">You Received</p>
              <p style="margin: 0; color: #22c55e; font-size: 24px; font-weight: 700;">${vars.received} FLR</p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0; line-height: 1.6; color: #94a3b8; font-size: 14px;">
          Platform fee: ${vars.platformFee} FLR | Royalty: ${vars.royalty} FLR
        </p>
      `,
    }),

    email_verification: (vars) => ({
      subject: 'Verify your email for HSR',
      html: `
        <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 24px;">Verify Your Email</h2>
        <p style="margin: 0 0 20px; line-height: 1.6;">
          Click the button below to verify your email address and enable notifications.
        </p>
        <a href="${vars.verifyUrl}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Verify Email
        </a>
        <p style="margin: 30px 0 0; line-height: 1.6; color: #94a3b8; font-size: 14px;">
          This link expires in 24 hours. If you didn't request this, you can safely ignore this email.
        </p>
      `,
    }),
  };

  /**
   * Send an email using a template
   */
  async sendEmail(to, templateName, variables) {
    if (!this.isReady()) {
      log.debug({ templateName, to }, 'Email not sent - service not ready');
      return { success: false, error: 'Email service not ready' };
    }

    const template = this.templates[templateName];
    if (!template) {
      log.error({ templateName }, 'Unknown email template');
      return { success: false, error: 'Unknown template' };
    }

    try {
      const { subject, html } = template(variables);
      const unsubscribeToken = variables.unsubscribeToken || null;
      const fullHtml = this.generateEmailHTML(html, unsubscribeToken);

      const result = await this.resend.emails.send({
        from: config.email.fromAddress,
        to,
        subject,
        html: fullHtml,
      });

      // Log the email
      await query(`
        INSERT INTO email_log (wallet_address, email, email_type, subject, resend_id, status)
        VALUES ($1, $2, $3, $4, $5, 'sent')
      `, [variables.wallet || null, to, templateName, subject, result.data?.id || null]);

      log.info({ to, templateName, resendId: result.data?.id }, 'Email sent successfully');
      return { success: true, id: result.data?.id };

    } catch (error) {
      log.error({ err: error, to, templateName }, 'Failed to send email');

      // Log the failure
      await query(`
        INSERT INTO email_log (wallet_address, email, email_type, subject, status, error_message)
        VALUES ($1, $2, $3, $4, 'failed', $5)
      `, [variables.wallet || null, to, templateName, templateName, error.message]);

      return { success: false, error: error.message };
    }
  }

  /**
   * Send a notification email to a wallet (checks preferences)
   */
  async sendNotification(walletAddress, templateName, variables) {
    if (!this.isReady()) {
      return { success: false, error: 'Email service not ready' };
    }

    // Map template to preference category
    const preferenceMap = {
      registration_success: 'registration',
      auction_outbid: 'marketplace',
      renewal_reminder: 'renewal',
      domain_expiring: 'renewal',
      offer_received: 'marketplace',
      sale_completed: 'marketplace',
    };

    const preferenceType = preferenceMap[templateName];
    if (!preferenceType) {
      log.warn({ templateName }, 'Template not mapped to preference type');
      return { success: false, error: 'Unknown notification type' };
    }

    try {
      // Get user email and preferences
      const result = await query(`
        SELECT email, email_verified, unsubscribe_token, preferences
        FROM user_emails
        WHERE wallet_address = $1
      `, [walletAddress]);

      if (result.rows.length === 0) {
        log.debug({ walletAddress }, 'No email registered for wallet');
        return { success: false, error: 'No email registered' };
      }

      const user = result.rows[0];

      // Check if email is verified
      if (!user.email_verified) {
        log.debug({ walletAddress }, 'Email not verified');
        return { success: false, error: 'Email not verified' };
      }

      // Check preferences
      const preferences = user.preferences || {};
      if (preferences[preferenceType] === false) {
        log.debug({ walletAddress, preferenceType }, 'User opted out of this notification type');
        return { success: false, error: 'User opted out' };
      }

      // Send the email
      return await this.sendEmail(user.email, templateName, {
        ...variables,
        wallet: walletAddress,
        unsubscribeToken: user.unsubscribe_token,
      });

    } catch (error) {
      log.error({ err: error, walletAddress, templateName }, 'Failed to send notification');
      return { success: false, error: error.message };
    }
  }

  /**
   * Send verification email to a wallet
   */
  async sendVerificationEmail(walletAddress, email) {
    if (!this.isReady()) {
      return { success: false, error: 'Email service not ready' };
    }

    try {
      // Generate verification token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store verification record
      await query(`
        INSERT INTO email_verifications (wallet_address, email, token, expires_at)
        VALUES ($1, $2, $3, $4)
      `, [walletAddress, email, token, expiresAt]);

      // Update or create user_emails record
      await query(`
        INSERT INTO user_emails (wallet_address, email, verification_token, verification_expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (wallet_address) DO UPDATE SET
          email = EXCLUDED.email,
          email_verified = false,
          verification_token = EXCLUDED.verification_token,
          verification_expires_at = EXCLUDED.verification_expires_at,
          updated_at = NOW()
      `, [walletAddress, email, token, expiresAt]);

      // Send verification email
      const verifyUrl = `${config.email.unsubscribeUrl.replace('/unsubscribe', '/verify')}?token=${token}`;

      return await this.sendEmail(email, 'email_verification', {
        verifyUrl,
        wallet: walletAddress,
      });

    } catch (error) {
      log.error({ err: error, walletAddress, email }, 'Failed to send verification email');
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify email token
   */
  async verifyEmail(token) {
    try {
      // Find the verification record
      const result = await query(`
        SELECT wallet_address, email FROM email_verifications
        WHERE token = $1 AND expires_at > NOW() AND verified_at IS NULL
      `, [token]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Invalid or expired token' };
      }

      const { wallet_address, email } = result.rows[0];

      // Mark verification as complete
      await query(`
        UPDATE email_verifications SET verified_at = NOW() WHERE token = $1
      `, [token]);

      // Update user_emails
      await query(`
        UPDATE user_emails SET
          email_verified = true,
          verified_at = NOW(),
          verification_token = NULL,
          verification_expires_at = NULL,
          updated_at = NOW()
        WHERE wallet_address = $1
      `, [wallet_address]);

      log.info({ wallet_address, email }, 'Email verified successfully');
      return { success: true, wallet: wallet_address, email };

    } catch (error) {
      log.error({ err: error, token }, 'Failed to verify email');
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe from all emails using token
   */
  async unsubscribeAll(token) {
    try {
      const result = await query(`
        UPDATE user_emails SET
          preferences = '{"registration": false, "marketplace": false, "renewal": false, "marketing": false}'::jsonb,
          updated_at = NOW()
        WHERE unsubscribe_token = $1
        RETURNING wallet_address
      `, [token]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Invalid unsubscribe token' };
      }

      log.info({ wallet: result.rows[0].wallet_address }, 'Unsubscribed from all emails');
      return { success: true };

    } catch (error) {
      log.error({ err: error }, 'Failed to unsubscribe');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get email status for a wallet
   */
  async getEmailStatus(walletAddress) {
    try {
      const result = await query(`
        SELECT email, email_verified, preferences, created_at, verified_at
        FROM user_emails
        WHERE wallet_address = $1
      `, [walletAddress]);

      if (result.rows.length === 0) {
        return { registered: false };
      }

      const user = result.rows[0];
      return {
        registered: true,
        email: user.email,
        verified: user.email_verified,
        preferences: user.preferences,
        registeredAt: user.created_at,
        verifiedAt: user.verified_at,
      };

    } catch (error) {
      log.error({ err: error, walletAddress }, 'Failed to get email status');
      throw error;
    }
  }

  /**
   * Update email preferences for a wallet
   */
  async updatePreferences(walletAddress, preferences) {
    try {
      // Validate preferences
      const validKeys = ['registration', 'marketplace', 'renewal', 'marketing'];
      const filteredPrefs = {};
      for (const key of validKeys) {
        if (key in preferences) {
          filteredPrefs[key] = Boolean(preferences[key]);
        }
      }

      const result = await query(`
        UPDATE user_emails SET
          preferences = preferences || $2::jsonb,
          updated_at = NOW()
        WHERE wallet_address = $1
        RETURNING preferences
      `, [walletAddress, JSON.stringify(filteredPrefs)]);

      if (result.rows.length === 0) {
        return { success: false, error: 'No email registered' };
      }

      return { success: true, preferences: result.rows[0].preferences };

    } catch (error) {
      log.error({ err: error, walletAddress }, 'Failed to update preferences');
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete email registration for a wallet
   */
  async deleteEmail(walletAddress) {
    try {
      await query(`DELETE FROM user_emails WHERE wallet_address = $1`, [walletAddress]);
      log.info({ walletAddress }, 'Email registration deleted');
      return { success: true };
    } catch (error) {
      log.error({ err: error, walletAddress }, 'Failed to delete email');
      return { success: false, error: error.message };
    }
  }
}

export const emailService = new EmailService();
export default emailService;
