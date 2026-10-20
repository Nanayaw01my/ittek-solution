const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Refund = require('../models/Refund');
const Debt = require('../models/Debt');
const Layaway = require('../models/Layaway');
const Product = require('../models/Product');
const User = require('../models/User');

/**
 * Who sold what, to whom, and at what discount.
 *
 * The figures were all in the system and none of them were in one place. A
 * CEO could see the day's takings, and could open any single receipt, but
 * could not ask the question an owner actually asks: is somebody selling
 * cheap, and to the same few names every time?
 *
 * Three questions, three answers:
 *   summary — each member of staff, their takings and the discount they gave
 *   sales   — the individual sales behind those figures, with the customer
 *   trail   — one sale and everything that has happened to it since
 *
 * A discount hides in two places, so both are counted. The discount field is
 * the honest one. The other is a unit price typed in below what the product
 * sells for, which never appears as a discount anywhere — and is the one
 * worth catching.
 */

/** The window being asked about. Defaults to this month. */
const range = (q) => {
  const to = q.to ? new Date(q.to) : new Date();
  to.setHours(23, 59, 59, 999);
  let from;
  if (q.from) {
    from = new Date(q.from);
  } else {
    from = new Date(to);
    from.setDate(1);
  }
  from.setHours(0, 0, 0, 0);
  return { from, to };
};

/**
 * What a sale was discounted by, in cedis.
 *
 * A percentage discount is stored as the percentage, not the money, so it
 * has to be worked out against the subtotal — otherwise "10" reads as ten
 * cedis off a four thousand cedi sale and the whole screen understates what
 * is being given away.
 */
const discountOf = (sale) => {
  const sub = Number(sale.subtotal) || 0;
  const d = Number(sale.discount) || 0;
  const cash = sale.discount_type === 'percentage' ? (sub * d) / 100 : d;
  return Math.max(0, cash) + (Number(sale.loyalty_discount) || 0);
};

/**
 * GET /api/staff-sales/summary
 *
 * One row per member of staff. Sorted by what they gave away rather than
 * what they sold, because the figure this screen exists for is the discount.
 */
const getSummary = async (req, res) => {
  try {
    const { from, to } = range(req.query);

    const sales = await Sale.find({ sale_date: { $gte: from, $lte: to } })
      .select('user_id subtotal discount discount_type loyalty_discount total_amount '
        + 'customer_phone customer_name payment_status')
      .lean();

    const byUser = new Map();
    for (const s of sales) {
      const id = String(s.user_id || 'unknown');
      if (!byUser.has(id)) {
        byUser.set(id, {
          user_id: id,
          sales_count: 0,
          gross: 0,
          discount_total: 0,
          discounted_count: 0,
          biggest_discount: 0,
          on_credit: 0,
          customers: new Set(),
        });
      }
      const row = byUser.get(id);
      const d = discountOf(s);
      row.sales_count += 1;
      row.gross += Number(s.total_amount) || 0;
      row.discount_total += d;
      if (d > 0) row.discounted_count += 1;
      if (d > row.biggest_discount) row.biggest_discount = d;
      if (s.payment_status !== 'paid') row.on_credit += 1;
      // A walk-in with no phone is not a customer anybody is favouring, so
      // it does not count towards "how few names does this person sell to".
      if (s.customer_phone) row.customers.add(String(s.customer_phone));
    }

    const ids = [...byUser.keys()].filter((id) => mongoose.isValidObjectId(id));
    const users = await User.find({ _id: { $in: ids } }).select('username role').lean();
    const nameOf = new Map(users.map((u) => [String(u._id), u]));

    const rows = [...byUser.values()].map((r) => {
      const who = nameOf.get(r.user_id);
      const before = r.gross + r.discount_total;
      return {
        user_id: r.user_id,
        username: who?.username || 'Unknown',
        role: who?.role || '—',
        sales_count: r.sales_count,
        gross: Number(r.gross.toFixed(2)),
        discount_total: Number(r.discount_total.toFixed(2)),
        // What share of what the shop would have taken was given away. The
        // cash figure alone says nothing without the size of the trade
        // behind it.
        discount_pct: before > 0 ? Number(((r.discount_total / before) * 100).toFixed(1)) : 0,
        discounted_count: r.discounted_count,
        biggest_discount: Number(r.biggest_discount.toFixed(2)),
        on_credit: r.on_credit,
        customers: r.customers.size,
      };
    }).sort((a, b) => b.discount_total - a.discount_total || b.gross - a.gross);

    return res.status(200).json({
      success: true,
      data: {
        from,
        to,
        staff: rows,
        totals: {
          sales_count: rows.reduce((n, r) => n + r.sales_count, 0),
          gross: Number(rows.reduce((n, r) => n + r.gross, 0).toFixed(2)),
          discount_total: Number(rows.reduce((n, r) => n + r.discount_total, 0).toFixed(2)),
        },
      },
    });
  } catch (err) {
    console.error('Staff sales summary error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not read it: ${err.message}` });
  }
};

/**
 * GET /api/staff-sales/sales
 *
 * The sales behind the figures, newest first. Filterable by who sold it, by
 * customer, and by whether anything was taken off — because "show me every
 * sale this person discounted" is the question that follows the summary.
 */
const getSales = async (req, res) => {
  try {
    const { from, to } = range(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);

    const filter = { sale_date: { $gte: from, $lte: to } };
    if (req.query.user_id && mongoose.isValidObjectId(req.query.user_id)) {
      filter.user_id = req.query.user_id;
    }
    if (req.query.customer) {
      const term = String(req.query.customer).trim();
      // Escaped: a customer called "A+B" is a search, not a pattern.
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { customer_name: { $regex: safe, $options: 'i' } },
        { customer_phone: { $regex: safe, $options: 'i' } },
        { invoice_no: { $regex: safe, $options: 'i' } },
      ];
    }

    const all = await Sale.find(filter)
      .select('invoice_no sale_date user_id customer_name customer_phone subtotal discount '
        + 'discount_type loyalty_discount total_amount payment_status payment_method items')
      .populate('user_id', 'username role')
      .sort({ sale_date: -1 })
      .lean();

    // Worked out here rather than in the query: a percentage discount is not
    // a number mongo can compare against cedis.
    const withDiscount = all.map((s) => ({
      ...s,
      discount_cash: Number(discountOf(s).toFixed(2)),
      item_count: (s.items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0),
      items: undefined,
    }));

    const rows = req.query.discounted === 'true'
      ? withDiscount.filter((s) => s.discount_cash > 0)
      : withDiscount;

    const total = rows.length;
    const start = (page - 1) * limit;

    return res.status(200).json({
      success: true,
      data: {
        sales: rows.slice(start, start + limit),
        pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
        discount_total: Number(rows.reduce((n, s) => n + s.discount_cash, 0).toFixed(2)),
      },
    });
  } catch (err) {
    console.error('Staff sales list error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not read it: ${err.message}` });
  }
};

/**
 * GET /api/staff-sales/sale/:id
 *
 * One sale, and everything that has happened to it since.
 *
 * The refunds against it, the debt it created and what has been paid off,
 * any layaway the same customer holds, and — the part that is not recorded
 * anywhere else — each line sold below what the product sells for.
 */
const getTrail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'That is not a sale id.' });
    }

    const sale = await Sale.findById(id).populate('user_id', 'username role').lean();
    if (!sale) {
      return res.status(404).json({ success: false, message: 'That sale no longer exists.' });
    }

    /**
     * Sold below the list price.
     *
     * The discount box is the honest way to give money away and it shows up
     * everywhere. Typing a lower unit price does not, which makes it the
     * one worth surfacing. Compared against what the product sells for
     * today — so a genuine price change since the sale reads as a markdown,
     * which is why the list price is shown beside it rather than the
     * difference alone.
     */
    const ids = (sale.items || []).map((i) => i.product_id).filter(Boolean);
    const products = ids.length
      ? await Product.find({ _id: { $in: ids } }).select('selling_price').lean()
      : [];
    const listOf = new Map(products.map((p) => [String(p._id), Number(p.selling_price) || 0]));

    const items = (sale.items || []).map((i) => {
      const list = listOf.get(String(i.product_id)) || 0;
      const unit = Number(i.unit_price) || 0;
      const under = list > 0 && unit < list ? (list - unit) * (Number(i.quantity) || 0) : 0;
      return {
        ...i,
        list_price: list || null,
        below_list: Number(under.toFixed(2)),
      };
    });

    const [refunds, debt, layaways, alsoBought] = await Promise.all([
      Refund.find({ sale_id: sale._id })
        .populate('requested_by approved_by', 'username')
        .sort({ createdAt: -1 })
        .lean(),
      Debt.findOne({ sale_id: sale._id })
        .populate('recorded_by', 'username')
        .lean(),
      sale.customer_phone
        ? Layaway.find({ customer_phone: sale.customer_phone })
          .select('reference status total_amount amount_paid balance created_at')
          .sort({ created_at: -1 })
          .limit(5)
          .lean()
        : [],
      // The rest of this customer's trade, so one cheap sale can be seen in
      // the context of whether it is always the same person serving them.
      sale.customer_phone
        ? Sale.find({ customer_phone: sale.customer_phone, _id: { $ne: sale._id } })
          .select('invoice_no sale_date user_id subtotal discount discount_type '
            + 'loyalty_discount total_amount')
          .populate('user_id', 'username')
          .sort({ sale_date: -1 })
          .limit(10)
          .lean()
        : [],
    ]);

    return res.status(200).json({
      success: true,
      data: {
        sale: {
          ...sale,
          items,
          discount_cash: Number(discountOf(sale).toFixed(2)),
          below_list_total: Number(items.reduce((n, i) => n + i.below_list, 0).toFixed(2)),
        },
        refunds,
        debt,
        layaways,
        customer_history: alsoBought.map((s) => ({
          ...s,
          discount_cash: Number(discountOf(s).toFixed(2)),
        })),
      },
    });
  } catch (err) {
    console.error('Staff sale trail error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not read it: ${err.message}` });
  }
};

module.exports = { getSummary, getSales, getTrail, discountOf };
