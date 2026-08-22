/**
 * Role-Based Access Control middleware for ITTEK Solution.
 *
 * Role levels:
 *   Super Admin = 4
 *   CEO         = 3
 *   Manager     = 2
 *   Sales       = 1
 */

const ROLE_LEVELS = {
  'Super Admin': 4,
  CEO: 3,
  Manager: 2,
  Sales: 1,
};

/**
 * requireRoles(...roles)
 * Returns middleware that checks req.user.role is in the allowed roles list.
 *
 * Usage: requireRoles('Super Admin', 'CEO')
 */
const requireRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}.`,
      });
    }

    next();
  };
};

/**
 * requireLevel(minLevel)
 * Returns middleware that requires the user's role level to be >= minLevel.
 *
 * Usage: requireLevel(3) // CEO and Super Admin only
 */
const requireLevel = (minLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const userLevel = ROLE_LEVELS[req.user.role] || 0;
    if (userLevel < minLevel) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
      });
    }

    next();
  };
};

/**
 * requirePage(page, ...modes)
 *
 * Opens a route to anyone whose role already reaches the page, plus anyone the
 * CEO granted it to at one of the listed modes. With no modes listed, any grant
 * on that page will do.
 *
 * Usage: requirePage('products', 'inventory', 'full')
 */
const { canAccessPage, effectiveMode } = require('../config/pageAccess');

const requirePage = (page, ...modes) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    if (!canAccessPage(req.user, page, modes.length ? modes : null)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Ask the CEO to grant you this.',
      });
    }

    // Handlers branch on this rather than re-deriving it from the role.
    req.pageMode = effectiveMode(req.user, page);
    next();
  };
};

module.exports = { requireRoles, requireLevel, requirePage, ROLE_LEVELS };
