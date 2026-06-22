const cron = require('node-cron');
const logger = require('./logger');

/**
 * Send daily summary email at 11:00 PM.
 */
const sendDailySummary = async () => {
  logger.info('[Scheduler] Running daily summary email job...');
  try {
    const Sale = require('../models/Sale');
    const Expense = require('../models/Expense');
    const Settings = require('../models/Settings');
    const { queueEmail, templates } = require('./email');

    const settings = await Settings.findOne();
    if (!settings?.notification_settings?.email_notifications) {
      logger.info('[Scheduler] Email notifications disabled. Skipping daily summary.');
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
      logger.info('[Scheduler] Daily summary queued.');
    }
  } catch (err) {
    logger.error('[Scheduler] Daily summary error:', err.message);
  }
};

/**
 * Update overdue debt statuses at midnight.
 */
const updateOverdueDebts = async () => {
  logger.info('[Scheduler] Updating overdue debts...');
  try {
    const Debt = require('../models/Debt');
    // Use $expr to correctly compare two fields within a document
    const result = await Debt.updateMany(
      {
        status: 'active',
        due_date: { $lt: new Date() },
        $expr: { $lt: ['$amount_paid', '$amount_owed'] },
      },
      { $set: { status: 'overdue' } }
    );
    logger.info('[Scheduler] Overdue debts updated', { count: result.modifiedCount });
  } catch (err) {
    logger.error('[Scheduler] Overdue debts error', { error: err.message });
  }
};

/**
 * Check for low stock products at 9 AM and send alerts.
 */
const checkLowStock = async () => {
  logger.info('[Scheduler] Checking low stock...');
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
      logger.info('[Scheduler] No low stock products found.');
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
    logger.error('[Scheduler] Low stock check error:', err.message);
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
    logger.error('[Scheduler] Email queue processor error:', err.message);
  }
};

/**
 * Start all scheduled jobs.
 */
const startSchedulers = () => {
  logger.info('[Scheduler] Initializing scheduled jobs...');

  // Daily summary at 11:00 PM
  cron.schedule('0 23 * * *', async () => {
    await sendDailySummary();
  });
  logger.info('[Scheduler] Daily summary scheduled at 11:00 PM.');

  // Email queue processor every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await runEmailQueueProcessor();
  });
  logger.info('[Scheduler] Email queue processor scheduled every 5 minutes.');

  // Overdue debt updater at midnight
  cron.schedule('0 0 * * *', async () => {
    await updateOverdueDebts();
  });
  logger.info('[Scheduler] Overdue debt updater scheduled at midnight.');

  // Low stock checker at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    await checkLowStock();
  });
  logger.info('[Scheduler] Low stock checker scheduled at 9:00 AM.');
};

module.exports = {
  startSchedulers,
  sendDailySummary,
  updateOverdueDebts,
  checkLowStock,
  runEmailQueueProcessor,
};
