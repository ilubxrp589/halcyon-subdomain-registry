import { query } from '../db/index.js';
import emailService from './emailService.js';

/**
 * Renewal Reminder Service
 * Runs every hour to generate reminders for domains approaching expiration.
 * Thresholds: 90, 60, 30, 14, 7, 6, 5, 4, 3, 2, 1 day(s) before expiry.
 */

const REMINDER_THRESHOLDS = [90, 60, 30, 14, 7, 6, 5, 4, 3, 2, 1];

class RenewalReminderService {
  constructor() {
    this.interval = null;
    this.isRunning = false;
  }

  async initialize() {
    try {
      // Verify domain_reminders table exists
      await query(`SELECT 1 FROM domain_reminders LIMIT 0`);
      console.log('  ✓ Renewal reminder service initialized');
      return { success: true };
    } catch (error) {
      console.error('Renewal reminder init error:', error.message);
      return { success: false, error: error.message };
    }
  }

  start(intervalMs = 3600000) {
    if (this.interval) {
      clearInterval(this.interval);
    }

    // Run immediately, then on interval
    this.runAll();
    this.interval = setInterval(() => this.runAll(), intervalMs);
    console.log(`🔔 Renewal reminder service started (every ${intervalMs / 60000} minutes)`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('Renewal reminder service stopped');
  }

  async runAll() {
    if (this.isRunning) {
      console.log('Renewal reminder already running, skipping');
      return;
    }

    this.isRunning = true;
    try {
      await this.generateReminders();
      await this.cleanupOldReminders();
    } catch (error) {
      console.error('Renewal reminder error:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Generate reminders for each threshold where domains fall within range
   * and no reminder has been sent yet for that domain+threshold.
   */
  async generateReminders() {
    let totalNew = 0;

    for (const days of REMINDER_THRESHOLDS) {
      try {
        const result = await query(`
          INSERT INTO domain_reminders (domain_id, fqdn, owner_wallet, reminder_days)
          SELECT d.id, d.fqdn, d.owner_wallet, $1::integer
          FROM domains d
          WHERE d.expiration_date IS NOT NULL
            AND d.expiration_date > NOW()
            AND d.expiration_date <= NOW() + INTERVAL '1 day' * $1::integer
            AND d.status IN ('active', 'expiring_soon')
            AND d.reclaimed_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM domain_reminders dr
              WHERE dr.domain_id = d.id AND dr.reminder_days = $1::integer
            )
          RETURNING fqdn, owner_wallet
        `, [days]);

        if (result.rowCount > 0) {
          totalNew += result.rowCount;

          // Send email notifications for each new reminder
          for (const row of result.rows) {
            try {
              // Get expiration date for the email
              const domainResult = await query(
                'SELECT expiration_date FROM domains WHERE fqdn = $1',
                [row.fqdn]
              );
              const expirationDate = domainResult.rows[0]?.expiration_date;

              await emailService.sendNotification(
                row.owner_wallet,
                days === 1 ? 'domain_expiring' : 'renewal_reminder',
                {
                  fqdn: row.fqdn,
                  days,
                  expirationDate: expirationDate
                    ? new Date(expirationDate).toLocaleDateString()
                    : 'Unknown',
                }
              );
            } catch (emailError) {
              // Non-critical: log but don't fail the entire reminder process
              console.warn(`Failed to send renewal email for ${row.fqdn}:`, emailError.message);
            }
          }
        }
      } catch (error) {
        console.error(`Reminder generation error (${days}d):`, error.message);
      }
    }

    if (totalNew > 0) {
      console.log(`🔔 Generated ${totalNew} new renewal reminders`);
    }
  }

  /**
   * Delete dismissed reminders older than 90 days to keep the table clean.
   */
  async cleanupOldReminders() {
    try {
      const result = await query(`
        DELETE FROM domain_reminders
        WHERE is_dismissed = true
          AND created_at < NOW() - INTERVAL '90 days'
      `);

      if (result.rowCount > 0) {
        console.log(`🧹 Cleaned up ${result.rowCount} old dismissed reminders`);
      }
    } catch (error) {
      console.error('Reminder cleanup error:', error.message);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      thresholds: REMINDER_THRESHOLDS,
    };
  }
}

export const renewalReminder = new RenewalReminderService();
export default renewalReminder;
