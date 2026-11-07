const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Debt = require('../models/Debt');
const Payable = require('../models/Payable');
const Product = require('../models/Product');
const StockRequest = require('../models/StockRequest');
const ReceiptApproval = require('../models/ReceiptApproval');
const Refund = require('../models/Refund');
const CreditAgreement = require('../models/CreditAgreement');
const Settings = require('../models/Settings');
const { classify } = require('../config/aspects');
const Category = require('../models/Category');

/**
 * The Managing Director's one screen.
 *
 * Everything on it exists somewhere already — takings in Reports, debts in
 * Debts, approvals in four separate queues. The point is not new figures,
 * it is that an owner should not have to visit nine screens to find out
 * whether anything needs them this morning, and in practice nobody does.
 *
 * One endpoint rather than nine requests: the page is opened on a phone, on
 * Bogoso mobile data, and nine round trips is the difference between a
 * screen somebody checks daily and one they stop opening.
 */

const money = (n) => Number((Number(n) || 0).toFixed(2));
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/**
 * The decisions waiting on an owner.
 *
 * Only things that are genuinely stuck until somebody with authority looks
 * at them. A list that also carried "things to be aware of" would be a list
 * nobody trusts to be empty, and an empty list is the whole value: it says,
 * in one glance, that nothing is waiting.
 */
const buildNeedsYou = async () => {
  const [stockRequests, receipts, refunds, agreements] = await Promise.all([
    StockRequest.find({ status: 'pending' })
      .populate('created_by', 'username')
      .sort({ request_date: -1 })
      .limit(20),
    ReceiptApproval.countDocuments({ status: 'pending' }),
    Refund.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5),
    /**
     * Agreements that have gone into default.
     *
     * This slot first held "unsigned agreements", which the data cannot
     * answer: a CreditAgreement has no signed_at, so the query matched
     * every active one and the portal would have opened each morning
     * announcing that every agreement in the shop needed signing. A
     * default genuinely waits on an owner — goods are out and the
     * payments have stopped.
     */
    CreditAgreement.countDocuments({ status: 'defaulted' }),
  ]);

  const items = [];

  if (stockRequests.length > 0) {
    const worth = stockRequests.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
    const who = [...new Set(stockRequests.map((r) => r.created_by?.username).filter(Boolean))];
    items.push({
      key: 'stock-requests',
      count: stockRequests.length,
      label: `${stockRequests.length} stock request${stockRequests.length === 1 ? '' : 's'} waiting`,
      detail: [who.join(' · '), worth > 0 ? `GH₵${worth.toFixed(2)} if approved in full` : null]
        .filter(Boolean).join(' — '),
      link: '/stock-requests',
    });
  }

  if (receipts > 0) {
    items.push({
      key: 'receipt-approvals',
      count: receipts,
      label: `${receipts} package receipt${receipts === 1 ? '' : 's'} to approve`,
      detail: 'written at the counter, waiting to print',
      link: '/receipt-approvals',
    });
  }

  for (const refund of refunds) {
    items.push({
      key: `refund-${refund._id}`,
      count: 1,
      label: `Refund request — GH₵${money(refund.refund_amount).toFixed(2)}`,
      detail: refund.reason ? String(refund.reason).slice(0, 80) : 'awaiting your decision',
      link: '/refunds',
    });
  }

  if (agreements > 0) {
    items.push({
      key: 'credit-agreements',
      count: agreements,
      label: `${agreements} credit agreement${agreements === 1 ? '' : 's'} in default`,
      detail: 'goods are out and the payments have stopped',
      link: '/credit-agreements',
    });
  }

  return items;
};

/**
 * Things that are not waiting on a decision but are worth knowing.
 *
 * Each one is a rule the shop already set — its own discount limit, its own
 * trading hours, its own reorder levels — so this reports the shop back to
 * itself rather than inventing a standard. Nothing appears unless it is
 * actually true today, which is what makes an empty block meaningful.
 */
const buildWorthALook = async (settings) => {
  const fraud = settings?.fraud_settings || {};
  const limit = Number(fraud.max_discount_percent) || 20;
  const openHour = Number.isFinite(fraud.open_hour) ? fraud.open_hour : 6;
  const closeHour = Number.isFinite(fraud.close_hour) ? fraud.close_hour : 21;

  const [bigDiscounts, oldDebts, lowStock, oddHours] = await Promise.all([
    // A discount past the shop's own limit, in the last week.
    Sale.find({
      sale_date: { $gte: daysAgo(7) },
      discount: { $gt: 0 },
      total_amount: { $gt: 0 },
    }).select('invoice_no discount total_amount subtotal user_id sale_date')
      .populate('user_id', 'username')
      .sort({ sale_date: -1 })
      .limit(50),
    Debt.find({ status: { $in: ['active', 'overdue'] }, due_date: { $lt: daysAgo(60) } })
      .select('customer_name amount_owed amount_paid due_date')
      .sort({ due_date: 1 })
      .limit(20),
    Product.find({ is_active: true, $expr: { $lte: ['$quantity', '$low_stock_level'] } })
      .select('name quantity')
      .sort({ quantity: 1 })
      .limit(10),
    Sale.find({ sale_date: { $gte: daysAgo(2) } })
      .select('invoice_no sale_date total_amount')
      .sort({ sale_date: -1 })
      .limit(50),
  ]);

  const notes = [];

  const overLimit = bigDiscounts
    .map((s) => {
      const base = Number(s.subtotal) || (Number(s.total_amount) + Number(s.discount)) || 0;
      const pct = base > 0 ? (Number(s.discount) / base) * 100 : 0;
      return { sale: s, pct };
    })
    .filter((d) => d.pct > limit)
    .sort((a, b) => b.pct - a.pct);

  if (overLimit.length > 0) {
    const worst = overLimit[0];
    notes.push({
      key: 'discount',
      icon: 'discount',
      label: `${worst.sale.user_id?.username || 'Somebody'} gave ${worst.pct.toFixed(0)}% discount`
        + ` on ${worst.sale.invoice_no}`,
      detail: overLimit.length > 1
        ? `your limit is ${limit}% · ${overLimit.length} over the limit this week`
        : `your limit is ${limit}%`,
      link: '/fraud-alerts',
    });
  }

  if (oldDebts.length > 0) {
    const owed = oldDebts.reduce((s, d) => s + Math.max(0, (d.amount_owed || 0) - (d.amount_paid || 0)), 0);
    const oldest = oldDebts[0];
    const days = Math.floor((Date.now() - new Date(oldest.due_date).getTime()) / 86400000);
    notes.push({
      key: 'debts',
      icon: 'debt',
      label: `${oldDebts.length} debt${oldDebts.length === 1 ? '' : 's'} past 60 days — GH₵${owed.toFixed(2)}`,
      detail: `oldest: ${oldest.customer_name}, ${days} days`,
      link: '/debts',
    });
  }

  if (lowStock.length > 0) {
    notes.push({
      key: 'stock',
      icon: 'stock',
      label: `${lowStock.length} product${lowStock.length === 1 ? '' : 's'} below reorder level`,
      detail: `incl. ${lowStock[0].name} — ${lowStock[0].quantity} left`,
      link: '/reorder',
    });
  }

  const outside = oddHours.filter((s) => {
    const h = new Date(s.sale_date).getHours();
    return h < openHour || h >= closeHour;
  });
  if (outside.length > 0) {
    const when = new Date(outside[0].sale_date);
    notes.push({
      key: 'hours',
      icon: 'hours',
      label: `Sale at ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`,
      detail: `outside trading hours (${String(openHour).padStart(2, '0')}:00–${String(closeHour).padStart(2, '0')}:00)`
        + (outside.length > 1 ? ` · ${outside.length} in two days` : ''),
      link: '/sales-history',
    });
  }

  return notes;
};

/**
 * GET /api/director/overview
 */
const getOverview = async (req, res) => {
  try {
    const today = startOfDay();
    const month = startOfMonth();

    const [
      settings, todayAgg, monthAgg, monthCogsAgg, monthExpenseAgg,
      debts, payables, needsYou, monthSales, staffAgg, categories,
    ] = await Promise.all([
      Settings.findOne(),
      Sale.aggregate([
        { $match: { sale_date: { $gte: today }, layaway_ref: { $in: [null, undefined] } } },
        { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { sale_date: { $gte: month }, layaway_ref: { $in: [null, undefined] } } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]),
      Sale.aggregate([
        { $match: { sale_date: { $gte: month } } },
        { $group: { _id: null, total: { $sum: { $reduce: {
          input: '$items', initialValue: 0,
          in: { $add: ['$$value', { $multiply: ['$$this.cost_price', '$$this.quantity'] }] },
        } } } } },
      ]),
      Expense.aggregate([
        { $match: { expense_date: { $gte: month } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Debt.find({ status: { $in: ['active', 'overdue'] } }).select('amount_owed amount_paid status'),
      // 'unpaid' and 'partial' are the whole of what is owed: the Payable
      // schema has no 'overdue', and asking for one would have looked like
      // a filter while matching nothing.
      Payable.find({ status: { $in: ['unpaid', 'partial'] } }).select('amount amount_paid').catch(() => []),
      buildNeedsYou(),
      // The month's sales, carried once and used for both the departments
      // and the staff: two aggregations over the same rows would cost twice
      // for the same answer.
      Sale.find({ sale_date: { $gte: month }, layaway_ref: { $in: [null, undefined] } })
        .select('total_amount items user_id sale_date payment_status')
        .populate('user_id', 'username')
        .limit(5000),
      Sale.aggregate([
        { $match: { sale_date: { $gte: month }, layaway_ref: { $in: [null, undefined] } } },
        { $group: { _id: '$user_id', total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 5 },
      ]),
      Category.find().select('name aspect').lean().catch(() => []),
    ]);

    /**
     * The products behind the month's sale lines.
     *
     * A sale item stores a name and a price, not a category — so
     * classifying from the item alone would ignore the department the shop
     * set on the product itself with the auto-sort, and this screen would
     * quietly disagree with Business Lines about where the money came from.
     * Two screens disagreeing about the same month is worse than one screen
     * fewer.
     */
    const productIds = [...new Set(
      monthSales.flatMap((s) => (s.items || []).map((i) => String(i.product_id || '')).filter(Boolean))
    )];
    const prodById = new Map(
      (await Product.find({ _id: { $in: productIds } }).select('name aspect category_id').lean())
        .map((p) => [String(p._id), p])
    );

    const worthALook = await buildWorthALook(settings);

    const debtOutstanding = debts.reduce(
      (s, d) => s + Math.max(0, (d.amount_owed || 0) - (d.amount_paid || 0)), 0
    );
    const payableOutstanding = (payables || []).reduce(
      (s, p) => s + Math.max(0, (p.amount || 0) - (p.amount_paid || 0)), 0
    );

    // Departments, using the same classifier Business Lines uses so the two
    // screens cannot disagree about which department a product belongs to.
    const catById = new Map((categories || []).map((c) => [String(c._id), c]));
    const lines = {};
    for (const sale of monthSales) {
      if (sale.payment_status === 'debt_payment') continue;
      for (const item of sale.items || []) {
        const product = prodById.get(String(item.product_id)) || { name: item.product_name };
        const category = product.category_id ? catById.get(String(product.category_id)) : null;
        const { aspect } = classify({ ...product, product_name: item.product_name }, category);
        lines[aspect] = (lines[aspect] || 0) + (Number(item.total) || 0);
      }
    }
    const lineTotal = Object.values(lines).reduce((a, b) => a + b, 0);

    // Fourteen days of takings, for the shape of the fortnight.
    const byDay = new Map();
    for (let i = 13; i >= 0; i -= 1) {
      const d = startOfDay(new Date(Date.now() - i * 86400000));
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const sale of monthSales) {
      const key = startOfDay(new Date(sale.sale_date)).toISOString().slice(0, 10);
      if (byDay.has(key)) byDay.set(key, byDay.get(key) + (Number(sale.total_amount) || 0));
    }

    const monthRevenue = money(monthAgg[0]?.total);
    const monthCogs = money(monthCogsAgg[0]?.total);
    const monthExpenses = money(monthExpenseAgg[0]?.total);

    return res.status(200).json({
      success: true,
      data: {
        today: {
          takings: money(todayAgg[0]?.total),
          sales: todayAgg[0]?.count || 0,
        },
        month: {
          takings: monthRevenue,
          profit: money(monthRevenue - monthCogs - monthExpenses),
        },
        owed_to_us: {
          amount: money(debtOutstanding),
          customers: debts.length,
          overdue: debts.filter((d) => d.status === 'overdue').length,
        },
        we_owe: { amount: money(payableOutstanding), suppliers: (payables || []).length },
        needs_you: needsYou,
        worth_a_look: worthALook,
        lines: Object.entries(lines)
          .map(([aspect, amount]) => ({
            aspect,
            amount: money(amount),
            share: lineTotal > 0 ? Math.round((amount / lineTotal) * 100) : 0,
          }))
          .sort((a, b) => b.amount - a.amount),
        staff: staffAgg.map((row) => {
          const match = monthSales.find((s) => String(s.user_id?._id) === String(row._id));
          return {
            username: match?.user_id?.username || 'Unknown',
            total: money(row.total),
            sales: row.count,
          };
        }),
        days: [...byDay.entries()].map(([day, total]) => ({ day, total: money(total) })),
      },
    });
  } catch (err) {
    console.error('Director overview error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getOverview, buildNeedsYou, buildWorthALook };
