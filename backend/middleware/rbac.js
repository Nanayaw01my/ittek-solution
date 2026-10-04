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
  // The COO runs the operation, so they reach everything the CEO reaches.
  // Only the Super Admin sits above, and only for the things that destroy
  // data — clearing records and restoring backups — which are gated by role
  // rather than by level precisely so a level cannot grant them by accident.
  COO: 3,
  Manager: 2,
  Sales: 1,
  // A DSR on the field. Level 1 so everything gated at Manager and above is
  // shut to them, but the level is not the real boundary — see
  // FIELD_AGENT_ALLOWED in middleware/auth.js, which is an allowlist.
  'Field Agent': 1,
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
      // Says where the grant is made, not just that one is needed. "Ask the
      // CEO" reads like a request has been filed somewhere, so the CEO goes
      // looking for an approval queue, finds none, and nobody is unblocked.
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this yet. The CEO can switch it on '
          + 'under Users → open your account → "Extra screens this user can open".',
      });
    }

    // Handlers branch on this rather than re-deriving it from the role.
    req.pageMode = effectiveMode(req.user, page);
    next();
  };
};

/**
 * The roles that run the business.
 *
 * Kept here, beside the levels, because a dozen files were each carrying
 * their own ['CEO', 'Super Admin'] — and a role added to the levels but not
 * to those lists exists everywhere except the places that actually decide
 * what somebody can do. Which is how a new role half-works.
 */
const OWNER_ROLES = ['CEO', 'COO', 'Super Admin'];
const isOwner = (role) => OWNER_ROLES.includes(role);

module.exports = {
  requireRoles, requireLevel, requirePage, ROLE_LEVELS, OWNER_ROLES, isOwner,
};
