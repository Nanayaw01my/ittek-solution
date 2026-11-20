const Sale = require('../models/Sale');
const Refund = require('../models/Refund');
const Expense = require('../models/Expense');
const Complaint = require('../models/Complaint');

/**
 * A sales attendant's own week.
 *
 * They can see today's takings on the Dashboard and nothing else: no way
 * to answer "how did my week go", and nothing to hand a manager on a
 * Saturday. The shop asked for a report they can print.
 *
 * It is their own figures only. An attendant seeing the shop's week is a
 * different screen with different permissions, and this one is deliberately
 * about the person reading it.
 */

const money = (n) => Number((Number(n) || 0).toFixed(2));

/**
 * The week the shop means, not the week the calendar means.
 *
 * Monday to Sunday, because a Ghanaian shop week starts on Monday and a
 * report that cuts Saturday's trading in half is a report nobody uses.
 */
const weekStarting = (ref = new Date()) => {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d;
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * GET /api/my-week?week=YYYY-MM-DD
 */
const getMyWeek = async (req, res) => {
  try {
    const asked = req.query.week ? new Date(req.query.week) : new Date();
    const start = weekStarting(Number.isNaN(asked.getTime()) ? new Date() : asked);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const [sales, expenses, complaints] = await Promise.all([
      Sale.find({ user_id: req.user._id, sale_date: { $gte: start, $lt: end } })
        .select('invoice_no sale_date total_amount discount payment_status payment_method items')
        .sort({ sale_date: 1 })
        .limit(2000),
      Expense.find({ created_by: req.user._id, expense_date: { $gte: start, $lt: end } })
        .select('amount description expense_date')
        .limit(200),
      Complaint.find({ raised_by: req.user._id, createdAt: { $gte: start, $lt: end } })
        .select('subject status severity createdAt')
        .limit(100),
    ]);

    /**
     * Money collected against something already sold is kept apart from
     * goods sold this week. Both are money the attendant took, and adding
     * them into one figure would make a week of debt collection look like
     * a week of selling.
     */
    const counter = sales.filter((s) => s.payment_status !== 'debt_payment');
    const collections = sales.filter((s) => s.payment_status === 'debt_payment');

    const days = DAY_NAMES.map((name, i) => {
      const from = new Date(start); from.setDate(from.getDate() + i);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      const mine = counter.filter((s) => s.sale_date >= from && s.sale_date < to);
      return {
        day: name,
        date: from.toISOString().slice(0, 10),
        sales: mine.length,
        takings: money(mine.reduce((t, s) => t + (s.total_amount || 0), 0)),
      };
    });

    // What they sold most of, by pieces.
    const byProduct = new Map();
    for (const s of counter) {
      for (const item of s.items || []) {
        const row = byProduct.get(item.product_name) || { name: item.product_name, pieces: 0, value: 0 };
        row.pieces += Number(item.quantity) || 0;
        row.value += Number(item.total) || 0;
        byProduct.set(item.product_name, row);
      }
    }

    const takings = money(counter.reduce((t, s) => t + (s.total_amount || 0), 0));
    const busiest = days.reduce((a, b) => (b.takings > a.takings ? b : a), days[0]);

    return res.status(200).json({
      success: true,
      data: {
        who: req.user.username,
        week_start: start.toISOString().slice(0, 10),
        week_end: new Date(end - 1).toISOString().slice(0, 10),
        takings,
        sales: counter.length,
        pieces: counter.reduce((t, s) => t + (s.items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0), 0),
        discounts: money(counter.reduce((t, s) => t + (s.discount || 0), 0)),
        average_sale: counter.length ? money(takings / counter.length) : 0,
        collections: {
          amount: money(collections.reduce((t, s) => t + (s.total_amount || 0), 0)),
          count: collections.length,
        },
        expenses: {
          amount: money(expenses.reduce((t, e) => t + (e.amount || 0), 0)),
          count: expenses.length,
        },
        busiest_day: busiest?.takings > 0 ? busiest.day : null,
        days,
        top_products: [...byProduct.values()]
          .sort((a, b) => b.pieces - a.pieces)
          .slice(0, 8)
          .map((p) => ({ ...p, value: money(p.value) })),
        complaints: complaints.map((c) => ({
          _id: c._id, subject: c.subject, status: c.status,
          severity: c.severity, raised_at: c.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error('My week error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/my-week/today
 *
 * An attendant's own dashboard: their day, their week, what they sold
 * and how the customers paid for it.
 *
 * Scoped to the person asking and nothing else — every query below is
 * keyed on req.user._id. A sales attendant has no business reading the
 * shop's takings off a screen they stand in front of all day, and this
 * is the screen that would leak them if it were written carelessly.
 *
 * Deliberately absent: profit, margin and anything derived from cost
 * price, which is the shop's and not the counter's; and stock counts,
 * which the shop has decided are the CEO's alone.
 */
const getMyToday = async (req, res) => {
  try {
    const me = req.user._id;
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const weekStart = weekStarting(now);

    /** Counter sales only: a debt payment is money collected, not sold. */
    const mine = (from, to) => ({
      user_id: me,
      sale_date: { $gte: from, ...(to ? { $lt: to } : {}) },
      layaway_ref: { $in: [null, undefined] },
    });

    /**
     * What this person handed back, by the day it went out of the
     * drawer.
     *
     * Attributed to whoever MADE the sale, not whoever processed the
     * return: the sale is being undone, and leaving it against the
     * seller's name is the only way their day's figure matches the
     * money. The date used is the refund's own — the cash left today
     * whatever day the sale was rung up.
     *
     * Only approved refunds count. One waiting on a decision has
     * returned nothing to anybody.
     */
    const myRefunds = async (from, to) => {
      const rows = await Refund.aggregate([
        {
          $match: {
            status: 'approved',
            refund_date: { $gte: from, ...(to ? { $lt: to } : {}) },
          },
        },
        {
          $lookup: {
            from: 'sales', localField: 'sale_id', foreignField: '_id', as: 'sale',
          },
        },
        { $unwind: '$sale' },
        { $match: { 'sale.user_id': me } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$refund_date' } },
            total: { $sum: '$refund_amount' },
            count: { $sum: 1 },
          },
        },
      ]);
      return rows;
    };

    const dayKeyOf = (d) => {
      const x = new Date(d);
      const pad = (n) => String(n).padStart(2, '0');
      return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    };

    const [todaySales, yesterdaySales, weekSales, refundRows, yesterdayRefunds] = await Promise.all([
      Sale.find(mine(startOfToday)).select('total_amount items payment_method payment_status sale_date customer_name invoice_no').lean(),
      Sale.find(mine(startOfYesterday, startOfToday)).select('total_amount payment_status').lean(),
      Sale.find(mine(weekStart)).select('total_amount payment_status sale_date').lean(),
      myRefunds(weekStart < startOfToday ? weekStart : startOfToday),
      myRefunds(startOfYesterday, startOfToday),
    ]);

    const refundByDay = new Map(refundRows.map((r) => [r._id, r.total]));
    const refundedToday = money(refundByDay.get(dayKeyOf(startOfToday)) || 0);
    const refundedYesterday = money(
      yesterdayRefunds.reduce((t, r) => t + (Number(r.total) || 0), 0));

    const counter = (rows) => rows.filter((s) => s.payment_status !== 'debt_payment');
    const sum = (rows) => money(rows.reduce((t, s) => t + (Number(s.total_amount) || 0), 0));

    const todayCounter = counter(todaySales);
    const yesterdayCounter = counter(yesterdaySales);
    const grossToday = sum(todayCounter);
    const takings = money(grossToday - refundedToday);
    const before = money(sum(yesterdayCounter) - refundedYesterday);

    const pieces = todayCounter.reduce(
      (n, s) => n + (s.items || []).reduce((q, i) => q + (Number(i.quantity) || 0), 0), 0);

    // How the customers paid. Cash-up counts the drawer against the cash
    // line, so an attendant seeing their own split can spot a wrong
    // button before somebody counts the money at the end of the day.
    const byMethod = new Map();
    for (const s of todayCounter) {
      const k = s.payment_method || 'cash';
      byMethod.set(k, money((byMethod.get(k) || 0) + (Number(s.total_amount) || 0)));
    }

    const byProduct = new Map();
    for (const s of todayCounter) {
      for (const i of s.items || []) {
        const key = i.name || 'Item';
        const row = byProduct.get(key) || { name: key, pieces: 0, value: 0 };
        row.pieces += Number(i.quantity) || 0;
        row.value = money(row.value + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0));
        byProduct.set(key, row);
      }
    }

    // The week so far, a day at a time, with days that have not happened
    // left in: a bar chart that skips Wednesday draws a quiet day as
    // though it never came round.
    const days = DAY_NAMES.map((day, i) => {
      const from = new Date(weekStart); from.setDate(from.getDate() + i);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      const rows = counter(weekSales).filter((s) => {
        const d = new Date(s.sale_date);
        return d >= from && d < to;
      });
      return {
        day: day.slice(0, 3),
        future: from > now,
        takings: money(sum(rows) - (refundByDay.get(dayKeyOf(from)) || 0)),
        sales: rows.length,
      };
    });

    const collections = todaySales.filter((s) => s.payment_status === 'debt_payment');

    return res.status(200).json({
      success: true,
      data: {
        who: req.user.username,
        as_of: now,
        today: {
          takings,
          gross: grossToday,
          refunded: refundedToday,
          delta: before ? Number((((takings - before) / before) * 100).toFixed(1)) : (takings ? 100 : 0),
          sales: todayCounter.length,
          pieces,
          average: todayCounter.length ? money(takings / todayCounter.length) : 0,
        },
        week: {
          takings: money(sum(counter(weekSales))
            - refundRows.reduce((t, r) => t + (Number(r.total) || 0), 0)),
          sales: counter(weekSales).length,
          days,
        },
        methods: [...byMethod.entries()]
          .map(([method, total]) => ({ method, total }))
          .sort((a, b) => b.total - a.total),
        top_products: [...byProduct.values()].sort((a, b) => b.value - a.value).slice(0, 5),
        collections: { amount: sum(collections), count: collections.length },
        recent: todayCounter
          .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))
          .slice(0, 5)
          .map((s) => ({
            invoice_no: s.invoice_no,
            customer_name: s.customer_name || '',
            total: money(s.total_amount),
            at: s.sale_date,
          })),
      },
    });
  } catch (err) {
    console.error('My today error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not work out your figures.' });
  }
};

module.exports = { getMyWeek, getMyToday, weekStarting };
