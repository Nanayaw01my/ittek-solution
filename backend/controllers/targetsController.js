const crypto = require('crypto');
const Target = require('../models/Target');
const { ASPECTS } = require('../config/aspects');
const { maySeeTargets } = require('../config/targets');

/**
 * What each side of the business is aiming for this month, and how far
 * along it is.
 *
 * Two ways in. An owner types a target on the screen; the IT
 * department's own system pushes its targets and its progress over the
 * API. Both land in the same row, and the row remembers which of them
 * wrote which half.
 */

const DEPARTMENTS = ASPECTS.filter((a) => a.key !== 'other');
const DEPT_KEYS = DEPARTMENTS.map((a) => a.key);
const labelOf = (key) => (ASPECTS.find((a) => a.key === key) || {}).label || key;

const monthName = (m) => ([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
][m - 1] || '');

const forScreen = (row) => ({
  _id: row._id,
  department: row.department,
  department_label: labelOf(row.department),
  year: row.year,
  month: row.month,
  month_label: `${monthName(row.month)} ${row.year}`,
  unit: row.unit,
  target: row.target,
  target_amount: row.target_amount ?? null,
  achieved: row.achieved,
  progress: Target.progressOf(row),
  note: row.note,
  target_source: row.target_source,
  target_set_by: row.target_set_by,
  achieved_source: row.achieved_source,
  achieved_set_by: row.achieved_set_by,
  achieved_set_at: row.achieved_set_at,
});

/**
 * GET /api/targets?year=&month=
 *
 * The month asked for, with a row for every department whether or not
 * anybody has set one — a department missing from the list reads as a
 * department with nothing to do, rather than one nobody has set a
 * target for.
 */
const listTargets = async (req, res) => {
  try {
    if (!maySeeTargets(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Targets are for the CEO, the MD and the Super Admin.' });
    }

    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || (now.getMonth() + 1);

    const {
      earningsFor, stillOutFor, installationsFor,
    } = require('../utils/departmentEarnings');

    const [rows, earned, stillOut, installations] = await Promise.all([
      Target.find({ year, month }).lean(),
      earningsFor(year, month),
      stillOutFor(),
      installationsFor(year, month),
    ]);
    const byDept = new Map(rows.map((r) => [r.department, r]));

    const targets = DEPT_KEYS.map((key) => {
      const row = byDept.get(key) || null;
      const money = earned.get(key) || { revenue: 0, refunded: 0, net: 0, pieces: 0, sales: 0 };
      const goal = row?.target_amount ?? null;

      /**
       * Two sources, added, and shown apart.
       *
       * What this department sold on the road, out of the shop's own
       * records, plus whatever another system has reported for it —
       * which for IT is the money the phone app has actually collected,
       * down payments and weekly payments alike.
       *
       * They are kept visible as two numbers because they are two
       * different kinds of fact, and a single total hides which of them
       * moved.
       */
      const fromField = money.net;
      const fromOutside = Number(row?.external_amount ?? 0);
      const total = Number((fromField + fromOutside).toFixed(2));

      /**
       * The percentage the shop asked for, worked out here rather than
       * stored: it is the shop's own sales divided by the goal, and
       * both of those move.
       */
      const percent = goal ? Math.round((total / goal) * 100) : null;

      const base = row ? forScreen(row) : {
        _id: null,
        department: key,
        department_label: labelOf(key),
        year,
        month,
        month_label: `${monthName(month)} ${year}`,
        unit: 'jobs',
        target: null,
        achieved: null,
        progress: null,
        note: '',
      };

      return {
        ...base,
        target_amount: goal,
        earned: total,
        earned_field: fromField,
        earned_outside: fromOutside,
        outside_by: row?.external_set_by || '',
        earned_gross: money.revenue,
        refunded: money.refunded,
        sales_count: money.sales,
        percent,
        short_by: goal ? Math.max(0, Number((goal - total).toFixed(2))) : null,
        /** Out on a sheet, not yet paid for. Beside the figure, never in it. */
        still_out: stillOut.get(key) || 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        year,
        month,
        month_label: `${monthName(month)} ${year}`,
        targets,
        departments: DEPARTMENTS,
        /**
         * Installations booked this month, as a count for the whole
         * shop. A count because an installation record carries no
         * amount — the money for the job is on the sale that goes with
         * it, and is already in the figures above.
         */
        installations,
      },
    });
  } catch (err) {
    console.error('List targets error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/targets
 *
 * An owner setting a target, or recording progress by hand.
 */
const setTarget = async (req, res) => {
  try {
    if (!maySeeTargets(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Targets are for the CEO, the MD and the Super Admin.' });
    }

    const parsed = readTarget(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    const row = await writeTarget(parsed.value, { source: 'app', by: req.user.username });

    return res.status(200).json({
      success: true,
      data: { target: forScreen(row), message: 'Saved.' },
    });
  } catch (err) {
    console.error('Set target error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * Reading a target out of a request body, from the screen or the API.
 *
 * One function for both, so the outside system cannot store something
 * the screen would refuse — a negative target, a thirteenth month, a
 * department that does not exist.
 */
const readTarget = (body) => {
  const department = String(body?.department || '').trim().toLowerCase();
  if (!DEPT_KEYS.includes(department)) {
    return { error: `Unknown department. Use one of: ${DEPT_KEYS.join(', ')}.` };
  }

  const now = new Date();
  const year = Number(body?.year) || now.getFullYear();
  const month = Number(body?.month) || (now.getMonth() + 1);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: 'Month must be a number from 1 to 12.' };
  }
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { error: 'Year is out of range.' };
  }

  const value = { department, year, month };

  if (body?.target_amount !== undefined && body?.target_amount !== null) {
    const amount = Number(body.target_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return { error: 'The target must be an amount in cedis, zero or more.' };
    }
    value.target_amount = Number(amount.toFixed(2));
  }

  if (body?.target !== undefined && body?.target !== null) {
    const target = Number(body.target);
    if (!Number.isFinite(target) || target < 0) {
      return { error: 'Target must be a number, zero or more.' };
    }
    value.target = Math.round(target);
  }

  /**
   * Progress is optional and null means "not reported".
   *
   * A sender that omits it is not saying the department has done
   * nothing — it is saying nothing about progress at all, and the
   * figure already stored must survive that.
   */
  if (body?.achieved !== undefined && body?.achieved !== null) {
    const achieved = Number(body.achieved);
    if (!Number.isFinite(achieved) || achieved < 0) {
      return { error: 'Achieved must be a number, zero or more.' };
    }
    value.achieved = Math.round(achieved);
  }

  if (typeof body?.unit === 'string' && body.unit.trim()) {
    value.unit = body.unit.trim().slice(0, 24);
  }
  if (typeof body?.note === 'string') value.note = body.note.trim().slice(0, 500);

  if (value.target === undefined && value.achieved === undefined
      && value.target_amount === undefined) {
    return { error: 'Send a target, a number achieved, or both.' };
  }
  return { value };
};

/** Upsert, stamping only the halves this writer actually set. */
const writeTarget = async (value, { source, by }) => {
  const now = new Date();
  const set = { department: value.department, year: value.year, month: value.month };

  if (value.unit !== undefined) set.unit = value.unit;
  if (value.note !== undefined) set.note = value.note;
  if (value.target_amount !== undefined) {
    set.target_amount = value.target_amount;
    set.target_source = source;
    set.target_set_by = by;
    set.target_set_at = now;
  }

  if (value.target !== undefined) {
    set.target = value.target;
    set.target_source = source;
    set.target_set_by = by;
    set.target_set_at = now;
  }
  if (value.achieved !== undefined) {
    set.achieved = value.achieved;
    set.achieved_source = source;
    set.achieved_set_by = by;
    set.achieved_set_at = now;
  }

  return Target.findOneAndUpdate(
    { department: value.department, year: value.year, month: value.month },
    {
      $set: set,
      // A row created by a progress report alone still needs a target,
      // and 0 is the honest one: nobody has set a goal yet.
      $setOnInsert: value.target === undefined ? { target: 0, created_at: now } : { created_at: now },
    },
    { new: true, upsert: true }
  ).lean();
};

/**
 * Whether a request carries the shared key the IT system was given.
 *
 * Compared in constant time: a plain === leaks how much of a guess was
 * right through how long the comparison took, which is enough to walk a
 * key out one character at a time.
 *
 * The key lives in the environment, never in the code and never in the
 * database, and is not written to any log.
 */
const keyAccepted = (req) => {
  const expected = process.env.TARGETS_API_KEY || '';
  if (!expected) return false;

  const header = req.get('x-api-key')
    || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!header) return false;

  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * POST /api/targets/push
 *
 * The IT department's own system reporting in. No login: it is a
 * machine, and giving a machine a staff account would mean a password
 * that never changes and a person it does not belong to.
 */
const pushTarget = async (req, res) => {
  try {
    if (!process.env.TARGETS_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Target pushing is not switched on. Set TARGETS_API_KEY on the server.',
      });
    }
    if (!keyAccepted(req)) {
      return res.status(401).json({ success: false, message: 'Bad or missing API key.' });
    }

    /**
     * One call may carry one target or many, because a system reporting
     * at midnight has every reason to send the month in one go.
     */
    const items = Array.isArray(req.body) ? req.body
      : Array.isArray(req.body?.targets) ? req.body.targets
        : [req.body];

    if (items.length === 0 || items.length > 60) {
      return res.status(400).json({ success: false, message: 'Send between 1 and 60 targets.' });
    }

    const saved = [];
    const rejected = [];
    const by = String(req.body?.source_name || req.get('x-source-name') || 'IT system')
      .trim().slice(0, 60);

    for (const [i, item] of items.entries()) {
      const parsed = readTarget(item);
      if (parsed.error) {
        rejected.push({ index: i, reason: parsed.error });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const row = await writeTarget(parsed.value, { source: 'api', by });
      saved.push(forScreen(row));
    }

    /**
     * A partial success is reported as one, with the reasons. Answering
     * 200 for a call where half the rows were refused would have the
     * other system believing figures the shop never stored.
     */
    return res.status(rejected.length && !saved.length ? 400 : 200).json({
      success: saved.length > 0,
      data: {
        saved: saved.length,
        rejected,
        targets: saved,
        message: rejected.length
          ? `${saved.length} saved, ${rejected.length} refused.`
          : `${saved.length} saved.`,
      },
      ...(rejected.length && !saved.length ? { message: rejected[0].reason } : {}),
    });
  } catch (err) {
    console.error('Push target error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/targets/sync
 *
 * Go and ask the phone system now, rather than waiting for the hourly
 * sweep. The report comes back whole — including, when nothing could be
 * read, a sample of what the other system actually sent — because the
 * alternative is a spinner that stops and a screen that does not say
 * why.
 */
const syncTargets = async (req, res) => {
  try {
    if (!maySeeTargets(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Targets are for the CEO, the MD and the Super Admin.' });
    }
    const { syncFromPhoneApp } = require('../utils/phoneAppSync');
    const report = await syncFromPhoneApp({ by: 'Phone system' });

    return res.status(200).json({
      success: true,
      data: {
        ...report,
        message: report.ok
          ? `Brought in ${report.saved} ${report.saved === 1 ? 'figure' : 'figures'}.`
          : report.reason,
      },
    });
  } catch (err) {
    console.error('Sync targets error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  listTargets, setTarget, pushTarget, syncTargets, readTarget, keyAccepted, DEPT_KEYS,
};
