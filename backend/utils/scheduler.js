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

const startSchedulers = () => {
  console.log('[Scheduler] Initializing scheduled jobs...');

  // Daily summary at 11:00 PM
  cron.schedule('0 23 * * *', async () => {
    await sendDailySummary();
  });
  console.log('[Scheduler] Daily summary scheduled at 11:00 PM.');

  // Email queue processor every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await runEmailQueueProcessor();
  });
  console.log('[Scheduler] Email queue processor scheduled every 5 minutes.');

  // Overdue debt updater at midnight
  cron.schedule('0 0 * * *', async () => {
    await updateOverdueDebts();
  });
  console.log('[Scheduler] Overdue debt updater scheduled at midnight.');

  // Low stock checker at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    await checkLowStock();
  });
  console.log('[Scheduler] Low stock checker scheduled at 9:00 AM.');

  // Fraud sweep at 11:30 PM, after the day's trading is done
  cron.schedule('30 23 * * *', async () => {
    await runFraudScan();
  });
  console.log('[Scheduler] Fraud scan scheduled at 11:30 PM.');

  // Overdue layaway marking at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    await markOverdueLayaways();
  });
  console.log('[Scheduler] Layaway overdue check scheduled at 1:00 AM.');
};

module.exports = {
  startSchedulers,
  runFraudScan,
  markOverdueLayaways,
  sendDailySummary,
  updateOverdueDebts,
  checkLowStock,
  runEmailQueueProcessor,
};
