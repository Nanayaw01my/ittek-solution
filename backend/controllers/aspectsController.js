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

/** The date a sale belongs to, or null when it has none worth using. */
const dayKey = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

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

    /**
     * The same money, day by day.
     *
     * A range tells an owner what a week came to; it does not tell them
     * which day was good. Both are wanted and they are the same arithmetic,
     * so the day is kept as the sale is read rather than queried again.
     */
    const byDay = new Map();

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

        /**
         * Same figures, gathered by the day the sale was made.
         *
         * A sale with no usable date — an old record, a bad import — is
         * left out of the day-by-day list rather than allowed to throw.
         * One unreadable date must not cost an owner the whole report, and
         * the line still counts towards its business line and the totals.
         */
        const day = dayKey(sale.sale_date);
        if (!day) continue;
        const d = byDay.get(day) || { date: day, revenue: 0, cost: 0, pieces: 0, sales: new Set() };
        d.revenue += revenue;
        d.cost += cost;
        d.pieces += qty;
        d.sales.add(String(sale._id));
        byDay.set(day, d);
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
          cost: Number(lines.reduce((n, l) => n + l.cost, 0).toFixed(2)),
          // What the shop kept, as a share of what it took. The figure an
          // owner judges a day by once they have seen the cedis.
          margin: revenue > 0
            ? Number(((lines.reduce((n, l) => n + l.profit, 0) / revenue) * 100).toFixed(1))
            : 0,
          profit: Number(lines.reduce((n, l) => n + l.profit, 0).toFixed(2)),
          pieces: lines.reduce((n, l) => n + l.pieces, 0),
          sales: new Set(sales.map((s) => String(s._id))).size,
        },
        /**
         * Newest day first, so the day being asked about is at the top.
         *
         * The cost and the takings are both carried rather than only the
         * difference: an owner checking a day's profit wants to see the two
         * figures it came from, not be asked to trust one.
         */
        days: [...byDay.values()]
          .map((d) => ({
            date: d.date,
            revenue: Number(d.revenue.toFixed(2)),
            cost: Number(d.cost.toFixed(2)),
            profit: Number((d.revenue - d.cost).toFixed(2)),
            margin: d.revenue > 0 ? Number((((d.revenue - d.cost) / d.revenue) * 100).toFixed(1)) : 0,
            pieces: d.pieces,
            sales: d.sales.size,
          }))
          .sort((a, b) => b.date.localeCompare(a.date)),
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

    const said = `${product.name} is ${aspect || 'back to following its category'}.`;
    return res.status(200).json({
      success: true,
      message: said,
      // Inside `data` too — see the note in autoSort.
      data: { ...(product.toObject ? product.toObject() : product), message: said },
    });
  } catch (err) {
    console.error('Set product aspect error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/aspects/catalogue
 *
 * Every product, and which department it would fall into.
 *
 * The report works a product's department out as it runs, which answers the
 * question but leaves nothing behind — an owner cannot see what the system
 * thinks of the catalogue until a thing is sold. This is that view: how many
 * products sit in each department, how many were placed by reading a name
 * rather than by somebody saying so, and exactly which ones it could not
 * place at all.
 */
const catalogue = async (req, res) => {
  try {
    const [products, categories] = await Promise.all([
      Product.find({ is_active: { $ne: false } })
        .select('name aspect category_id')
        .sort({ name: 1 })
        .lean(),
      Category.find({}).select('name aspect').lean(),
    ]);

    const catById = new Map(categories.map((c) => [String(c._id), c]));
    const counts = Object.fromEntries(ASPECT_KEYS.map((k) => [k, { certain: 0, guessed: 0 }]));
    const unplaced = [];
    const guesses = [];

    for (const p of products) {
      const category = p.category_id ? catById.get(String(p.category_id)) : null;
      const { aspect, source } = classify(p, category);
      const row = counts[aspect];
      if (source === 'guess') {
        row.guessed += 1;
        guesses.push({ _id: p._id, name: p.name, aspect, category: category?.name || null });
      } else if (source === 'none') {
        unplaced.push({ _id: p._id, name: p.name, category: category?.name || null });
      } else {
        row.certain += 1;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        total: products.length,
        counts: ASPECTS.map(({ key, label }) => ({
          key, label, ...counts[key], total: counts[key].certain + counts[key].guessed,
        })),
        // Capped: an owner wants to see what is stuck, not scroll a
        // catalogue. The count above is the honest total.
        unplaced: unplaced.slice(0, 100),
        unplaced_total: unplaced.length,
        guessed_total: guesses.length,
      },
    });
  } catch (err) {
    console.error('Catalogue aspects error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not read it: ${err.message}` });
  }
};

/**
 * POST /api/aspects/auto-sort
 *
 * Write the guesses down, so they stop being guesses.
 *
 * Only where nobody has said otherwise: a product with a department set by
 * hand, or sitting in a category that has one, is left exactly as it is.
 * This fills in the ones the system was going to work out every time anyway
 * — and once written they can be corrected on the Products screen, which a
 * guess made afresh on every report could not be.
 *
 * Deliberately not run on its own. Sorting a shop's whole catalogue is the
 * kind of thing an owner should press a button for and be told the result
 * of, not find already done.
 */
const autoSort = async (req, res) => {
  try {
    const [products, categories] = await Promise.all([
      Product.find({ is_active: { $ne: false } }).select('name aspect category_id').lean(),
      Category.find({}).select('name aspect').lean(),
    ]);

    const catById = new Map(categories.map((c) => [String(c._id), c]));
    const writes = [];
    const placed = Object.fromEntries(ASPECT_KEYS.map((k) => [k, 0]));

    for (const p of products) {
      // Already decided by a person, here or on its category: leave it be.
      if (p.aspect) continue;
      const category = p.category_id ? catById.get(String(p.category_id)) : null;
      if (category?.aspect) continue;

      const { aspect, source } = classify(p, category);
      if (source !== 'guess') continue;

      placed[aspect] += 1;
      writes.push({
        updateOne: { filter: { _id: p._id }, update: { $set: { aspect } } },
      });
    }

    if (writes.length) await Product.bulkWrite(writes);

    const parts = ASPECTS
      .filter(({ key }) => placed[key] > 0)
      .map(({ key, label }) => `${placed[key]} to ${label}`);

    const said = writes.length
      ? `Sorted ${writes.length} product${writes.length === 1 ? '' : 's'} — ${parts.join(', ')}.`
      : 'Nothing to sort — every product already has a department or cannot be read from its name.';

    return res.status(200).json({
      success: true,
      message: said,
      /**
       * The sentence goes inside `data` as well as beside it.
       *
       * The browser's axios layer unwraps {success, data} and keeps only
       * `data`; every sibling is dropped on the way through. A message sent
       * only alongside never reaches the screen, and the owner who just
       * pressed a button that edited five hundred products is told
       * "Sorted." with no idea what moved where.
       */
      data: { updated: writes.length, placed, message: said },
    });
  } catch (err) {
    console.error('Auto-sort aspects error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not sort them: ${err.message}` });
  }
};

module.exports = { salesByAspect, setProductAspect, catalogue, autoSort };
