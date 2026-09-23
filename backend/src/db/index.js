import pg from 'pg';
import config from '../config/index.js';
import { loggers } from '../utils/logger.js';

const { Pool } = pg;
const log = loggers.db;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Connection events
pool.on('connect', () => {
  log.debug('Database pool connection established');
});

pool.on('error', (err) => {
  log.error({ err }, 'Database pool error');
});

pool.on('remove', () => {
  log.debug('Database pool connection removed');
});

/**
 * Execute a database query with optional logging
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 1 second)
    if (duration > 1000) {
      log.warn({
        duration,
        query: text.substring(0, 100),
        rows: result.rowCount,
      }, 'Slow query detected');
    }

    return result;
  } catch (err) {
    log.error({
      err,
      query: text.substring(0, 100),
    }, 'Database query failed');
    throw err;
  }
};

export default pool;
