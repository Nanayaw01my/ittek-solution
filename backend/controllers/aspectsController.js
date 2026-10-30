const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { ASPECTS, ASPECT_KEYS, classify } = require('../config/aspects');

/**
 * The day's takings, split into the three sides of the business.
 *
 * Solar, networking and electricals are sold out of one till and one
 * catalogue, which is right — a customer buying panels and a router pays
 * once. But at the end of the day the owners want to know which side the
 * money came from, and that answer was nowhere: it meant reading the sales
 * list and sorting it in your head.
 *
 * Owners only, because it carries cost and profit.
 */

/** The window being asked about. Defaults to today. */
const range = (q) => {
  const to = q.to ? new Date(q.to) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = q.from ? new Date(q.from) : new Date(to);
  from.setHours(0, 0, 0, 0);
  return { from, to };
};

/**
 * GET /api/aspects/sales?from&to
 */
const salesByAspect = async (req, res) => {
  try {
    const { from, to } = range(req.query);

    const sales = await Sale.find({
      sale_date: { $gte: from, $lte: to },
      // A debt payment is money against goods counted on the day they were
      // sold. Counting it again here would put the same panel in Solar twice.
      payment_status: { $ne: 'debt_payment' },
    }).select('invoice_no sale_date items').lean();

    // Every product that was actually sold, with its category — rather than
    // the whole catalogue, which on a big shop is most of a megabyte to
    // answer a question about eleven sales.
    const ids = [...new Set(
      sales.flatMap((s) => (s.items || []).map((i) => i.product_id).filter(Boolean)).map(String)
    )].filter((id) => mongoose.isValidObjectId(id));

    const products = await Product.find({ _id: { $in: ids } })
      .select('name aspect category_id')
      .lean();
    const categories = await Category.find({}).select('name aspect').lean();

    const catById = new Map(categories.map((c) => [String(c._id), c]));
    const prodById = new Map(products.map((p) => [String(p._id), p]));

    const blank = () => ({
      revenue: 0, cost: 0, profit: 0, pieces: 0, lines: 0, guessed: 0,
      products: new Map(), sales: new Set(),
    });
    const byAspect = new Map(ASPECT_KEYS.map((k) => [k, blank()]));

    for (const sale of sales) {
      for (const item of sale.items || []) {
        const product = prodById.get(String(item.product_id)) || { name: item.product_name };
        const category = product.category_id ? catById.get(String(product.category_id)) : null;
        const { aspect, source } = classify(
          { ...product, product_name: item.product_name },
          category
        );

        const row = byAspect.get(aspect) || byAspect.get('other');
        const qty = Number(item.quantity) || 0;
        const revenue = Number(item.total) || 0;
        const cost = (Number(item.cost_price) || 0) * qty;

        row.revenue += revenue;
        row.cost += cost;
        row.pieces += qty;
        row.lines += 1;
        if (source === 'guess') row.guessed += 1;
        row.sales.add(String(sale._id));

        const key = item.product_name || 'Unknown';
        const line = row.products.get(key) || { name: key, pieces: 0, revenue: 0, source };
        line.pieces += qty;
        line.revenue = Number((line.revenue + revenue).toFixed(2));
        row.products.set(key, line);
      }
    }

    const lines = ASPECTS.map(({ key, label }) => {
      const r = byAspect.get(key);
      return {
        key,
        label,
        revenue: Number(r.revenue.toFixed(2)),
        cost: Number(r.cost.toFixed(2)),
        profit: Number((r.revenue - r.cost).toFixed(2)),
        pieces: r.pieces,
        sales: r.sales.size,
        guessed: r.guessed,
        products: [...r.products.values()].sort((a, b) => b.revenue - a.revenue),
      };
    });

    const revenue = Number(lines.reduce((n, l) => n + l.revenue, 0).toFixed(2));

    return res.status(200).json({
      success: true,
      data: {
        from,
        to,
        total: {
          revenue,
          profit: Number(lines.reduce((n, l) => n + l.profit, 0).toFixed(2)),
          pieces: lines.reduce((n, l) => n + l.pieces, 0),
          sales: new Set(sales.map((s) => String(s._id))).size,
        },
        lines: lines.map((l) => ({
          ...l,
          // What share of the day each side of the business was.
          share: revenue > 0 ? Number(((l.revenue / revenue) * 100).toFixed(1)) : 0,
        })),
      },
    });
  } catch (err) {
    console.error('Sales by aspect error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not read it: ${err.message}` });
  }
};

/**
 * PUT /api/aspects/product/:id — put one product on a particular side.
 *
 * The screen shows what it had to guess at; this is how a guess is
 * corrected, from the screen that noticed it, without going to Products and
 * finding the thing again.
 */
const setProductAspect = async (req, res) => {
  try {
    const { aspect } = req.body;
    if (!ASPECT_KEYS.includes(aspect) && aspect !== '') {
      return res.status(400).json({ success: false, message: 'That is not one of the business lines.' });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { aspect },
      { new: true }
    ).select('name aspect');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    return res.status(200).json({
      success: true,
      message: `${product.name} is ${aspect || 'back to following its category'}.`,
      data: product,
    });
  } catch (err) {
    console.error('Set product aspect error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { salesByAspect, setProductAspect };
