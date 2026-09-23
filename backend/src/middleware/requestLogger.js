/**
 * Request Logger Middleware
 *
 * Features:
 * - Generates unique request ID for correlation
 * - Attaches logger to request object
 * - Logs request start and completion with timing
 * - Replaces Morgan for structured logging
 */

import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger, loggers } from '../utils/logger.js';

const log = loggers.api;

// Paths to skip logging (health checks, static assets)
const SKIP_PATHS = [
  '/api/v1/health',
  '/health',
  '/favicon.ico',
];

// Paths with reduced logging (high volume, less interesting)
const QUIET_PATHS = [
  '/api/v1/diagnostics',
];

/**
 * Request ID middleware - adds unique ID to each request
 */
export function requestId() {
  return (req, res, next) => {
    // Use existing request ID from header or generate new one
    req.id = req.headers['x-request-id'] || uuidv4();

    // Set response header for client correlation
    res.setHeader('X-Request-ID', req.id);

    // Create request-scoped logger
    req.log = createRequestLogger(req.id, {
      method: req.method,
      path: req.path,
    });

    next();
  };
}

/**
 * Request logging middleware - logs request lifecycle
 */
export function requestLogger() {
  return (req, res, next) => {
    // Skip health checks and static assets
    if (SKIP_PATHS.some(p => req.path.startsWith(p))) {
      return next();
    }

    const startTime = process.hrtime.bigint();
    const isQuiet = QUIET_PATHS.some(p => req.path.startsWith(p));

    // Log request start (debug level for quiet paths)
    if (isQuiet) {
      req.log?.debug({ req }, 'Request received');
    } else {
      req.log?.info({ req }, 'Request received');
    }

    // Capture response finish
    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000; // ms
      const statusCode = res.statusCode;

      const logData = {
        req,
        res,
        duration: Math.round(duration * 100) / 100,
        statusCode,
      };

      // Determine log level based on status code
      if (statusCode >= 500) {
        req.log?.error(logData, `${req.method} ${req.path} ${statusCode} - ${duration.toFixed(0)}ms`);
      } else if (statusCode >= 400) {
        req.log?.warn(logData, `${req.method} ${req.path} ${statusCode} - ${duration.toFixed(0)}ms`);
      } else if (isQuiet) {
        req.log?.debug(logData, `${req.method} ${req.path} ${statusCode} - ${duration.toFixed(0)}ms`);
      } else {
        req.log?.info(logData, `${req.method} ${req.path} ${statusCode} - ${duration.toFixed(0)}ms`);
      }

      // Warn on slow requests (> 5 seconds)
      if (duration > 5000) {
        req.log?.warn({ duration, path: req.path }, 'Slow request detected');
      }
    });

    next();
  };
}

/**
 * Error logging middleware - must be registered after routes
 */
export function errorLogger() {
  return (err, req, res, next) => {
    const logger = req.log || log;

    logger.error({
      err: {
        message: err.message,
        stack: err.stack,
        code: err.code,
        statusCode: err.statusCode || 500,
      },
      req: req ? {
        method: req.method,
        path: req.path,
        query: req.query,
      } : undefined,
    }, `Error: ${err.message}`);

    next(err);
  };
}

export default {
  requestId,
  requestLogger,
  errorLogger,
};
