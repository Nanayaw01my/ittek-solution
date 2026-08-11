const FraudAlert = require('../models/FraudAlert');
const Sale = require('../models/Sale');
const Refund = require('../models/Refund');
const Settings = require('../models/Settings');

/**
 * Staff anomaly detection.
 *
 * These are signals for a manager to eyeball, not verdicts. Everything here is
 * threshold-based and configurable in Settings, because what counts as "odd"
 * differs per shop. Each alert carries a dedupe_key so re-running a scan never
 * produces duplicates for the same underlying event.
 */

const DEFAULTS = {
  enabled: true,
  max_discount_percent: 20,
  large_cash_sale: 10000,
  open_hour: 6,
  close_hour: 21,
  refunds_per_day: 3,
  sales_per_minute: 5,
};

const getFraudSettings = async () => {
  const settings = await Settings.findOne().lean();
  return { ...DEFAULTS, ...(settings?.fraud_settings || {}) };
};

/** Insert an alert, silently skipping one already raised for the same event. */
const raise = async (alert) => {
  try {
    return await FraudAlert.create(alert);
  } catch (err) {
    if (err.code === 11000) return null; // duplicate dedupe_key — already flagged
    console.error('Fraud alert error:', err.message);
    return null;
  }
};

/**
 * Check a single sale as it is processed. Runs inline but never blocks the
 * sale — a detection failure must not stop the till from trading.
 */
const checkSale = async (sale, user) => {
  try {
    const cfg = await getFraudSettings();
    if (!cfg.enabled) return [];

    const alerts = [];
    const username = user?.username || 'unknown';
    const saleDate = new Date(sale.sale_date || Date.now());

    // 1. Discount above the allowed ceiling
    const subtotal = Number(sale.subtotal) || 0;
    const total = Number(sale.cart_total ?? sale.total_amount) || 0;
    const discountAmount = Math.max(0, subtotal - total);
    const discountPct = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

    if (discountPct > cfg.max_discount_percent) {
      alerts.push({
        type: 'excessive_discount',
        severity: discountPct > cfg.max_discount_percent * 2 ? 'high' : 'medium',
        user_id: user?._id,
        username,
        title: `${discountPct.toFixed(1)}% discount on ${sale.invoice_no}`,
        detail:
          `${username} discounted ${discountAmount.toFixed(2)} off a ${subtotal.toFixed(2)} sale ` +
          `(${discountPct.toFixed(1)}%), above the ${cfg.max_discount_percent}% limit.`,
        evidence: {
          sale_id: sale._id,
          invoice_no: sale.invoice_no,
          amount: discountAmount,
          threshold: cfg.max_discount_percent,
        },
        dedupe_key: `discount:${sale._id}`,
      });
    }

    // 2. Sale rung up outside trading hours
    const hour = saleDate.getHours();
    if (hour < cfg.open_hour || hour >= cfg.close_hour) {
      alerts.push({
        type: 'after_hours_sale',
        severity: 'medium',
        user_id: user?._id,
        username,
        title: `Sale at ${String(hour).padStart(2, '0')}:${String(saleDate.getMinutes()).padStart(2, '0')}`,
        detail:
          `${username} processed ${sale.invoice_no} outside trading hours ` +
          `(${cfg.open_hour}:00–${cfg.close_hour}:00).`,
        evidence: { sale_id: sale._id, invoice_no: sale.invoice_no, amount: total },
        dedupe_key: `afterhours:${sale._id}`,
      });
    }

    // 3. Unusually large cash sale — cash is the easiest thing to walk off with
    if (sale.payment_method === 'cash' && total >= cfg.large_cash_sale) {
      alerts.push({
        type: 'large_cash_sale',
        severity: 'medium',
        user_id: user?._id,
        username,
        title: `Large cash sale: ${total.toFixed(2)}`,
        detail: `${username} took ${total.toFixed(2)} in cash on ${sale.invoice_no}, at or above the ${cfg.large_cash_sale} threshold.`,
        evidence: { sale_id: sale._id, invoice_no: sale.invoice_no, amount: total, threshold: cfg.large_cash_sale },
        dedupe_key: `largecash:${sale._id}`,
      });
    }

    // 4. Implausibly fast sequence of sales from one user
    if (user?._id) {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const recent = await Sale.countDocuments({ user_id: user._id, sale_date: { $gte: oneMinuteAgo } });
      if (recent > cfg.sales_per_minute) {
        alerts.push({
          type: 'rapid_sales',
          severity: 'low',
          user_id: user._id,
          username,
          title: `${recent} sales in one minute`,
          detail: `${username} rang up ${recent} sales inside a minute, above the ${cfg.sales_per_minute} expected.`,
          evidence: { count: recent, threshold: cfg.sales_per_minute, window: '1 minute' },
          // One alert per user per minute, not per sale.
          dedupe_key: `rapid:${user._id}:${Math.floor(Date.now() / 60000)}`,
        });
      }
    }

    const created = [];
    for (const alert of alerts) {
      const saved = await raise(alert);
      if (saved) created.push(saved);
    }
    return created;
  } catch (err) {
    // Detection must never break a sale.
    console.error('Fraud check error:', err.message);
    return [];
  }
};

/**
 * Periodic sweep for patterns a single sale can't reveal — refund clustering
 * and a cashier whose discount habit is out of line with everyone else's.
 */
const runDailyScan = async () => {
  try {
    const cfg = await getFraudSettings();
    if (!cfg.enabled) return [];

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dayKey = new Date().toISOString().slice(0, 10);
    const created = [];

    // Refund clustering per user
    const refundsByUser = await Refund.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$processed_by', count: { $sum: 1 }, total: { $sum: '$refund_amount' } } },
      { $match: { count: { $gt: cfg.refunds_per_day } } },
    ]).catch(() => []);

    for (const row of refundsByUser) {
      if (!row._id) continue;
      const saved = await raise({
        type: 'refund_spike',
        severity: 'high',
        user_id: row._id,
        title: `${row.count} refunds in 24h`,
        detail: `A single user processed ${row.count} refunds (${(row.total || 0).toFixed(2)}) in 24 hours, above the ${cfg.refunds_per_day} expected.`,
        evidence: { count: row.count, threshold: cfg.refunds_per_day, amount: row.total, window: '24 hours' },
        dedupe_key: `refundspike:${row._id}:${dayKey}`,
      });
      if (saved) created.push(saved);
    }

    // Discount rate per user, relative to their own turnover
    const discountByUser = await Sale.aggregate([
      { $match: { sale_date: { $gte: since } } },
      {
        $group: {
          _id: '$user_id',
          subtotal: { $sum: '$subtotal' },
          total: { $sum: '$cart_total' },
          sales: { $sum: 1 },
        },
      },
      { $match: { sales: { $gte: 5 } } }, // ignore tiny samples
    ]).catch(() => []);

    for (const row of discountByUser) {
      if (!row._id || !row.subtotal) continue;
      const pct = ((row.subtotal - row.total) / row.subtotal) * 100;
      if (pct > cfg.max_discount_percent) {
        const saved = await raise({
          type: 'high_discount_rate',
          severity: 'medium',
          user_id: row._id,
          title: `${pct.toFixed(1)}% average discount over 24h`,
          detail: `Across ${row.sales} sales this user gave away ${(row.subtotal - row.total).toFixed(2)} (${pct.toFixed(1)}% of turnover), above the ${cfg.max_discount_percent}% limit.`,
          evidence: { count: row.sales, threshold: cfg.max_discount_percent, amount: row.subtotal - row.total, window: '24 hours' },
          dedupe_key: `discountrate:${row._id}:${dayKey}`,
        });
        if (saved) created.push(saved);
      }
    }

    return created;
  } catch (err) {
    console.error('Fraud scan error:', err.message);
    return [];
  }
};

module.exports = { getFraudSettings, checkSale, runDailyScan };
