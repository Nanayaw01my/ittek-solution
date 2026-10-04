const Sale = require('../models/Sale');
const User = require('../models/User');
const Dispatch = require('../models/Dispatch');

/**
 * What each person actually sold.
 *
 * The shop has agents on the road and staff behind the counter, and nothing
 * answered "who sold what this month?" — which is the figure that decides who
 * gets more stock, who needs help, and who is carrying the place.
 *
 * Profit is counted from the cost carried on each sale line, not from today's
 * cost price. What a sale earned is settled by what the goods cost when they
 * left, and re-pricing history every time a supplier puts their rates up
 * would quietly rewrite last month's figures.
 */

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

/**
 * GET /api/reports/staff?from=&to=
 *
 * Defaults to this month, which is the period anybody means when they ask.
 */
const getStaffPerformance = async (req, res) => {
  try {
    const now = new Date();
    const from = req.query.from
      ? startOfDay(req.query.from)
      : startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = req.query.to ? endOfDay(req.query.to) : endOfDay(now);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ success: false, message: 'Those dates did not make sense.' });
    }

    const sales = await Sale.find({ sale_date: { $gte: from, $lte: to } })
      .select('user_id total_amount cart_total items payment_status sale_date')
      .lean();

    const byUser = new Map();
    const touch = (id) => {
      const key = String(id);
      if (!byUser.has(key)) {
        byUser.set(key, {
          user_id: key, username: '', role: '',
          sales: 0, revenue: 0, profit: 0, items: 0,
          biggest: 0, debt_payments: 0, collected: 0,
        });
      }
      return byUser.get(key);
    };

    for (const sale of sales) {
      if (!sale.user_id) continue;
      const row = touch(sale.user_id);
      const taken = Number(sale.total_amount) || 0;

      // Money collected against an old debt is real money in, but it is not a
      // sale made today — counting it as one would flatter whoever happened
      // to be at the counter when somebody came in to settle up.
      if (sale.payment_status === 'debt_payment') {
        row.debt_payments += 1;
        row.collected = Number((row.collected + taken).toFixed(2));
        continue;
      }

      row.sales += 1;
      row.revenue = Number((row.revenue + taken).toFixed(2));
      if (taken > row.biggest) row.biggest = taken;

      for (const item of sale.items || []) {
        const qty = Number(item.quantity) || 0;
        row.items += qty;
        const earned = ((Number(item.unit_price) || 0) - (Number(item.cost_price) || 0)) * qty;
        row.profit = Number((row.profit + earned).toFixed(2));
      }
    }

    // Field agents are measured differently: what went out with them and what
    // came back paid for.
    const dispatches = await Dispatch.find({ issued_at: { $gte: from, $lte: to } })
      .select('agent_user_id items sales').lean();

    const fieldByUser = new Map();
    for (const d of dispatches) {
      if (!d.agent_user_id) continue;
      const key = String(d.agent_user_id);
      if (!fieldByUser.has(key)) fieldByUser.set(key, { dispatches: 0, issued: 0, sold: 0, paid_in: 0 });
      const f = fieldByUser.get(key);
      f.dispatches += 1;
      for (const i of d.items || []) {
        f.issued += i.quantity_issued || 0;
        f.sold += i.quantity_sold || 0;
      }
      f.paid_in = Number((f.paid_in + (d.sales || []).reduce((s, x) => s + (x.amount || 0), 0)).toFixed(2));
    }

    // Everybody who could have sold something, so a person with none shows as
    // a nought rather than being absent — absent reads as "no data", and
    // nought is the thing somebody needs to see.
    const staff = await User.find({ is_active: { $ne: false } })
      .select('username role').lean();

    const rows = staff.map((u) => {
      const key = String(u._id);
      const s = byUser.get(key) || {
        sales: 0, revenue: 0, profit: 0, items: 0, biggest: 0, debt_payments: 0, collected: 0,
      };
      const field = fieldByUser.get(key) || null;
      return {
        user_id: key,
        username: u.username,
        role: u.role,
        sales: s.sales,
        revenue: s.revenue,
        profit: s.profit,
        items: s.items,
        biggest: Number((s.biggest || 0).toFixed(2)),
        average: s.sales ? Number((s.revenue / s.sales).toFixed(2)) : 0,
        margin_pct: s.revenue > 0 ? Number(((s.profit / s.revenue) * 100).toFixed(1)) : 0,
        collected: s.collected,
        debt_payments: s.debt_payments,
        field,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const totals = rows.reduce((t, r) => ({
      sales: t.sales + r.sales,
      revenue: Number((t.revenue + r.revenue).toFixed(2)),
      profit: Number((t.profit + r.profit).toFixed(2)),
      collected: Number((t.collected + r.collected).toFixed(2)),
    }), { sales: 0, revenue: 0, profit: 0, collected: 0 });

    return res.status(200).json({
      success: true,
      data: {
        staff: rows,
        totals,
        selling: rows.filter((r) => r.sales > 0).length,
        from,
        to,
      },
    });
  } catch (err) {
    console.error('Staff report error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getStaffPerformance };
