/**
 * Retry utility with exponential backoff
 *
 * Usage:
 *   const result = await withRetry(() => someAsyncCall(), { maxRetries: 3, label: 'HNS getInfo' });
 */

import { loggers } from './logger.js';

const log = loggers.app;

/**
 * Execute an async function with exponential backoff retries
 * @param {Function} fn - Async function to execute
 * @param {object} options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.baseDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @param {string} options.label - Label for logging (default: 'operation')
 * @param {Function} options.shouldRetry - Predicate to decide if error is retryable (default: always true)
 * @param {pino.Logger} options.logger - Logger instance (default: loggers.app)
 * @returns {Promise<*>} Result of fn()
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    label = 'operation',
    shouldRetry = () => true,
    logger = log,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetry(error)) {
        logger.error({ err: error, attempt, maxRetries, label }, `${label} failed after ${attempt + 1} attempt(s)`);
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      logger.warn({ err: error, attempt, nextRetryMs: Math.round(jitter), label }, `${label} failed, retrying`);
      await new Promise(resolve => setTimeout(resolve, jitter));
    }
  }

  throw lastError;
}

/**
 * Check if an error is likely transient (network, timeout, rate limit)
 */
export function isTransientError(error) {
  const msg = error.message?.toLowerCase() || '';
  return (
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('timeout') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('rate') ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('502')
  );
}
