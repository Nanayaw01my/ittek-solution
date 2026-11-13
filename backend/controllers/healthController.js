const mongoose = require('mongoose');

/**
 * Whether the parts of this system that run on their own are actually running.
 *
 * A backup at 2am, a debt chased at 9, a warranty check-up — none of these
 * happen in front of anybody. They either work or they quietly stop, and the
 * way a shop finds out they stopped is the morning it needs the backup. The
 * existing /health only says the server answered, which is the one thing that
 * is obviously true if you are reading its answer.
 *
 * So this reports what cannot be seen: what ran today, what failed and why,
 * when the last backup was taken, whether there are credits left to send a
 * message with, and whether anybody's phone is actually subscribed to the
 * alerts the system thinks it is sending.
 */

const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** How long ago, in words a person reads rather than a timestamp. */
const ago = (date) => {
  if (!date) return 'never';
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/**
 * GET /api/health/system
 *
 * Every check answers with a state the screen can colour: 'ok', 'warn' or
 * 'bad'. Deciding that here rather than on the screen means one place knows
 * what "a backup is overdue" means, and a second screen cannot disagree.
 */
const systemHealth = async (req, res) => {
  try {
    const JobRun = require('../models/JobRun');
    const Settings = require('../models/Settings');
    const PushSubscription = require('../models/PushSubscription');
    const { DAILY_JOBS, dayKey } = require('../utils/scheduler');
    const push = require('../utils/push');
    const { smsBalance } = require('../utils/arkesel');

    const today = dayKey();
    const now = new Date();

    // ── The database ──────────────────────────────────────────────────────
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const dbState = mongoose.connection.readyState;
    const database = {
      state: dbState === 1 ? 'ok' : 'bad',
      label: states[dbState] || 'unknown',
      name: mongoose.connection?.name || null,
    };

    // ── Today's jobs, and the last time each one ran at all ───────────────
    const [todaysRuns, lastRuns] = await Promise.all([
      JobRun.find({ run_for: today }).lean(),
      JobRun.aggregate([
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$job', last: { $first: '$$ROOT' } } },
      ]),
    ]);

    const lastByJob = new Map(lastRuns.map((r) => [r._id, r.last]));
    const runToday = new Map(todaysRuns.map((r) => [r.job, r]));

    const jobs = DAILY_JOBS.map((job) => {
      const run = runToday.get(job.name);
      const last = lastByJob.get(job.name);
      // Not yet its hour is not a problem; past its hour with nothing to show
      // for it is the thing worth seeing.
      const due = now.getUTCHours() >= job.hour;

      let state = 'ok';
      let label = 'ran';
      if (run && run.ok === false) { state = 'bad'; label = 'failed'; }
      else if (run && run.ok === true) { state = 'ok'; label = run.caught_up ? 'ran (caught up)' : 'ran'; }
      else if (run) { state = 'warn'; label = 'started, no result'; }
      else if (due) { state = 'warn'; label = 'has not run yet'; }
      else { state = 'ok'; label = `due at ${String(job.hour).padStart(2, '0')}:00`; }

      return {
        name: job.name,
        hour: job.hour,
        state,
        label,
        message: run?.message || last?.message || null,
        last_run: last?.createdAt || null,
        last_run_ago: ago(last?.createdAt),
        last_ok: last?.ok ?? null,
      };
    });

    // ── The backup, which is the one that matters most ────────────────────
    const lastBackup = lastByJob.get('nightly_backup');
    const backupAge = lastBackup?.createdAt
      ? Math.floor((Date.now() - new Date(lastBackup.createdAt).getTime()) / 86400000)
      : null;
    /**
     * What to actually do about it.
     *
     * The screen used to tell anybody with a failing backup to set
     * BACKUP_EMAIL, whatever had gone wrong. On a mail server that timed out
     * that is the wrong errand, and an hour spent on the wrong errand is an
     * hour the shop still has no backup. The reason is in the message, so
     * the remedy is worked out from it here — one place, rather than a
     * screen guessing.
     */
    const remedyFor = (run) => {
      if (!run) return 'Check Settings → Email Config, then press “Run what is due”.';
      const why = String(run.message || '').toLowerCase();
      if (run.ok) return null;
      if (why.includes('no address') || why.includes('nowhere to go')
        || why.includes('nowhere to put')) {
        return 'Nothing is set up to keep a backup. Put an address in Settings → Company → '
          + 'Email (or set BACKUP_EMAIL on the server), and set Cloudinary up on the server '
          + 'for the off-site copy. Then press “Run what is due”.';
      }
      // Both routes failed, and the message carries both reasons. Naming the
      // off-site one first is deliberate: it is the route that works on this
      // host, so it is the one worth fixing.
      if (why.includes('could not save it anywhere')) {
        if (why.includes('cloudinary is not set up')) {
          return 'The backup was made and went nowhere. Set CLOUDINARY_CLOUD_NAME, '
            + 'CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the server so the off-site '
            + 'copy works — email alone is not reliable here, as the hosting plan blocks it.';
        }
        return 'The backup was made and went nowhere — both the off-site copy and the email '
          + 'failed. The reasons are in the message above; start with the off-site one.';
      }
      if (why.includes('too large')) {
        return 'The backup is too big to email. Download one by hand from Backup & Restore, '
          + 'and clear records you no longer need.';
      }
      // A refused login is checked first. Every send failure says "could not
      // email", so testing that first would report a wrong password as an
      // unreachable server and send somebody to look at the wrong thing.
      if (why.includes('invalid login') || why.includes('auth') || why.includes('credential')
        || why.includes('535') || why.includes('password')) {
        return 'The mail server refused the login. Check the user and password in '
          + 'Settings → Email Config — a Gmail account needs an app password, not the '
          + 'ordinary one — then send a test from there.';
      }
      if (why.includes('timeout') || why.includes('econn') || why.includes('etimedout')
        || why.includes('socket') || why.includes('getaddrinfo') || why.includes('ehostunreach')) {
        return 'The backup was made but the mail server could not be reached. On a free '
          + 'hosting plan this is usually the plan itself blocking SMTP, not a wrong '
          + 'setting — switch Settings → Email Config to Brevo, which sends over HTTPS, '
          + 'and send a test from there. Otherwise check the host and port, and try 465 '
          + 'if 587 times out.';
      }
      if (why.includes('could not email') || why.includes('smtp')) {
        return 'The backup was made but could not be emailed. Check Settings → Email Config '
          + 'and send a test from there.';
      }
      return 'Press “Run what is due” to try again, and take one by hand from Backup & Restore '
        + 'in the meantime.';
    };

    const backups = {
      // Two days without one means last night's failed and nobody noticed.
      state: !lastBackup || backupAge > 2 ? 'bad'
        : lastBackup.ok === false ? 'bad'
          : backupAge > 1 ? 'warn' : 'ok',
      last_at: lastBackup?.createdAt || null,
      last_ago: ago(lastBackup?.createdAt),
      ok: lastBackup?.ok ?? null,
      attempts: lastBackup?.attempts ?? null,
      message: lastBackup?.message
        || (lastBackup ? null : 'No backup has ever been taken by the system.'),
      remedy: remedyFor(lastBackup),
    };

    // Leaf paths only. Asking for sms_config and sms_config.api_key together
    // is a path collision, which mongo rejects outright — so this whole check
    // failed against a real database while passing every test that stubbed
    // the query.
    const settings = await Settings.findOne()
      .select('company_email debt_chasing sms_config.sender_id sms_config.enabled +sms_config.api_key')
      .lean();

    // ── Texting ───────────────────────────────────────────────────────────
    const apiKey = settings?.sms_config?.api_key || process.env.ARKESEL_API_KEY || '';
    const sender = settings?.sms_config?.sender_id || process.env.ARKESEL_SENDER_ID || '';
    const smsOn = settings?.sms_config?.enabled !== false;

    let balance = null;
    let smsNote = null;
    if (apiKey) {
      const got = await smsBalance({ apiKey }).catch(() => null);
      if (got?.ok) balance = got.balance;
      else smsNote = got?.message || 'Could not read the balance.';
    }

    const sms = {
      state: !apiKey || !sender ? 'bad'
        : !smsOn ? 'warn'
          : balance !== null && balance < 20 ? 'warn'
            : smsNote ? 'warn' : 'ok',
      configured: !!apiKey && !!sender,
      enabled: smsOn,
      sender_id: sender || null,
      balance,
      message: !apiKey ? 'No Arkesel key set — nothing can be texted.'
        : !sender ? 'No sender ID set — Arkesel will refuse every message.'
          : !smsOn ? 'Texting is switched off in Settings.'
            : smsNote || (balance !== null && balance < 20 ? 'Credits are running low.' : null),
    };

    // ── Debt chasing ──────────────────────────────────────────────────────
    const chaseRules = settings?.debt_chasing || {};
    const chaseRun = runToday.get('chase_debts');
    const chasing = {
      state: !chaseRules.enabled ? 'warn' : chaseRun?.ok === false ? 'bad' : 'ok',
      enabled: !!chaseRules.enabled,
      hour: chaseRules.hour ?? 9,
      message: !chaseRules.enabled
        ? 'Switched off — nobody is being chased automatically.'
        : chaseRun?.message || null,
    };

    // ── Phone alerts ──────────────────────────────────────────────────────
    const subs = await PushSubscription.countDocuments({}).catch(() => 0);
    const alerts = {
      state: !push.isConfigured() ? 'bad' : subs === 0 ? 'warn' : 'ok',
      configured: push.isConfigured(),
      devices: subs,
      message: !push.isConfigured()
        ? 'No VAPID keys on the server — no phone alert can be sent.'
        : subs === 0
          ? 'No phone has subscribed, so nothing is reaching anybody.'
          : null,
    };

    const checks = { database, backups, sms, chasing, alerts };
    // The worst of everything, so one glance answers "is anything wrong?"
    const worst = Object.values(checks).some((c) => c.state === 'bad') ? 'bad'
      : Object.values(checks).some((c) => c.state === 'warn')
        || jobs.some((j) => j.state !== 'ok') ? 'warn' : 'ok';

    return res.status(200).json({
      success: true,
      data: {
        state: worst,
        checked_at: now,
        day: today,
        uptime_seconds: Math.floor(process.uptime()),
        // Which code is actually running. "Is the server behind the app?" has
        // cost several rounds of guessing; Render sets RENDER_GIT_COMMIT on
        // every deploy, so the answer can simply be read off the screen.
        version: {
          commit: (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '').slice(0, 7) || null,
          branch: process.env.RENDER_GIT_BRANCH || null,
          started_at: new Date(Date.now() - process.uptime() * 1000),
        },
        checks,
        jobs,
      },
    });
  } catch (err) {
    console.error('System health error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not check: ${err.message}` });
  }
};

/**
 * POST /api/health/run-jobs
 *
 * Run whatever is due now, by hand. For the morning somebody looks at this
 * screen, sees the backup did not run, and wants it to run — rather than
 * waiting for tomorrow and hoping.
 */
const runJobsNow = async (req, res) => {
  try {
    const { runDueJobs } = require('../utils/scheduler');
    const ran = await runDueJobs({ reason: `asked by ${req.user.username}` });
    return res.status(200).json({
      success: true,
      message: ran.length ? `Ran: ${ran.join(', ')}.` : 'Nothing was outstanding.',
      data: { ran },
    });
  } catch (err) {
    console.error('Run jobs error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not run them.' });
  }
};

/**
 * GET /api/health/credit-sales-gap
 *
 * Credit agreement money that never reached the sales book. Reads only —
 * the shop sees which payments are involved and what it comes to before
 * anything is written into the figures.
 */
const creditSalesGap = async (req, res) => {
  try {
    const { findMissing } = require('../utils/creditSalesRepair');
    const since = req.query.since ? new Date(req.query.since) : undefined;
    const missing = await findMissing({ since: Number.isNaN(+since) ? undefined : since });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return res.status(200).json({
      success: true,
      data: {
        count: missing.length,
        total: Number(missing.reduce((s, m) => s + m.amount, 0).toFixed(2)),
        /** How much of it belongs to today, which is the only day still open. */
        today_count: missing.filter((m) => new Date(m.paid_at) >= startOfToday).length,
        today_total: Number(missing
          .filter((m) => new Date(m.paid_at) >= startOfToday)
          .reduce((s, m) => s + m.amount, 0).toFixed(2)),
        payments: missing.slice(0, 200),
        truncated: missing.length > 200,
      },
    });
  } catch (err) {
    console.error('Credit sales gap error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not check.' });
  }
};

/**
 * POST /api/health/credit-sales-gap/repair
 *
 * Write the missing rows, dated to the day the money changed hands.
 * `keys` restricts it to named payments; `today` to the day still open,
 * which is the safe default when something was recorded this evening and
 * nothing older should move.
 */
const repairCreditSales = async (req, res) => {
  try {
    const { repairMissing } = require('../utils/creditSalesRepair');

    let since;
    if (req.body?.today) {
      since = new Date();
      since.setHours(0, 0, 0, 0);
    } else if (req.body?.since) {
      const d = new Date(req.body.since);
      if (!Number.isNaN(+d)) since = d;
    }

    const keys = Array.isArray(req.body?.keys) ? req.body.keys : undefined;
    if (!keys && !since) {
      // Repairing everything ever is a real decision about days that have
      // been closed and reported on, so it has to be asked for outright.
      if (!req.body?.all) {
        return res.status(400).json({
          success: false,
          message: 'Say which payments: today, a date to start from, or all.',
        });
      }
    }

    const { repaired, failed, total } = await repairMissing({ since, keys, user: req.user });

    return res.status(200).json({
      success: true,
      data: {
        repaired: repaired.length,
        failed: failed.length,
        total,
        amount: Number(repaired.reduce((s, m) => s + m.amount, 0).toFixed(2)),
        details: repaired,
        problems: failed,
        message: repaired.length
          ? `Added ${repaired.length} ${repaired.length === 1 ? 'payment' : 'payments'} `
            + `to the takings, GH\u20b5${repaired.reduce((s, m) => s + m.amount, 0).toFixed(2)} in all.`
          : 'Nothing was missing.',
      },
    });
  } catch (err) {
    console.error('Repair credit sales error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not repair.' });
  }
};

module.exports = { systemHealth, runJobsNow, creditSalesGap, repairCreditSales, ago };
