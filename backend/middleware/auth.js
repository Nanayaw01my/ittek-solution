const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * What a Field Agent (DSR) is allowed to reach, as an ALLOWLIST.
 *
 * A role level cannot express this. Level 1 would hand them the till, because
 * the POS routes are open to any signed-in user — and a rep ringing a sale
 * through the till would deduct shop stock for goods already taken out on
 * their sheet, quietly draining the stock figure twice a day.
 *
 * An allowlist is deliberate: it is checked in one place, before any route
 * runs, and a route added later is closed to field agents until someone names
 * it here. A denylist would have to be remembered every time, and would not be.
 */
const FIELD_AGENT_ALLOWED = [
  '/api/auth',           // sign in, sign out, /me
  '/api/dispatches',     // their own sheets; issuing and Pay are barred on the routes
  '/api/phone-sales',    // taking a credit application in front of a customer
  '/api/upload',         // the Ghana card photographs that go with one
  '/api/notifications',
  '/api/settings',       // company name and logo for the printed sheet
];

// Deliberately NOT here: /api/products. A rep has no business browsing what
// the shop holds. Their portal shows what is in their own hands and nothing
// else, so the catalogue — quantities, cost prices, everything — stays at the
// shop. The goods are chosen for them at the counter.


/**
 * What a Managing Director's account may reach.
 *
 * The MD ranks beside the CEO but does not do the CEO's job: their remit
 * is the business's own figures, what it is owed, who it buys from, and
 * what the shop floor is asking for. Everything else — the till, the
 * catalogue, the staff screens, the settings — is somebody else's work.
 *
 * An allowlist rather than a level, for the same reason the field agent
 * has one: a level says how senior somebody is, and this is not about
 * seniority. Hiding the menu alone would not do it either — the screens
 * would be gone and the API still open, which is a locked door beside an
 * open window.
 */
const MANAGING_DIRECTOR_ALLOWED = [
  '/api/auth',            // sign in, sign out, /me
  '/api/director',        // their own portal
  '/api/debts',           // what the shop is owed
  '/api/reminders',       // chasing it, which the Debts screen does
  '/api/suppliers',       // who the shop buys from
  '/api/stock-requests',  // and approving what the floor asks for
  '/api/products',        // the picker inside a stock request, and supplier lookups
  '/api/notifications',
  '/api/settings',        // company name, currency, the shop's own thresholds
];

const reaches = (req, allowed) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return allowed.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
};

const managingDirectorMayReach = (req) => reaches(req, MANAGING_DIRECTOR_ALLOWED);

const fieldAgentMayReach = (req) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return FIELD_AGENT_ALLOWED.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/')
  );
};

/**
 * authenticate: verify JWT token from Authorization header (Bearer token).
 * Attaches the full user document to req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please log in again.',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid. User not found.',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Contact an administrator.',
      });
    }

    req.user = user;

    if (user.role === 'Field Agent' && !fieldAgentMayReach(req)) {
      return res.status(403).json({
        success: false,
        message: 'Field agents can only use the Field Dispatch screen.',
      });
    }

    if (user.role === 'Managing Director' && !managingDirectorMayReach(req)) {
      return res.status(403).json({
        success: false,
        message: 'That screen is not part of the Managing Director\'s remit.',
      });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Authentication error.',
    });
  }
};

module.exports = {
  MANAGING_DIRECTOR_ALLOWED, authenticate };
