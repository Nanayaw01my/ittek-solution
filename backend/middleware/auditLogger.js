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

const DEFAULTS = {
  activity_alerts: 'important',
  sale_alerts: 'all',
  expense_alerts: 'all',
  large_sale_threshold: 5000,
  expense_threshold: 1000,
};

const alertSettings = async () => {
  if (Date.now() - settingsCache.at < SETTINGS_TTL && settingsCache.value) {
    return settingsCache.value;
  }
  try {
    const Settings = require('../models/Settings');
    const s = await Settings.findOne().select('notification_settings').lean();
    settingsCache = { at: Date.now(), value: { ...DEFAULTS, ...(s?.notification_settings || {}) } };
  } catch {
    settingsCache = { at: Date.now(), value: { ...DEFAULTS } };
  }
  return settingsCache.value;
};

const gh = (n) => 'GHC' + Number(n || 0).toFixed(2);

/**
 * Sales and expenses happen all day, so how loudly to report one is a
 * setting rather than a rule — and a big one is worth saying so about even
 * when every one is being reported.
 */
const moneyEvent = (action, details, settings) => {
  const isSale = action === 'PROCESS_SALE';
  const isExpense = action === 'CREATE_EXPENSE';
  if (!isSale && !isExpense) return null;

  const amount = Number(isSale ? details?.total : details?.amount) || 0;
  const mode = isSale ? settings.sale_alerts : settings.expense_alerts;
  const threshold = Number(
    isSale ? settings.large_sale_threshold : settings.expense_threshold
  ) || 0;
  const big = threshold > 0 && amount >= threshold;

  let level = 'low';
  if (mode === 'all') level = 'high';
  else if (mode === 'large') level = big ? 'high' : 'low';

  return {
    level,
    big,
    label: isSale
      ? `made a ${big ? 'large ' : ''}sale of ${gh(amount)}`
      : `recorded ${big ? 'a large' : 'an'} expense of ${gh(amount)}`,
  };
};

const tellOwners = async (req, action, details) => {
  try {
    // Changing this setting is itself an audited action, so it is the one
    // moment the cached value is certainly stale. Without this the CEO turns
    // alerts off and keeps being alerted for another minute, and reasonably
    // concludes the switch does not work.
    if (action === 'UPDATE_SETTINGS') settingsCache = { at: 0, value: null };

    const settings = await alertSettings();
    const setting = settings.activity_alerts;
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

    const named = describe(action);
    // A sale or an expense is decided by its own setting and its amount.
    const money = moneyEvent(action, details, settings);
    const label = money ? money.label : named.label;
    const level = money ? money.level : named.level;

    const { notifyOwners } = require('../utils/notify');

    await notifyOwners({
      type: level === 'high' ? 'important' : 'info',
      title: `${req.user.username} ${label}`,
      message: summarise(details),
      link: '/notifications',
      // Only the notable ones reach the phone unless the CEO asked for all.
      // The bell keeps everything either way.
      silent: !(setting === 'all' || level === 'high'),
      // A large one gets its own tag so it does not replace, or get replaced
      // by, the ordinary run of the day.
      tag: money?.big ? 'money-large' : `activity-${level}`,
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
    // Bound defensively: this wraps every route in the app, and a response
    // object missing one of these must not take the route down with it.
    const originalJson = typeof res.json === 'function' ? res.json.bind(res) : null;
    const originalSend = typeof res.send === 'function' ? res.send.bind(res) : null;
    const originalEnd = typeof res.end === 'function' ? res.end.bind(res) : null;
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

    if (originalJson) {
      res.json = function (body) {
        const out = originalJson(body);
        record(body);
        return out;
      };
    }
    if (originalSend) {
      res.send = function (body) {
        const out = originalSend(body);
        record(body);
        return out;
      };
    }
    if (originalEnd) {
      res.end = function (...args) {
        const out = originalEnd(...args);
        record(null);
        return out;
      };
    }

    next();
  };
};

module.exports = { auditLog };
