/**
 * Audit Middleware - Automatically logs all admin write operations
 *
 * Features:
 * - Captures request body (before state context)
 * - Captures response data (after state context)
 * - Logs IP address, user agent, request path
 * - Skips read-only operations (GET-like POSTs that just fetch data)
 */

import { query } from '../db/index.js';
import { loggers } from '../utils/logger.js';

const log = loggers.audit;

// Endpoints that are read-only (don't modify data) - skip detailed audit logging
const READ_ONLY_ENDPOINTS = [
  '/admin/verify',
  '/admin/status',
  '/admin/domains',         // POST but just lists
  '/admin/tlds/list',
  '/admin/audit',
  '/admin/audit/export',
  '/admin/reserved/list',
  '/admin/db/stats',
  '/admin/db/pending',
  '/admin/pricing/compare',
  '/admin/pricing/history',
  '/admin/hns/wallet',
  '/admin/flr/wallet',
  '/admin/addresses',
  '/admin/comfyui/status',
  '/admin/comfyui/generation-counts',
  '/listener/stats',
  '/diagnostics',
];

// Map endpoint patterns to action names for clearer audit logs
const ENDPOINT_ACTION_MAP = {
  '/listener/start': { action: 'service_start', entityType: 'service', entityId: 'contractListener' },
  '/listener/stop': { action: 'service_stop', entityType: 'service', entityId: 'contractListener' },
  '/watcher/start': { action: 'service_start', entityType: 'service', entityId: 'watcher' },
  '/watcher/stop': { action: 'service_stop', entityType: 'service', entityId: 'watcher' },
  '/price-sync/start': { action: 'service_start', entityType: 'service', entityId: 'priceSync' },
  '/price-sync/stop': { action: 'service_stop', entityType: 'service', entityId: 'priceSync' },
  '/price-sync/force': { action: 'price_sync_forced', entityType: 'service', entityId: 'priceSync' },
  '/admin/tlds': { action: 'tld_created', entityType: 'tld' },
  '/admin/tlds/sync': { action: 'tld_sync', entityType: 'tld', entityId: 'bulk' },
  '/admin/reserved': { action: 'reserved_word_added', entityType: 'reserved_word' },
  '/admin/hns/start': { action: 'service_start', entityType: 'service', entityId: 'hns_node' },
  '/admin/hns/stop': { action: 'service_stop', entityType: 'service', entityId: 'hns_node' },
  '/admin/comfyui/restart-all': { action: 'gpu_restart_all', entityType: 'gpu', entityId: 'all' },
  '/admin/comfyui/reset-all-counters': { action: 'gpu_reset_counters', entityType: 'gpu', entityId: 'all' },
};

/**
 * Determine if an endpoint is read-only (just fetches data)
 */
function isReadOnlyEndpoint(path) {
  // Exact matches
  if (READ_ONLY_ENDPOINTS.includes(path)) {
    return true;
  }

  // Pattern matches for GET-like endpoints
  if (path.startsWith('/diagnostics')) return true;

  return false;
}

/**
 * Extract action info from endpoint path
 */
function getActionInfo(method, path, reqBody) {
  // Check direct mapping
  const mapped = ENDPOINT_ACTION_MAP[path];
  if (mapped) {
    return {
      action: mapped.action,
      entityType: mapped.entityType,
      entityId: mapped.entityId || reqBody?.id || reqBody?.name || 'unknown',
    };
  }

  // Dynamic endpoint patterns

  // PUT /admin/domains/:id/status
  const domainStatusMatch = path.match(/\/admin\/domains\/(\d+)\/status/);
  if (domainStatusMatch) {
    return {
      action: 'domain_status_update',
      entityType: 'domain',
      entityId: domainStatusMatch[1],
    };
  }

  // PUT /admin/tlds/:id
  const tldUpdateMatch = path.match(/\/admin\/tlds\/(\d+)/);
  if (tldUpdateMatch && method === 'PUT') {
    return {
      action: reqBody?.is_active ? 'tld_activated' : 'tld_deactivated',
      entityType: 'tld',
      entityId: tldUpdateMatch[1],
    };
  }

  // DELETE /admin/reserved/:word
  const reservedDeleteMatch = path.match(/\/admin\/reserved\/(.+)/);
  if (reservedDeleteMatch && method === 'DELETE') {
    return {
      action: 'reserved_word_removed',
      entityType: 'reserved_word',
      entityId: reservedDeleteMatch[1],
    };
  }

  // POST /admin/comfyui/restart/:gpuId
  const gpuRestartMatch = path.match(/\/admin\/comfyui\/restart\/(.+)/);
  if (gpuRestartMatch) {
    return {
      action: 'gpu_restart',
      entityType: 'gpu',
      entityId: gpuRestartMatch[1],
    };
  }

  // POST /admin/comfyui/reset-counter/:gpuId
  const gpuResetMatch = path.match(/\/admin\/comfyui\/reset-counter\/(.+)/);
  if (gpuResetMatch) {
    return {
      action: 'gpu_counter_reset',
      entityType: 'gpu',
      entityId: gpuResetMatch[1],
    };
  }

  // Default fallback
  return {
    action: `${method.toLowerCase()}_${path.split('/').filter(Boolean).pop() || 'unknown'}`,
    entityType: 'api',
    entityId: path,
  };
}

/**
 * Sanitize request body for logging (remove sensitive data)
 */
function sanitizeBody(body) {
  if (!body) return null;

  const sanitized = { ...body };

  // Remove sensitive fields
  const sensitiveFields = ['signature', 'nonce', 'password', 'privateKey', 'secret'];
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Get client IP address from request
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Log action to audit_log table
 */
async function logToAudit(data) {
  try {
    await query(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      data.action,
      data.entityType,
      String(data.entityId),
      data.actorWallet,
      JSON.stringify(data.details),
    ]);
  } catch (error) {
    log.error({ error: error.message }, 'Failed to log audit entry');
  }
}

/**
 * Create audit middleware
 * Use AFTER authentication middleware so req.authenticatedWallet is available
 */
export function createAuditMiddleware() {
  return async (req, res, next) => {
    const startTime = Date.now();
    const path = req.path;
    const method = req.method;

    // Skip read-only endpoints
    if (isReadOnlyEndpoint(path) || method === 'GET') {
      return next();
    }

    // Skip if no authenticated wallet (shouldn't happen with proper middleware order)
    if (!req.authenticatedWallet) {
      return next();
    }

    // Capture original response methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    let responseBody = null;
    let responseStatus = 200;

    // Override res.json to capture response
    res.json = function(body) {
      responseBody = body;
      responseStatus = res.statusCode;
      return originalJson(body);
    };

    res.send = function(body) {
      if (typeof body === 'object') {
        responseBody = body;
      }
      responseStatus = res.statusCode;
      return originalSend(body);
    };

    // Process request
    res.on('finish', async () => {
      const duration = Date.now() - startTime;

      // Only log successful write operations (2xx status codes)
      // Also log 4xx for security audit trail
      if (responseStatus >= 200 && responseStatus < 500) {
        const { action, entityType, entityId } = getActionInfo(method, path, req.body);

        const details = {
          method,
          path,
          statusCode: responseStatus,
          duration: `${duration}ms`,
          ip: getClientIp(req),
          userAgent: req.headers['user-agent']?.substring(0, 200) || 'unknown',
          request: sanitizeBody(req.body),
        };

        // Include response for successful operations (but limit size)
        if (responseStatus >= 200 && responseStatus < 300 && responseBody) {
          const responseStr = JSON.stringify(responseBody);
          if (responseStr.length < 5000) {
            details.response = responseBody;
          } else {
            details.response = { _truncated: true, success: responseBody?.success };
          }
        }

        // Include error message for failed operations
        if (responseStatus >= 400 && responseBody?.error) {
          details.error = responseBody.error;
        }

        await logToAudit({
          action,
          entityType,
          entityId,
          actorWallet: req.authenticatedWallet,
          details,
        });

        // Log audit entry
        log.debug({
          action,
          entityType,
          entityId,
          wallet: req.authenticatedWallet?.substring(0, 10),
          status: responseStatus,
        }, 'Audit entry logged');
      }
    });

    next();
  };
}

export default createAuditMiddleware;
