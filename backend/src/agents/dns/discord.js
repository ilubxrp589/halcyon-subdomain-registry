/**
 * Discord Webhook Helper
 *
 * Sends alert embeds to Discord for DNS monitoring events.
 * Uses native fetch() — no external HTTP library needed.
 */

import config from './config.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('dns-agent-discord');

const COLORS = {
  ok: 0x2ecc71,       // green
  warning: 0xf39c12,  // orange
  critical: 0xe74c3c, // red
  info: 0x3498db,     // blue
};

/**
 * Send a Discord webhook embed
 * @param {object} opts
 * @param {'ok'|'warning'|'critical'|'info'} opts.level
 * @param {string} opts.title
 * @param {string} opts.description
 * @param {Array<{name:string, value:string, inline?:boolean}>} [opts.fields]
 */
export async function sendAlert({ level, title, description, fields }) {
  const webhookUrl = config.discordWebhook;
  if (!webhookUrl) {
    log.debug({ title, level }, 'Discord webhook not configured, skipping alert');
    return;
  }

  const embed = {
    title,
    description,
    color: COLORS[level] || COLORS.info,
    fields: fields || [],
    footer: { text: 'HSR DNS Monitoring' },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text();
      log.warn({ status: res.status, body: body.substring(0, 200) }, 'Discord webhook non-OK response');
    }
  } catch (err) {
    log.error({ err, title }, 'Failed to send Discord alert');
  }
}
