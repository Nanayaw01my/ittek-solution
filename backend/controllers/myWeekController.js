const Sale = require('../models/Sale');
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

module.exports = { getMyWeek, weekStarting };
