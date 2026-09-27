const Sale = require('../models/Sale');
const Product = require('../models/Product');

/**
 * What to order, worked out from what actually sells.
 *
 * A fixed low-stock level treats every product the same: five left is a
 * crisis for something that goes out eight a week and a year's supply for
 * something that sells one a month. This counts what each product has
 * actually sold over a window and turns what is left into the thing the shop
 * needs to know — how many days before it runs out.
 */
const getReorderSuggestions = async (req, res) => {
  try {
    // Long enough to see a pattern, short enough to reflect how things sell
    // now. A quarter, by default.
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 90));
    // How far ahead the shop wants to be covered — roughly how long stock
    // takes to arrive, plus a margin.
    const cover = Math.min(180, Math.max(1, Number(req.query.cover_days) || 30));

    const since = new Date();
    since.setDate(since.getDate() - days);

    const sold = await Sale.aggregate([
      { $match: { sale_date: { $gte: since } } },
      { $unwind: '$items' },
      { $match: { 'items.product_id': { $ne: null } } },
      {
        $group: {
          _id: '$items.product_id',
          units: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
          last_sold: { $max: '$sale_date' },
          orders: { $sum: 1 },
        },
      },
    ]);

    const movement = new Map(sold.map((s) => [String(s._id), s]));

    const products = await Product.find({ is_active: { $ne: false } })
      .select('name quantity low_stock_level cost_price selling_price supplier_id has_variants variants')
      .populate('supplier_id', 'name')
      .lean();

    const rows = products.map((p) => {
      const m = movement.get(String(p._id));
      const units = m?.units || 0;
      // Variant products hold their count on the variants, not the parent.
      const onHand = p.has_variants && Array.isArray(p.variants) && p.variants.length
        ? p.variants.reduce((t, v) => t + (v.quantity || 0), 0)
        : (p.quantity || 0);

      const perDay = units / days;
      const perWeek = Number((perDay * 7).toFixed(1));
      // Nothing sold means no rate to divide by — that is "unknown", not
      // "lasts forever", and the two must not look the same.
      const daysLeft = perDay > 0 ? Math.floor(onHand / perDay) : null;

      // Enough to cover the window, less what is already on the shelf.
      const target = Math.ceil(perDay * cover);
      const suggested = Math.max(0, target - onHand);

      let urgency = 'ok';
      if (perDay > 0) {
        if (onHand <= 0) urgency = 'out';
        else if (daysLeft <= Math.ceil(cover / 3)) urgency = 'urgent';
        else if (daysLeft <= cover) urgency = 'soon';
      } else if (onHand <= (p.low_stock_level || 0)) {
        // No movement to measure, but the old threshold still says something.
        urgency = onHand <= 0 ? 'out' : 'soon';
      }

      return {
        _id: p._id,
        name: p.name,
        supplier: p.supplier_id?.name || null,
        on_hand: onHand,
        low_stock_level: p.low_stock_level || 0,
        sold_in_window: units,
        revenue_in_window: Number((m?.revenue || 0).toFixed(2)),
        per_week: perWeek,
        days_left: daysLeft,
        suggested_order: suggested,
        order_cost: Number((suggested * (p.cost_price || 0)).toFixed(2)),
        last_sold: m?.last_sold || null,
        urgency,
      };
    });

    const rank = { out: 0, urgent: 1, soon: 2, ok: 3 };
    // Everything that is not fine, so the counts above the table and the rows
    // in it are the same set. A slow product sitting under its threshold has
    // nothing to suggest ordering, but it still has to be visible.
    const needed = rows
      .filter((r) => r.urgency !== 'ok')
      .sort((a, b) => (rank[a.urgency] - rank[b.urgency])
        || ((a.days_left ?? 9999) - (b.days_left ?? 9999))
        || (b.per_week - a.per_week));

    // Money sitting on the shelf that nothing has asked for.
    const deadStock = rows
      .filter((r) => r.sold_in_window === 0 && r.on_hand > 0)
      .sort((a, b) => b.on_hand - a.on_hand)
      .slice(0, 25);

    return res.status(200).json({
      success: true,
      data: {
        window_days: days,
        cover_days: cover,
        suggestions: needed.slice(0, 100),
        dead_stock: deadStock,
        summary: {
          out_of_stock: rows.filter((r) => r.urgency === 'out').length,
          urgent: rows.filter((r) => r.urgency === 'urgent').length,
          soon: rows.filter((r) => r.urgency === 'soon').length,
          order_cost: Number(needed.reduce((t, r) => t + r.order_cost, 0).toFixed(2)),
          dead_count: rows.filter((r) => r.sold_in_window === 0 && r.on_hand > 0).length,
        },
      },
    });
  } catch (err) {
    console.error('Reorder suggestions error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getReorderSuggestions };
