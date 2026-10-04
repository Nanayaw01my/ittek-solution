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
    const backups = {
      // Two days without one means last night's failed and nobody noticed.
      state: !lastBackup || backupAge > 2 ? 'bad'
        : lastBackup.ok === false ? 'bad'
          : backupAge > 1 ? 'warn' : 'ok',
      last_at: lastBackup?.createdAt || null,
      last_ago: ago(lastBackup?.createdAt),
      ok: lastBackup?.ok ?? null,
      message: lastBackup?.message
        || (lastBackup ? null : 'No backup has ever been taken by the system.'),
    };

    const settings = await Settings.findOne()
      .select('+sms_config.api_key sms_config debt_chasing company_email').lean();

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

module.exports = { systemHealth, runJobsNow, ago };
