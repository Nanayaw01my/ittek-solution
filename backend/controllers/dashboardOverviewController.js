const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Expense = require('../models/Expense');
const Debt = require('../models/Debt');
const Customer = require('../models/Customer');
const Refund = require('../models/Refund');
const Category = require('../models/Category');
const { classify, ASPECTS } = require('../config/aspects');

/**
 * Everything the owner's dashboard draws, in one request.
 *
 * The screen it feeds has fourteen panels. Fetched one at a time that is
 * fourteen round trips on a Ghanaian mobile connection before anything
 * appears; gathered here it is one, and the aggregations run beside each
 * other on the database rather than queueing behind the network.
 *
 * Every figure is worked out the way the rest of the system already
 * works it out, which matters more than it sounds: takings exclude the
 * sale written when a Pay & Pick Later plan is collected, because that
 * money was counted as it arrived; profit is measured against what the
 * goods cost when they were sold, not what they cost today.
 */

/** Percentage change, with the awkward cases decided rather than divided. */
const delta = (now, before) => {
  if (!before) return now ? 100 : 0;
  return Number((((now - before) / before) * 100).toFixed(1));
};

const money = (n) => Number((Number(n) || 0).toFixed(2));

/**
 * Money actually given back, over a window.
 *
 * Only an approved refund counts. A request waiting for a decision has
 * returned nothing to anybody, and putting it on the dashboard would
 * have the shop reading money as gone while it is still in the drawer.
 */
const refundsBetween = async (from, to) => {
  const r = await Refund.aggregate([
    { $match: { status: 'approved', refund_date: { $gte: from, $lt: to } } },
    { $group: { _id: null, total: { $sum: '$refund_amount' }, count: { $sum: 1 } } },
  ]);
  return { total: money(r[0]?.total), count: r[0]?.count || 0 };
};

/** Takings never count a layaway's release — see Sale.layaway_ref. */
const COUNTED = { layaway_ref: { $in: [null, undefined] } };

const sumBetween = async (from, to) => {
  const r = await Sale.aggregate([
    { $match: { ...COUNTED, sale_date: { $gte: from, $lt: to } } },
    { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
  ]);
  return { total: money(r[0]?.total), count: r[0]?.count || 0 };
};

/** Sales less what the goods cost, over a window. */
const profitBetween = async (from, to) => {
  const r = await Sale.aggregate([
    { $match: { ...COUNTED, sale_date: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        sales: { $sum: '$total_amount' },
        cogs: {
          $sum: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', { $multiply: [{ $ifNull: ['$$this.cost_price', 0] }, '$$this.quantity'] }] },
            },
          },
        },
      },
    },
  ]);
  return money((r[0]?.sales || 0) - (r[0]?.cogs || 0));
};

const getOverview = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fourteenDaysAgo = new Date(startOfToday); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const sevenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const [
      today, yesterday, thisMonth, lastMonth,
      profitToday, profitYesterday,
      refundsToday, refundsYesterday, refundsMonth, refundsPending,
      stock, customersTotal, customersThisMonth, customersLastMonth,
      debts, debtsLastMonth,
      dailySeries, monthlySeries,
      byMethod, topProducts, lowStock, recent, byStaff, products, categories,
    ] = await Promise.all([
      sumBetween(startOfToday, now),
      sumBetween(startOfYesterday, startOfToday),
      sumBetween(startOfMonth, now),
      sumBetween(startOfLastMonth, startOfMonth),
      profitBetween(startOfToday, now),
      profitBetween(startOfYesterday, startOfToday),

      refundsBetween(startOfToday, now),
      refundsBetween(startOfYesterday, startOfToday),
      refundsBetween(startOfMonth, now),
      // Waiting on somebody's decision. Not money back yet, so it is kept
      // off the figure and said beside it — a queue of refunds nobody has
      // looked at is its own thing worth knowing.
      Refund.countDocuments({ status: 'pending' }),

      // What the shelves are worth, at what the goods cost. Selling value
      // would flatter it by the whole margin — a figure the shop has not
      // earned and may never earn.
      Product.aggregate([
        { $match: { is_active: true } },
        {
          $group: {
            _id: null,
            items: { $sum: 1 },
            pieces: { $sum: '$quantity' },
            value: { $sum: { $multiply: ['$quantity', { $ifNull: ['$cost_price', 0] }] } },
            retail: { $sum: { $multiply: ['$quantity', { $ifNull: ['$selling_price', 0] }] } },
          },
        },
      ]),
      Customer.countDocuments({}),
      Customer.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Customer.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
      Debt.find({ status: { $in: ['active', 'overdue'] } }, 'amount_owed amount_paid').lean(),
      Debt.find({ status: { $in: ['active', 'overdue'] }, createdAt: { $lt: startOfMonth } },
        'amount_owed amount_paid').lean(),

      // The fortnight behind the overview chart: takings and profit a day
      // at a time, so the two lines are drawn from the same rows.
      Sale.aggregate([
        { $match: { ...COUNTED, sale_date: { $gte: fourteenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$sale_date' } },
            sales: { $sum: '$total_amount' },
            cogs: {
              $sum: {
                $reduce: {
                  input: '$items', initialValue: 0,
                  in: { $add: ['$$value', { $multiply: [{ $ifNull: ['$$this.cost_price', 0] }, '$$this.quantity'] }] },
                },
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Sale.aggregate([
        { $match: { ...COUNTED, sale_date: { $gte: sevenMonthsAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$sale_date' } },
            sales: { $sum: '$total_amount' },
            cogs: {
              $sum: {
                $reduce: {
                  input: '$items', initialValue: 0,
                  in: { $add: ['$$value', { $multiply: [{ $ifNull: ['$$this.cost_price', 0] }, '$$this.quantity'] }] },
                },
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // How today's money actually arrived. Cash-up counts the drawer
      // against the cash line, so the split is not decoration.
      Sale.aggregate([
        { $match: { ...COUNTED, sale_date: { $gte: startOfToday } } },
        { $group: { _id: '$payment_method', total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      Sale.aggregate([
        { $match: { ...COUNTED, sale_date: { $gte: startOfMonth } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.name',
            qty: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.unit_price', '$items.quantity'] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
      Product.find({ is_active: true, $expr: { $lte: ['$quantity', '$low_stock_level'] } })
        .select('name quantity low_stock_level aspect category_id')
        .populate('category_id', 'name')
        .sort({ quantity: 1 }).limit(6).lean(),
      Sale.find({ ...COUNTED }).select('invoice_no total_amount sale_date customer_name payment_status')
        .sort({ sale_date: -1 }).limit(6).lean(),
      Sale.aggregate([
        { $match: { ...COUNTED, sale_date: { $gte: startOfMonth } } },
        { $group: { _id: '$user_id', total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $project: { total: 1, count: 1, name: { $arrayElemAt: ['$u.username', 0] } } },
      ]),

      // For the department split: the shop's sides are worked out from the
      // product and its category, the same classify() Business Lines uses,
      // so the two screens can never disagree about what counts as solar.
      Product.find({ is_active: true }).select('name aspect category_id quantity cost_price selling_price').lean(),
      Category.find({}).select('name').lean(),
    ]);

    const catName = new Map(categories.map((c) => [String(c._id), c]));
    // ASPECTS is the ordered list the rest of the system uses, so the
    // departments come out in the same order here as on Business Lines.
    const byAspect = {};
    for (const a of ASPECTS) {
      byAspect[a.key] = { key: a.key, label: a.label, items: 0, pieces: 0, value: 0 };
    }
    for (const p of products) {
      const { aspect } = classify(p, catName.get(String(p.category_id)));
      const row = byAspect[aspect] || byAspect.other;
      if (!row) continue;
      row.items += 1;
      row.pieces += Number(p.quantity) || 0;
      row.value += (Number(p.quantity) || 0) * (Number(p.cost_price) || 0);
    }

    const owed = (rows) => money(rows.reduce(
      (s, d) => s + Math.max(0, (Number(d.amount_owed) || 0) - (Number(d.amount_paid) || 0)), 0));

    // Fill the gaps: a day with no sales has no row to group, and a chart
    // that skips it draws a quiet Tuesday as though it never happened.
    const days = [];
    const seen = new Map(dailySeries.map((d) => [d._id, d]));
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo); d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const row = seen.get(key);
      days.push({
        date: key,
        label: d.toLocaleDateString('en-GH', { day: '2-digit', month: 'short' }),
        sales: money(row?.sales),
        profit: money((row?.sales || 0) - (row?.cogs || 0)),
      });
    }

    const months = [];
    const seenM = new Map(monthlySeries.map((m) => [m._id, m]));
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = seenM.get(key);
      months.push({
        key,
        label: d.toLocaleDateString('en-GH', { month: 'short' }),
        sales: money(row?.sales),
        profit: money((row?.sales || 0) - (row?.cogs || 0)),
      });
    }

    const collections = byMethod.map((m) => ({
      method: m._id || 'cash',
      total: money(m.total),
      count: m.count,
    }));
    const collected = money(collections.reduce((s, c) => s + c.total, 0));

    const outstanding = owed(debts);

    return res.status(200).json({
      success: true,
      data: {
        as_of: now,
        headline: {
          /**
           * Takings NET of what was handed back.
           *
           * The shop's decision, and the right one: money refunded
           * today left the drawer today, so a "total sales" figure that
           * ignores it reports takings the shop does not have. The day
           * it matters is the day somebody returns a GH₵3,400 battery
           * and the dashboard still shows the morning's number.
           *
           * The gross is kept beside it rather than thrown away — what
           * was sold and what came back are different facts, and the
           * card shows both.
           */
          today_sales: {
            value: money(today.total - refundsToday.total),
            delta: delta(today.total - refundsToday.total, yesterday.total - refundsYesterday.total),
            count: today.count,
            gross: today.total,
            refunded: refundsToday.total,
          },
          month_sales: {
            value: money(thisMonth.total - refundsMonth.total),
            delta: delta(thisMonth.total, lastMonth.total),
            count: thisMonth.count,
            gross: thisMonth.total,
            refunded: refundsMonth.total,
          },
          today_profit: { value: profitToday, delta: delta(profitToday, profitYesterday) },
          refunds: {
            value: refundsToday.total,
            delta: delta(refundsToday.total, refundsYesterday.total),
            count: refundsToday.count,
            month: refundsMonth.total,
            pending: refundsPending,
          },
          customers: { value: customersTotal, delta: delta(customersThisMonth, customersLastMonth), new_this_month: customersThisMonth },
          outstanding: { value: outstanding, delta: delta(outstanding, owed(debtsLastMonth)), count: debts.length },
        },
        days,
        months,
        departments: Object.values(byAspect).filter((d) => d.items > 0)
          .map((d) => ({ ...d, value: money(d.value) }))
          .sort((a, b) => b.value - a.value),
        collections,
        collected,
        top_products: topProducts.map((p) => ({ name: p._id, qty: p.qty, revenue: money(p.revenue) })),
        low_stock: lowStock.map((p) => ({
          id: String(p._id),
          name: p.name,
          quantity: p.quantity,
          low_stock_level: p.low_stock_level,
          category: p.category_id?.name || '',
          // A line at zero is not the same problem as a line getting low,
          // and the shop acts on them differently.
          status: p.quantity <= 0 ? 'out' : (p.quantity <= Math.ceil((p.low_stock_level || 5) / 2) ? 'critical' : 'low'),
        })),
        recent: recent.map((s) => ({
          id: String(s._id),
          invoice_no: s.invoice_no,
          customer_name: s.customer_name || '',
          total: money(s.total_amount),
          at: s.sale_date,
          kind: s.payment_status === 'debt_payment' ? 'collection' : 'sale',
        })),
        staff: byStaff.map((s) => ({ name: s.name || 'Unknown', total: money(s.total), count: s.count })),
        stock: {
          items: stock[0]?.items || 0,
          pieces: stock[0]?.pieces || 0,
          value: money(stock[0]?.value),
          retail: money(stock[0]?.retail),
        },
      },
    });
  } catch (err) {
    console.error('Dashboard overview error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Could not work out the figures.' });
  }
};

module.exports = { getOverview, delta };
