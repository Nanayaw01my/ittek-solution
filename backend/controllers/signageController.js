const Product = require('../models/Product');
const Settings = require('../models/Settings');

/**
 * The board on the shop wall.
 *
 * A screen customers stand in front of, so the only safe way to build it
 * is to decide here, on the server, exactly which fields may leave the
 * building — and to send nothing else. Not "send the products and let the
 * page hide the cost price": a browser's developer tools open in two taps
 * and a signage machine is, by definition, in a room full of strangers.
 *
 * So this picks the four fields a price board needs by name. Cost price,
 * supplier, margin, takings and every other figure the shop holds are not
 * omitted from the response — they are never fetched.
 *
 * What a customer may see on a wall is roughly what they could learn by
 * walking the aisle and reading the shelf: what is for sale, what it
 * costs, and whether it is nearly gone.
 */

/** Pieces left, but only when it is low enough to be worth saying. */
const urgency = (p) => {
  const left = Number(p.quantity) || 0;
  const floor = Number(p.low_stock_level) || 5;
  return left > 0 && left <= floor ? left : null;
};

/**
 * GET /api/signage/board
 *
 * Everything the wall board draws, in one call, so a television on shop
 * wifi makes one request a minute rather than six.
 */
const getBoard = async (req, res) => {
  try {
    const [products, settings] = await Promise.all([
      Product
        .find({
          is_active: true,
          // Nothing out of stock: a price board advertising what the shop
          // cannot sell sends a customer to the counter to be told no,
          // which is worse than not advertising it.
          quantity: { $gt: 0 },
          selling_price: { $gt: 0 },
        })
        // Named fields only. The whole safety of this screen rests on this
        // line, so it is a list and never a `-cost_price` exclusion: an
        // exclusion list quietly leaks every field added later.
        .select('name selling_price quantity low_stock_level aspect image_url')
        .sort({ name: 1 })
        .limit(300)
        .lean(),
      Settings.findOne().lean(),
    ]);

    const promo = settings?.gift_promo;

    return res.status(200).json({
      success: true,
      data: {
        shop: {
          name: settings?.company_name || 'ITTEK Solution',
          address: settings?.company_address || '',
          phone: settings?.company_phone || '',
        },
        // Only when it is actually running, and only the three things a
        // customer needs: spend this much, get that, nothing else.
        promo: promo?.enabled && promo?.gift_name
          ? { threshold: Number(promo.threshold) || 0, gift: promo.gift_name }
          : null,
        products: products.map((p) => ({
          id: String(p._id),
          name: p.name,
          price: Number(p.selling_price) || 0,
          aspect: p.aspect || null,
          image_url: p.image_url || null,
          // How many are left, and only when it is nearly gone. The exact
          // stock figure on every line would tell a competitor walking
          // past the window precisely what the shop is holding.
          left: urgency(p),
        })),
        // So the board can say when it last heard from the shop, rather
        // than showing yesterday's prices as though they were today's.
        as_of: new Date(),
      },
    });
  } catch (err) {
    console.error('Signage board error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not load the board.' });
  }
};

module.exports = { getBoard };
