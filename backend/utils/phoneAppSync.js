const Target = require('../models/Target');
const { ASPECTS } = require('../config/aspects');

/**
 * Pulling the IT department's figures out of the shop's other system.
 *
 * dandorsolar.site runs the phone side of the business — instalments,
 * collections, handsets — and its settings screen hands out API keys
 * with a "read sales (and the sales summary for targets)" permission.
 * This is the thing that uses it.
 *
 * It is written to be forgiving on purpose. Nobody here has seen that
 * API's replies, and guessing one exact field name and failing silently
 * on anything else would mean an afternoon of pasting JSON back and
 * forth. So it tries the handful of addresses such an endpoint is
 * normally at, accepts the handful of names such fields normally have,
 * and when it cannot make sense of a reply it SAYS SO and hands back
 * what it actually received. A sync that fails loudly with the evidence
 * in its hand is worth five that fail quietly.
 */

/** Where a "sales summary for targets" usually lives. */
const CANDIDATE_PATHS = [
  /**
   * Payments first, and payments are the point.
   *
   * A phone goes out on a plan: something down, then weekly. What
   * counts towards IT's target is money that actually arrived, so the
   * thing to read is the payments, not the sales. Reading the sales
   * would credit the department with the whole value of a handset the
   * week it was signed for and eleven weeks before it is paid off.
   */
  '/payments',
  '/payments/summary',
  '/collections',
  '/transactions',
  '/sales',
  '/sales/summary',
  '/targets',
  '/summary',
];

/** The same idea under whatever name the other system gave it. */
/** Where a record says when it happened. */
const DATE_FIELDS = [
  'paid_at', 'payment_date', 'paidAt', 'sale_date', 'sold_at',
  'created_at', 'createdAt', 'date', 'timestamp',
  'purchased_at', 'started_at', 'opened_at',
];

/** What a payment record calls the money. */
const AMOUNT_FIELDS = [
  'amount', 'amount_paid', 'paid', 'paid_amount', 'value', 'total', 'sum',
];

const FIELD = {
  department: ['department', 'dept', 'aspect', 'category', 'section', 'business_line', 'line'],
  year: ['year', 'yr'],
  month: ['month', 'mth'],
  period: ['period', 'month_key', 'yyyymm', 'date', 'for_month'],
  target: ['target', 'goal', 'quota', 'expected', 'target_count', 'targets'],
  achieved: ['achieved', 'actual', 'completed', 'done', 'count', 'sold', 'total', 'achieved_count'],
  unit: ['unit', 'units', 'measure', 'counting'],
};

const pick = (row, names) => {
  for (const n of names) {
    if (row && row[n] !== undefined && row[n] !== null) return row[n];
  }
  return undefined;
};

/**
 * Everything from that system is the IT department's.
 *
 * dandorsolar.site reports phone sales and nothing else, and phone
 * sales are part of IT. So there is no department to work out, and no
 * row to throw away for want of a label — which is what an earlier
 * version of this did, guessing a department out of whatever text it
 * found and discarding anything it could not place.
 */
const PHONE_DEPARTMENT = 'networking';

/** "2026-11", "2026/11", "202611", or separate year and month fields. */
const periodOf = (row) => {
  const y = Number(pick(row, FIELD.year));
  const m = Number(pick(row, FIELD.month));
  if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
    return { year: y, month: m };
  }

  const p = String(pick(row, FIELD.period) || '').trim();
  const match = p.match(/^(\d{4})\D?(\d{1,2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }

  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

const num = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};

/** Rows can arrive bare, or wrapped in any of the usual envelopes. */
const rowsOf = (body) => {
  if (Array.isArray(body)) return body;
  for (const key of ['data', 'targets', 'results', 'items', 'rows', 'summary']) {
    const inner = body?.[key];
    if (Array.isArray(inner)) return inner;
    if (inner && typeof inner === 'object') {
      for (const k2 of ['targets', 'results', 'items', 'rows']) {
        if (Array.isArray(inner[k2])) return inner[k2];
      }
    }
  }
  // A single object that looks like one row is one row.
  if (body && typeof body === 'object' && pick(body, [...FIELD.target, ...FIELD.achieved]) !== undefined) {
    return [body];
  }
  return null;
};

/** When a record happened, or null if it does not say. */
const dateOf = (row) => {
  for (const f of DATE_FIELDS) {
    const v = row?.[f];
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
};

/** The money on a record, if it carries any. */
const amountOf = (row) => {
  for (const f of AMOUNT_FIELDS) {
    const v = row?.[f];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

/**
 * Records grouped into the months they happened in, counted and added
 * up.
 *
 * Both, because the two answer different questions and only one of
 * them is the target: the money is what a department is measured on,
 * and the count is what makes the money believable.
 */
const countRecords = (rows) => {
  const byMonth = new Map();
  for (const row of rows) {
    const d = dateOf(row);
    if (!d) continue;
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const held = byMonth.get(key) || { count: 0, amount: 0, withMoney: 0 };
    held.count += 1;
    const amount = amountOf(row);
    if (amount !== null) { held.amount += amount; held.withMoney += 1; }
    byMonth.set(key, held);
  }
  return [...byMonth.entries()].map(([key, held]) => {
    const [year, month] = key.split('-').map(Number);
    return {
      year, month, count: held.count,
      amount: held.withMoney > 0 ? Number(held.amount.toFixed(2)) : null,
    };
  });
};

/**
 * Whether the reply admitted to being one page of several.
 *
 * A count that is really "the first fifty" is worse than no count, so
 * whatever the other system said about its own size is passed on.
 */
const pageNote = (body, got) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const total = Number(body.total ?? body.count ?? body.total_count
    ?? body.pagination?.total ?? body.meta?.total);
  if (Number.isFinite(total) && total > got) {
    return `That system says it holds ${total} records and sent ${got}. `
      + 'The count below is only what it sent — ask for the rest before trusting it.';
  }
  return null;
};

/** One call, with the key in the three places such APIs usually want it. */
const call = async (url, key) => {
  const res = await fetch(url, {
    headers: {
      'X-API-Key': key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body, text: text.slice(0, 600) };
};

/**
 * Fetch, map, store.
 *
 * Returns a plain report rather than throwing: the screen shows it, and
 * when nothing could be mapped it includes a sample of the reply so the
 * mismatch can be seen rather than guessed at.
 */
const syncFromPhoneApp = async ({ by = 'Phone system' } = {}) => {
  const base = (process.env.PHONE_APP_API_URL || 'https://dandorsolar.site/api/v1')
    .replace(/\/+$/, '');
  const key = process.env.PHONE_APP_API_KEY;

  if (!key) {
    return {
      ok: false,
      reason: 'No key set. Put PHONE_APP_API_KEY in the server settings.',
    };
  }

  /**
   * A path set by hand wins and is tried alone. Once somebody knows the
   * real address there is no reason to keep knocking on five others,
   * and knocking looks like probing from the far end.
   */
  const override = (process.env.PHONE_APP_API_PATH || '').trim();
  const paths = override
    ? [override.startsWith('/') ? override : `/${override}`]
    : CANDIDATE_PATHS;

  const tried = [];
  for (const path of paths) {
    const url = `${base}${path}`;
    let answer;
    try {
      // eslint-disable-next-line no-await-in-loop
      answer = await call(url, key);
    } catch (err) {
      tried.push({ path, error: err.name === 'TimeoutError' ? 'timed out' : err.message });
      continue;
    }

    if (answer.status === 401 || answer.status === 403) {
      // The address is right and the key is not. Worth stopping on:
      // trying five more addresses with a bad key tells nobody
      // anything and looks like a guessing attempt from their end.
      /**
       * Say what to do about it. A key is refused for one of two
       * reasons — it was never right, or it was rotated at the other
       * end — and in both cases the remedy is the same and is not
       * obvious from the words "refused the key". Renaming a key in
       * that system turned out to generate a new one, which is exactly
       * the case this sentence is for.
       */
      return {
        ok: false,
        reason: 'The other system refused the key.',
        hint: 'Copy the key as it stands now from the phone app\u2019s settings into '
          + 'PHONE_APP_API_KEY on the server. Renaming or remaking a key there gives it a new value.',
        path,
        status: answer.status,
      };
    }
    if (answer.status >= 400) {
      tried.push({ path, status: answer.status });
      continue;
    }

    const rows = rowsOf(answer.body);
    if (!rows || rows.length === 0) {
      tried.push({ path, status: answer.status, note: 'nothing that looked like a list of figures' });
      continue;
    }

    /**
     * Does this reply carry figures, or records?
     *
     * The phone system's sales endpoint returns one object per sale —
     * an id, a status, a customer — and there is no "achieved" field
     * anywhere in it because the answer is simply how many there are.
     * Looking for a number and giving up when none was found was
     * looking for a summary that does not exist.
     *
     * So: if the rows carry a figure, read it. If they are records,
     * count them, by the month each one happened in.
     */
    const carriesFigures = rows.some(
      (r) => pick(r, [...FIELD.achieved, ...FIELD.target]) !== undefined
    );

    if (!carriesFigures) {
      const counted = countRecords(rows);
      if (counted.length === 0) {
        tried.push({ path, status: answer.status, note: 'records with no date in them' });
        continue;
      }

      const savedCounts = [];
      for (const { year, month, count, amount } of counted) {
        const now = new Date();
        const set = {
          department: PHONE_DEPARTMENT, year, month,
          achieved: count, achieved_source: 'api',
          achieved_set_by: by, achieved_set_at: now,
        };
        /**
         * The money, when the records carry any. This is what the
         * target is measured on; the count rides along beside it.
         */
        if (amount !== null) {
          set.external_amount = amount;
          set.external_set_by = by;
          set.external_set_at = now;
        }

        // eslint-disable-next-line no-await-in-loop
        await Target.findOneAndUpdate(
          { department: PHONE_DEPARTMENT, year, month },
          {
            $set: set,
            $setOnInsert: { target: 0, unit: 'payments', created_at: now },
          },
          { new: true, upsert: true }
        );
        savedCounts.push({ year, month, achieved: count, amount });
      }

      return {
        ok: true,
        path,
        counted: true,
        saved: savedCounts.length,
        rows: savedCounts,
        total_records: rows.length,
        /**
         * Said plainly, because a list endpoint usually hands back one
         * page. A count that is really "the first fifty" is worse than
         * no count, so whatever the reply said about its own size is
         * passed on rather than quietly ignored.
         */
        page_note: pageNote(answer.body, rows.length),
      };
    }

    const saved = [];
    const skipped = [];
    for (const row of rows) {
      const department = PHONE_DEPARTMENT;
      const { year, month } = periodOf(row);

      /**
       * Only ever the figure achieved.
       *
       * That system reports what has been sold; the goal is the shop's
       * to set, and the CEO sets it on this screen. A sync that also
       * wrote the target would quietly overwrite the number an owner
       * typed with whatever the phone system happened to call
       * "target" — and the overwriting would be invisible.
       */
      const achieved = num(pick(row, [...FIELD.achieved, ...FIELD.target]));
      if (achieved === undefined) {
        skipped.push({ row: Object.keys(row || {}), why: 'no figure in it' });
        continue;
      }

      const now = new Date();
      const set = {
        department, year, month,
        achieved, achieved_source: 'api', achieved_set_by: by, achieved_set_at: now,
      };

      // eslint-disable-next-line no-await-in-loop
      await Target.findOneAndUpdate(
        { department, year, month },
        {
          $set: set,
          /**
           * A month the shop has not set a goal for still gets its row,
           * with a target of zero: the figure is worth having, and the
           * screen reads "14 of 0" as plainly as it reads nothing at
           * all. Setting a target later leaves the figure alone.
           */
          $setOnInsert: { target: 0, unit: 'phone sales', created_at: now },
        },
        { new: true, upsert: true }
      );
      saved.push({ department, year, month, achieved });
    }

    if (saved.length === 0) {
      return {
        ok: false,
        reason: 'Reached the other system, but none of its rows could be read.',
        path,
        skipped: skipped.slice(0, 5),
        // The evidence, so the mismatch is visible rather than guessed.
        fields: Object.keys(rows[0] || {}),
        sample: JSON.stringify(rows[0] || {}).slice(0, 400),
      };
    }

    return { ok: true, path, saved: saved.length, rows: saved, skipped: skipped.slice(0, 5) };
  }

  /**
   * Nothing found, so ask the front door what it offers.
   *
   * An API's own base address very often answers with a list of its
   * routes, or an error that names them. That is worth one more request
   * and saves somebody hunting through another system's settings for a
   * path we could simply have been told.
   */
  let front = null;
  try {
    const answer = await call(base, key);
    front = {
      status: answer.status,
      body: answer.body ? JSON.stringify(answer.body).slice(0, 700) : answer.text,
    };
  } catch (err) {
    front = { error: err.name === 'TimeoutError' ? 'timed out' : err.message };
  }

  return {
    ok: false,
    reason: 'Could not find the sales summary on that system.',
    tried,
    front_door: front,
    sample: front?.body || null,
    hint: `Tried ${paths.join(', ')} under ${base}. `
      + 'If the real address is different, set PHONE_APP_API_PATH on the server.',
  };
};

module.exports = {
  syncFromPhoneApp, CANDIDATE_PATHS, PHONE_DEPARTMENT, periodOf, rowsOf, FIELD,
  dateOf, amountOf, countRecords, pageNote,
};
