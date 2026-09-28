const AuditLog = require('../models/AuditLog');
const { describe } = require('../config/auditEvents');

/**
 * Telling the owners what just happened.
 *
 * The audit log already sees every action that changes anything, which makes
 * it the one place that can report all of them without a controller having to
 * remember to. Written after the audit row and never allowed to fail the
 * request: a notification that could not be sent must not undo the work.
 *
 * Owners are not told about their own actions — the CEO does not need his
 * phone telling him what he just did — but they are told about each other's.
 */
const SETTINGS_TTL = 60000;
let settingsCache = { at: 0, value: null };

const alertLevel = async () => {
  if (Date.now() - settingsCache.at < SETTINGS_TTL) return settingsCache.value;
  try {
    const Settings = require('../models/Settings');
    const s = await Settings.findOne().select('notification_settings').lean();
    settingsCache = {
      at: Date.now(),
      value: s?.notification_settings?.activity_alerts || 'important',
    };
  } catch {
    settingsCache = { at: Date.now(), value: 'important' };
  }
  return settingsCache.value;
};

const tellOwners = async (req, action, details) => {
  try {
    // Changing this setting is itself an audited action, so it is the one
    // moment the cached value is certainly stale. Without this the CEO turns
    // alerts off and keeps being alerted for another minute, and reasonably
    // concludes the switch does not work.
    if (action === 'UPDATE_SETTINGS') settingsCache = { at: 0, value: null };

    const setting = await alertLevel();
    if (setting === 'off') return;

    const { ROLE_LEVELS } = require('../config/pageAccess');
    // An owner's own action is not news to them.
    if ((ROLE_LEVELS[req.user.role] || 0) >= 3) {
      const User = require('../models/User');
      const others = await User.countDocuments({
        role: { $in: ['CEO', 'Super Admin'] },
        is_active: { $ne: false },
        _id: { $ne: req.user._id },
      });
      if (others === 0) return;
    }

    const { label, level } = describe(action);
    const { notifyOwners } = require('../utils/notify');

    await notifyOwners({
      type: level === 'high' ? 'important' : 'info',
      title: `${req.user.username} ${label}`,
      message: summarise(details),
      link: '/notifications',
      // Only the notable ones reach the phone unless the CEO asked for all.
      // The bell keeps everything either way.
      silent: !(setting === 'all' || level === 'high'),
      tag: `activity-${level}`,
      exclude_user_id: req.user._id,
    });
  } catch (err) {
    console.error('[audit] could not notify owners:', err.message);
  }
};

/** The details object as one readable line. */
const summarise = (details) => {
  if (!details || typeof details !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(details)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'params' || k === 'body_keys') continue;
    if (typeof v === 'object') continue;
    parts.push(`${k.replace(/_/g, ' ')}: ${v}`);
    if (parts.length === 4) break;
  }
  return parts.join(' · ');
};

/**
 * auditLog(action, getDetails)
 * Middleware factory that logs actions to the AuditLog collection.
 *
 * @param {string} action - Action name, e.g. 'CREATE_SALE', 'DELETE_USER'
 * @param {Function} getDetails - Optional async function (req, body) => {} for extra details
 *
 * Usage:
 *   router.post('/', authenticate, auditLog('CREATE_PRODUCT'), controller)
 */
const auditLog = (action, getDetails = null) => {
  return async (req, res, next) => {
    // Every way a route can answer, not just res.json. A backup downloads the
    // whole database through res.end, and hooking only json meant the one
    // action most worth knowing about was the one nothing recorded.
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);
    let recorded = false;

    const record = async (body) => {
      // res.json calls res.send, which calls res.end — so without this the
      // same action would be logged three times.
      if (recorded) return;
      recorded = true;

      // Only log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        try {
          let details = {};

          if (getDetails && typeof getDetails === 'function') {
            details = await getDetails(req, body) || {};
          } else {
            details = {
              params: req.params,
              body_keys: Object.keys(req.body || {}),
            };
          }

          await AuditLog.create({
            user_id: req.user._id,
            username: req.user.username,
            role: req.user.role,
            action,
            details,
            ip_address: req.ip || req.connection?.remoteAddress || 'unknown',
            timestamp: new Date(),
          });

          await tellOwners(req, action, details);
        } catch (err) {
          // Never let audit logging crash the request
          console.error('Audit log error:', err.message);
        }
      }
    };

    res.json = function (body) {
      const out = originalJson(body);
      record(body);
      return out;
    };
    res.send = function (body) {
      const out = originalSend(body);
      record(body);
      return out;
    };
    res.end = function (...args) {
      const out = originalEnd(...args);
      record(null);
      return out;
    };

    next();
  };
};

module.exports = { auditLog };
