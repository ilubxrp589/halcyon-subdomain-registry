/**
 * Structured Logger - Pino-based logging with request tracking
 *
 * Features:
 * - JSON format for log aggregation (parseable by ELK, Datadog, Loki, etc.)
 * - Request ID correlation for tracing
 * - Log levels: trace, debug, info, warn, error, fatal
 * - Sensitive data redaction
 * - Child loggers per service/module
 *
 * For pretty printing in development:
 *   node src/index.js | npx pino-pretty
 *   or: pm2 logs halcyon-backend | npx pino-pretty
 */

import pino from 'pino';
import config from '../config/index.js';

// Fields to redact from logs (prevent sensitive data exposure)
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.signature',
  'req.body.nonce',
  'req.body.password',
  'req.body.privateKey',
  'req.body.secret',
  'res.body.signature',
  'res.body.nonce',
  '*.signature',
  '*.nonce',
  '*.privateKey',
  '*.secret',
  '*.password',
];

// Determine log level from environment
const getLogLevel = () => {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  if (config.env === 'production') return 'info';
  if (config.env === 'test') return 'error';
  return 'debug';
};

// Base logger configuration
const baseConfig = {
  level: getLogLevel(),
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  // Add standard fields to every log
  base: {
    service: 'halcyon-backend',
    env: config.env,
  },
  // Timestamp in ISO format
  timestamp: pino.stdTimeFunctions.isoTime,
  // Format output for readability while remaining JSON
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Custom serializers
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      wallet: req.body?.wallet ? `${req.body.wallet.slice(0, 10)}...` : undefined,
      ip: req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim(),
      userAgent: req.headers?.['user-agent']?.substring(0, 100),
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
};

// Create the root logger (JSON output, pipe through pino-pretty for dev)
const logger = pino(baseConfig);

/**
 * Create a child logger for a specific module/service
 * @param {string} module - Module name (e.g., 'auth', 'hns', 'watcher')
 * @returns {pino.Logger} Child logger instance
 */
export function createLogger(module) {
  return logger.child({ module });
}

/**
 * Create a request-scoped logger with correlation ID
 * @param {string} requestId - Unique request ID
 * @param {object} context - Additional context (wallet, path, etc.)
 * @returns {pino.Logger} Request-scoped logger
 */
export function createRequestLogger(requestId, context = {}) {
  return logger.child({
    requestId,
    ...context,
  });
}

// Pre-created loggers for common modules
export const loggers = {
  app: createLogger('app'),
  auth: createLogger('auth'),
  db: createLogger('db'),
  hns: createLogger('hns'),
  ftso: createLogger('ftso'),
  watcher: createLogger('watcher'),
  priceSync: createLogger('price-sync'),
  contractListener: createLogger('contract-listener'),
  stakingListener: createLogger('staking-listener'),
  nft: createLogger('nft'),
  gpu: createLogger('gpu'),
  comfyui: createLogger('comfyui'),
  cache: createLogger('cache'),
  audit: createLogger('audit'),
  api: createLogger('api'),
  admin: createLogger('admin'),
  marketplace: createLogger('marketplace'),
  imageAnalysis: createLogger('image-analysis'),
  gpuTest: createLogger('gpu-test'),
  fdcKeeper: createLogger('fdc-keeper'),
};

// Export root logger as default
export default logger;

/**
 * Log levels reference:
 *
 * trace (10) - Very detailed debugging, usually disabled
 * debug (20) - Debugging information for developers
 * info (30)  - General operational events (startup, shutdown, requests)
 * warn (40)  - Warning conditions (deprecated APIs, high latency)
 * error (50) - Error conditions (failed operations, exceptions)
 * fatal (60) - System is unusable (crash, data corruption)
 *
 * Usage:
 *   import { loggers } from './utils/logger.js';
 *   const log = loggers.auth;
 *
 *   log.info('User authenticated');
 *   log.info({ wallet: '0x...' }, 'User authenticated');
 *   log.error({ err }, 'Authentication failed');
 *   log.debug({ duration: 150 }, 'Request completed');
 *
 * View pretty logs:
 *   pm2 logs halcyon-backend | npx pino-pretty
 */
