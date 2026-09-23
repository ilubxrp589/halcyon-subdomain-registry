/**
 * DNS Agent Database Module
 *
 * Thin wrapper around pg pool for DNS agent queries.
 * Reuses the same subdomain_registry database as the main backend.
 */

import pg from 'pg';
import config from './config.js';
import { createLogger } from '../../utils/logger.js';

const { Pool } = pg;
const log = createLogger('dns-agent-db');

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5, // small pool — agent is lightweight
});

pool.on('error', (err) => {
  log.error({ err }, 'DNS agent database pool error');
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      log.warn({ duration, query: text.substring(0, 100), rows: result.rowCount }, 'Slow query');
    }
    return result;
  } catch (err) {
    log.error({ err, query: text.substring(0, 100) }, 'Query failed');
    throw err;
  }
}

export async function close() {
  await pool.end();
}
