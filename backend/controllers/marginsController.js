const Product = require('../models/Product');
const Purchase = require('../models/Purchase');

/**
 * Which products are being sold too cheaply, and which are about to be.
 *
 * Supplier costs rise. Selling prices do not, because nobody is watching the
 * gap — and the first sign is usually a month's profit that looks wrong with
 * no obvious reason. By then the shop has been selling at a loss for weeks
 * and has no idea on what.
 *
 * Two different things are checked, and they are not the same:
 *
 *   - the margin the product record itself implies, which is wrong whenever
 *     the recorded cost is out of date;
 *   - what the shop *actually paid* last time, out of the purchase book,
 *     which is the figure that tells the truth.
 *
 * The second is the valuable one. A product showing a healthy margin on a
 * cost recorded eight months ago is exactly the product quietly losing money.
 */

const pct = (n) => Number(n.toFixed(1));

/** What a line is worth saying about, worst first. */
const rank = { losing: 0, thin: 1, stale_cost: 2, ok: 3 };

/**
 * GET /api/reports/margins?thin=15
 *
 * `thin` is the margin, as a percentage of the selling price, below which a
 * product is worth a look. Default 15 — low enough not to flag every
 * competitive line, high enough to catch one that has slipped.
 */
const getMargins = async (req, res) => {
  try {
    const thin = Math.min(90, Math.max(0, Number(req.query.thin) || 15));

    const products = await Product.find({ is_active: { $ne: false } })
      .select('name sku barcode cost_price selling_price quantity has_variants variants category_id')
      .populate('category_id', 'name')
      .lean();

    // What was last actually paid for each product, out of the purchase book.
    // One pass over purchases rather than a query per product: a catalogue of
    // six hundred would otherwise be six hundred round trips.
    const purchases = await Purchase.find({})
      .select('items purchase_date')
      .sort({ purchase_date: -1 })
      .limit(1000)
      .lean();

    const lastPaid = new Map();
    for (const p of purchases) {
      for (const item of p.items || []) {
        if (!item.product_id) continue;
        const key = String(item.product_id);
        // Sorted newest first, so the first one seen is the most recent.
        if (!lastPaid.has(key)) {
          lastPaid.set(key, { cost: Number(item.unit_cost) || 0, on: p.purchase_date });
        }
      }
    }

    const rows = [];
    for (const product of products) {
      // A product sold by size has a price per size; judging it on the parent
      // record's numbers would report a margin nothing is actually sold at.
      const lines = product.has_variants && (product.variants || []).length
        ? product.variants
          .filter((v) => v.is_active !== false)
          .map((v) => ({
            label: `${product.name} — ${v.name}`,
            cost: Number(v.cost_price) || 0,
            price: Number(v.selling_price) || 0,
            quantity: v.quantity || 0,
          }))
        : [{
          label: product.name,
          cost: Number(product.cost_price) || 0,
          price: Number(product.selling_price) || 0,
          quantity: product.quantity || 0,
        }];

      const paid = lastPaid.get(String(product._id));

      for (const line of lines) {
        if (line.price <= 0) continue;

        // The cost to judge by is whichever is higher: what the record says,
        // or what was actually paid last time. Taking the lower would let a
        // stale record hide a real loss, which is the whole problem.
        const trueCost = paid ? Math.max(line.cost, paid.cost) : line.cost;
        const margin = line.price - trueCost;
        const marginPct = pct((margin / line.price) * 100);
        const recordedPct = line.cost > 0 ? pct(((line.price - line.cost) / line.price) * 100) : 100;

        // A recorded cost meaningfully below what was last paid is itself
        // worth reporting, even where the margin still looks survivable.
        const staleCost = paid && paid.cost > line.cost * 1.02 && line.cost > 0;

        let state = 'ok';
        if (margin <= 0) state = 'losing';
        else if (marginPct < thin) state = 'thin';
        else if (staleCost) state = 'stale_cost';

        if (state === 'ok') continue;

        rows.push({
          product_id: String(product._id),
          name: line.label,
          category: product.category_id?.name || '',
          barcode: product.barcode || '',
          quantity: line.quantity,
          recorded_cost: Number(line.cost.toFixed(2)),
          last_paid: paid ? Number(paid.cost.toFixed(2)) : null,
          last_paid_on: paid?.on || null,
          selling_price: Number(line.price.toFixed(2)),
          margin: Number(margin.toFixed(2)),
          margin_pct: marginPct,
          recorded_margin_pct: recordedPct,
          stale_cost: !!staleCost,
          state,
          // What it costs the shop to leave this alone, which is the number
          // that decides whether anybody does anything about it.
          at_risk: Number((Math.max(0, -margin) * (line.quantity || 0)).toFixed(2)),
        });
      }
    }

    rows.sort((a, b) => (rank[a.state] - rank[b.state]) || (a.margin_pct - b.margin_pct));

    return res.status(200).json({
      success: true,
      data: {
        products: rows,
        thin,
        summary: {
          losing: rows.filter((r) => r.state === 'losing').length,
          thin: rows.filter((r) => r.state === 'thin').length,
          stale_cost: rows.filter((r) => r.stale_cost).length,
          // The loss already sitting on the shelf, if every one sold today.
          at_risk: Number(rows.reduce((t, r) => t + r.at_risk, 0).toFixed(2)),
          checked: products.length,
        },
      },
    });
  } catch (err) {
    console.error('Margins report error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getMargins };
