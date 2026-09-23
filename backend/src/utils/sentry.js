/**
 * Sentry Error Tracking Integration
 *
 * Features:
 * - Automatic error capture and reporting
 * - Performance monitoring (transactions)
 * - Request context enrichment
 * - Environment-aware configuration
 *
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Set SENTRY_DSN in your environment variables
 * 3. Errors will automatically be captured and reported
 */

import * as Sentry from '@sentry/node';
import config from '../config/index.js';
import { loggers } from './logger.js';

const log = loggers.app;

// Check if Sentry is configured
const SENTRY_DSN = process.env.SENTRY_DSN;
const isEnabled = !!SENTRY_DSN;

/**
 * Initialize Sentry error tracking
 * Call this early in application startup
 */
export function initSentry() {
  if (!isEnabled) {
    log.info('Sentry not configured (set SENTRY_DSN to enable)');
    return { enabled: false };
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: config.env,
      release: process.env.npm_package_version || '1.0.0',

      // Performance monitoring sample rate (0.0 to 1.0)
      // Set lower in production for high-traffic apps
      tracesSampleRate: config.env === 'production' ? 0.1 : 1.0,

      // Filter out sensitive data
      beforeSend(event) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }

        // Remove sensitive body fields
        if (event.request?.data) {
          const data = typeof event.request.data === 'string'
            ? JSON.parse(event.request.data)
            : event.request.data;

          if (data) {
            ['signature', 'nonce', 'password', 'privateKey', 'secret'].forEach(key => {
              if (data[key]) data[key] = '[REDACTED]';
            });
            event.request.data = JSON.stringify(data);
          }
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Network errors that are expected
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        // Rate limiting
        'Too many requests',
        // Client errors
        'Invalid wallet address',
        'Unauthorized',
      ],
    });

    log.info({ environment: config.env }, 'Sentry error tracking initialized');
    return { enabled: true };
  } catch (err) {
    log.error({ err }, 'Failed to initialize Sentry');
    return { enabled: false, error: err.message };
  }
}

/**
 * Express error handler middleware for Sentry
 * Add this BEFORE your custom error handler
 */
export function sentryErrorHandler() {
  if (!isEnabled) {
    return (err, req, res, next) => next(err);
  }
  return Sentry.Handlers.errorHandler();
}

/**
 * Express request handler middleware for Sentry
 * Add this AFTER your other middleware but BEFORE routes
 */
export function sentryRequestHandler() {
  if (!isEnabled) {
    return (req, res, next) => next();
  }
  return Sentry.Handlers.requestHandler({
    // Include user context
    user: ['id', 'wallet'],
    // Include IP address
    ip: true,
    // Include request data
    request: ['method', 'url', 'query_string'],
  });
}

/**
 * Manually capture an exception
 * Use for errors that are caught but should still be reported
 */
export function captureException(error, context = {}) {
  if (!isEnabled) {
    log.error({ err: error, ...context }, 'Error captured (Sentry disabled)');
    return;
  }

  Sentry.withScope(scope => {
    // Add extra context
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });

    // Add wallet as user if available
    if (context.wallet) {
      scope.setUser({ id: context.wallet });
    }

    Sentry.captureException(error);
  });

  log.error({ err: error, ...context }, 'Error captured and sent to Sentry');
}

/**
 * Manually capture a message
 * Use for important events that aren't errors
 */
export function captureMessage(message, level = 'info', context = {}) {
  if (!isEnabled) {
    log.info({ ...context }, message);
    return;
  }

  Sentry.withScope(scope => {
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
    scope.setLevel(level);
    Sentry.captureMessage(message);
  });
}

/**
 * Set user context for subsequent events
 * Call after authenticating a wallet
 */
export function setUser(wallet) {
  if (!isEnabled) return;
  Sentry.setUser({ id: wallet });
}

/**
 * Clear user context
 * Call on logout or session end
 */
export function clearUser() {
  if (!isEnabled) return;
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 * Breadcrumbs show the trail of events leading to an error
 */
export function addBreadcrumb(message, category = 'app', data = {}) {
  if (!isEnabled) return;
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

/**
 * Start a performance transaction
 * Use for monitoring slow operations
 */
export function startTransaction(name, op = 'task') {
  if (!isEnabled) return null;
  return Sentry.startTransaction({ name, op });
}

/**
 * Flush pending events before shutdown
 * Call this before process.exit()
 */
export async function flush(timeout = 2000) {
  if (!isEnabled) return;
  await Sentry.close(timeout);
}

export default {
  init: initSentry,
  errorHandler: sentryErrorHandler,
  requestHandler: sentryRequestHandler,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  addBreadcrumb,
  startTransaction,
  flush,
  isEnabled,
};
