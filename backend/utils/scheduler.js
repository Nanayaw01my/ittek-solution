const cron = require('node-cron');

/**
 * Send daily summary email at 11:00 PM.
 */
const sendDailySummary = async () => {
  console.log('[Scheduler] Running daily summary email job...');
  try {
    const Sale = require('../models/Sale');
    const Expense = require('../models/Expense');
    const Settings = require('../models/Settings');
    const { queueEmail, templates } = require('./email');

    const settings = await Settings.findOne();
    if (!settings?.notification_settings?.email_notifications) {
      console.log('[Scheduler] Email notifications disabled. Skipping daily summary.');
      return;
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const sales = await Sale.find({ sale_date: { $gte: startOfDay, $lte: endOfDay } });
    const expenses = await Expense.find({ expense_date: { $gte: startOfDay, $lte: endOfDay } });

    const total_revenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const total_expenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const net_profit = total_revenue - total_expenses;

    const statsData = {
      date: today.toLocaleDateString('en-GH'),
      sales_count: sales.length,
      total_revenue,
      total_expenses,
      net_profit,
    };

    const recipientEmail = settings.company_email || process.env.EMAIL_USER;
    if (recipientEmail) {
      await queueEmail({
        to: recipientEmail,
        subject: `Daily Summary - ${today.toLocaleDateString('en-GH')}`,
        html: templates.dailySummary(statsData),
        priority: 'normal',
      });
      console.log('[Scheduler] Daily summary queued.');
    }
  } catch (err) {
    console.error('[Scheduler] Daily summary error:', err.message);
  }
};

/**
 * Update overdue debt statuses at midnight.
 */
const updateOverdueDebts = async () => {
  console.log('[Scheduler] Updating overdue debts...');
  try {
    const Debt = require('../models/Debt');
    const result = await Debt.updateMany(
      { status: 'active', due_date: { $lt: new Date() }, amount_paid: { $lt: '$amount_owed' } },
      { $set: { status: 'overdue' } }
    );
    console.log(`[Scheduler] Marked ${result.modifiedCount} debts as overdue.`);
  } catch (err) {
    console.error('[Scheduler] Overdue debts error:', err.message);
  }
};

/**
 * Check for low stock products at 9 AM and send alerts.
 */
const checkLowStock = async () => {
  console.log('[Scheduler] Checking low stock...');
  try {
    const Product = require('../models/Product');
    const Settings = require('../models/Settings');
    const { queueEmail, templates } = require('./email');

    const settings = await Settings.findOne();
    if (!settings?.notification_settings?.email_notifications) return;

    const lowStockProducts = await Product.find({
      is_active: true,
      $expr: { $lte: ['$quantity', '$low_stock_level'] },
    });

    if (lowStockProducts.length === 0) {
      console.log('[Scheduler] No low stock products found.');
      return;
    }

    const recipientEmail = settings.company_email || process.env.EMAIL_USER;
    if (recipientEmail) {
      await queueEmail({
        to: recipientEmail,
        subject: `Low Stock Alert - ${lowStockProducts.length} product(s)`,
        html: templates.lowStockAlert(lowStockProducts),
        priority: 'high',
      });
      console.log(`[Scheduler] Low stock alert queued for ${lowStockProducts.length} products.`);
    }
  } catch (err) {
    console.error('[Scheduler] Low stock check error:', err.message);
  }
};

/**
 * Process email queue every 5 minutes.
 */
const runEmailQueueProcessor = async () => {
  try {
    const { processEmailQueue } = require('./email');
    await processEmailQueue();
  } catch (err) {
    console.error('[Scheduler] Email queue processor error:', err.message);
  }
};

/**
 * Start all scheduled jobs.
 */
/** Nightly anomaly sweep plus overdue-layaway marking. */
const runFraudScan = async () => {
  try {
    const { runDailyScan } = require('./fraudDetection');
    const alerts = await runDailyScan();
    console.log(`[Scheduler] Fraud scan complete — ${alerts.length} new alert(s).`);
  } catch (err) {
    console.error('[Scheduler] Fraud scan error:', err.message);
  }
};

const markOverdueLayaways = async () => {
  try {
    const Layaway = require('../models/Layaway');
    const cutoff = new Date();
    // A plan is only "defaulted" once it is well past its final date, not the
    // moment one installment slips — customers pay late all the time.
    cutoff.setDate(cutoff.getDate() - 30);
    const result = await Layaway.updateMany(
      { status: 'active', due_date: { $lt: cutoff }, balance: { $gt: 0 } },
      { $set: { status: 'defaulted' } }
    );
    if (result.modifiedCount) {
      console.log(`[Scheduler] Marked ${result.modifiedCount} layaway(s) defaulted.`);
    }
  } catch (err) {
    console.error('[Scheduler] Layaway overdue error:', err.message);
  }
};

/**
 * The day, as the shop counts it.
 *
 * Ghana keeps no daylight saving and sits on UTC, so the server's own day and
 * the shop's day are the same one. Written out rather than assumed, because
 * the day boundary is what decides whether a job has already run.
 */
const dayKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
};

/**
 * The jobs that run once a day, and the hour each is due.
 *
 * `hour` is when it should run if anybody is awake to notice. It is not a
 * promise: a job whose hour has passed and which has not run yet is run at
 * the first opportunity, which on a service that sleeps all night means the
 * moment somebody opens the app in the morning.
 */
const DAILY_JOBS = [
  // First, before anything else can go wrong with the day.
  { name: 'nightly_backup', hour: 2, run: () => require('./autoBackup').runNightlyBackup() },
  { name: 'low_stock', hour: 9, run: () => checkLowStock() },
  { name: 'overdue_debts', hour: 0, run: () => updateOverdueDebts() },
  { name: 'overdue_layaways', hour: 1, run: () => markOverdueLayaways() },
  { name: 'daily_summary', hour: 23, run: () => sendDailySummary() },
  { name: 'fraud_scan', hour: 23, run: () => runFraudScan() },
];

/** Jobs added by other parts of the system — backups, reminders, warranties. */
const registerDailyJob = (job) => {
  if (!job?.name || typeof job.run !== 'function') return;
  const at = DAILY_JOBS.findIndex((j) => j.name === job.name);
  if (at >= 0) DAILY_JOBS[at] = job; else DAILY_JOBS.push(job);
};

/**
 * Run whatever is due and has not run today.
 *
 * Claiming the row first and running second is deliberate. Two instances, or
 * a timer firing while a request is already catching up, both try to insert
 * the same { job, day } and the unique index lets exactly one through — so
 * the shop is never emailed the same summary twice, nor texted twice.
 *
 * A job that throws is recorded as failed and left alone until tomorrow.
 * Retrying a failed send every ten minutes would turn one broken job into a
 * hundred broken attempts, and on the SMS jobs that costs money.
 */
const runDueJobs = async ({ reason = 'timer' } = {}) => {
  const JobRun = require('../models/JobRun');
  const now = new Date();
  const today = dayKey(now);
  const ran = [];

  for (const job of DAILY_JOBS) {
    if (now.getUTCHours() < job.hour) continue;

    let claim;
    try {
      claim = await JobRun.create({
        job: job.name,
        run_for: today,
        caught_up: now.getUTCHours() > job.hour,
      });
    } catch (err) {
      // 11000 means somebody else has it. Anything else is worth seeing.
      if (err?.code !== 11000) console.error(`[Scheduler] ${job.name} claim failed:`, err.message);
      continue;
    }

    try {
      const result = await job.run({ day: today, reason });
      claim.ok = true;
      claim.message = typeof result === 'string' ? result.slice(0, 300) : undefined;
      ran.push(job.name);
    } catch (err) {
      claim.ok = false;
      claim.message = String(err?.message || err).slice(0, 300);
      console.error(`[Scheduler] ${job.name} failed:`, err.message);
    }
    claim.finished_at = new Date();
    await claim.save().catch(() => {});
  }

  if (ran.length) console.log(`[Scheduler] ran (${reason}): ${ran.join(', ')}`);
  return ran;
};

/**
 * Catching up when somebody uses the app.
 *
 * This is what actually makes the jobs happen. A service asleep since 6pm
 * misses its 11pm summary however good the cron expression is; it wakes when
 * the first person opens the till in the morning, and that request is the
 * opportunity to run what was missed.
 *
 * Throttled, and never awaited: the person opening the app is waiting for
 * their screen, not for a stock check.
 */
let lastSweep = 0;
const SWEEP_EVERY_MS = 5 * 60 * 1000;

const catchUpOnRequest = () => (req, res, next) => {
  next();
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  setImmediate(() => {
    runDueJobs({ reason: 'woken by a request' })
      .catch((err) => console.error('[Scheduler] catch-up failed:', err.message));
  });
};

const startSchedulers = () => {
  console.log('[Scheduler] Initializing scheduled jobs...');

  // Frequent enough that a job runs near its hour while the service is up,
  // and harmless when it is not: the claim row stops anything running twice.
  cron.schedule('*/10 * * * *', () => {
    runDueJobs({ reason: 'timer' }).catch((err) => console.error('[Scheduler]', err.message));
  });

  // The email queue is not a daily job — it is a drain, and running it twice
  // costs nothing.
  cron.schedule('*/5 * * * *', async () => {
    await runEmailQueueProcessor();
  });

  // Whatever was missed while the service was asleep.
  setTimeout(() => {
    runDueJobs({ reason: 'startup' }).catch((err) => console.error('[Scheduler]', err.message));
  }, 15000);

  console.log(`[Scheduler] ${DAILY_JOBS.length} daily jobs; checked every 10 minutes and on wake.`);
};

module.exports = {
  startSchedulers,
  runDueJobs,
  registerDailyJob,
  catchUpOnRequest,
  dayKey,
  DAILY_JOBS,
  runFraudScan,
  markOverdueLayaways,
  sendDailySummary,
  updateOverdueDebts,
  checkLowStock,
  runEmailQueueProcessor,
};
