const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * auditLog(action, getDetails)
 * Logs both successful (2xx) and failed (4xx/5xx) operations to AuditLog.
 *
 * @param {string} action - e.g. 'CREATE_SALE'
 * @param {Function} getDetails - optional (req, body) => Object for extra context
 */
const auditLog = (action, getDetails = null) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async function (body) {
      originalJson(body);

      if (!req.user) return;

      const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      const isFailure = res.statusCode >= 400;

      if (!isSuccess && !isFailure) return;

      try {
        let details = {};
        if (getDetails && typeof getDetails === 'function') {
          details = await getDetails(req, body);
        } else {
          details = {
            params: req.params,
            body_keys: Object.keys(req.body || {}),
          };
        }

        if (!isSuccess) {
          details.error = body?.message || `HTTP ${res.statusCode}`;
        }

        await AuditLog.create({
          user_id:    req.user._id,
          username:   req.user.username,
          role:       req.user.role,
          action,
          status:     isSuccess ? 'success' : 'failure',
          details,
          request_id: req.requestId,
          ip_address: req.ip || req.connection?.remoteAddress || 'unknown',
          timestamp:  new Date(),
        });
      } catch (err) {
        logger.error('Audit log write error', { error: err.message, action });
      }
    };

    next();
  };
};

module.exports = { auditLog };
