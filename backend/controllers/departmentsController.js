const Product = require('../models/Product');
const Category = require('../models/Category');
const { ASPECTS, classify } = require('../config/aspects');
const { isOwner } = require('../middleware/rbac');

/**
 * A department head's own stock.
 *
 * The shop is already sorted into solar, IT and electricals — Business Lines
 * counts the money that way and the catalogue carries the same key on every
 * product. What was missing was a person: somebody whose job is one of those
 * sides of the shop, who can see what it holds and put a new product where
 * it belongs without being handed the whole catalogue and every price in it.
 *
 * Two rules run through all of this. A head sees their own departments and
 * nothing else, and a head may only sort a product *into* a department they
 * run — otherwise "sorting" would be a way to take another head's stock.
 */

/** The departments this person runs; owners run all of them. */
const departmentsFor = (user) => {
  if (isOwner(user?.role)) return ASPECTS.map((a) => a.key).filter((k) => k !== 'other');
  return (user?.departments || []).map((d) => String(d).toLowerCase().trim()).filter(Boolean);
};

const labelFor = (key) => ASPECTS.find((a) => a.key === key)?.label || key;

/**
 * GET /api/departments/mine
 *
 * Everything the screen needs: which departments are theirs, what is in
 * each, what is running out, and what has not been sorted into any
 * department yet — the last being the work the screen exists to do.
 */
const myDepartments = async (req, res) => {
  try {
    const mine = departmentsFor(req.user);
    if (mine.length === 0) {
      return res.status(200).json({
        success: true,
        data: { departments: [], products: [], unsorted: [], mine: [] },
      });
    }

    const [products, categories] = await Promise.all([
      Product.find({ is_active: true })
        .select('name quantity low_stock_level aspect category_id barcode')
        .populate('category_id', 'name aspect')
        .sort({ name: 1 })
        .limit(3000),
      Category.find().select('name aspect').lean(),
    ]);

    const catById = new Map(categories.map((c) => [String(c._id), c]));

    const inMine = [];
    const unsorted = [];
    /**
     * Everything else in the shop.
     *
     * This used to be withheld: a product sitting in another department
     * was not offered, so sorting could only ever place goods nobody had
     * placed. The shop asked for the opposite — heads know which stock is
     * theirs better than the sorter does, and a panel filed under IT by a
     * keyword is exactly the thing the head of solar should be able to
     * take back. It is listed separately, and claiming one says where it
     * came from, so moving another department's goods is a deliberate act
     * rather than a quiet one.
     */
    const elsewhere = [];
    for (const p of products) {
      const category = p.category_id ? catById.get(String(p.category_id._id || p.category_id)) : null;
      const { aspect, source } = classify(p, category);

      const row = {
        _id: p._id,
        name: p.name,
        quantity: p.quantity ?? 0,
        low_stock_level: p.low_stock_level ?? 0,
        low: (p.quantity ?? 0) <= (p.low_stock_level ?? 0),
        aspect,
        // Where the department came from matters to a head: 'guess' means
        // nobody has actually said, and it is the guess that is theirs to
        // confirm or correct.
        source,
        category: category?.name || null,
      };

      if (mine.includes(aspect)) inMine.push(row);
      else if (aspect === 'other') unsorted.push(row);
      else elsewhere.push(row);
    }

    const departments = mine.map((key) => {
      const rows = inMine.filter((r) => r.aspect === key);
      return {
        key,
        label: labelFor(key),
        products: rows.length,
        pieces: rows.reduce((s, r) => s + (r.quantity || 0), 0),
        low: rows.filter((r) => r.low).length,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        mine,
        departments,
        products: inMine,
        unsorted: unsorted.slice(0, 500),
        elsewhere: elsewhere.slice(0, 500),
      },
    });
  } catch (err) {
    console.error('My departments error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/departments/product/:id
 *
 * Put a product into one of my departments.
 */
const claimProduct = async (req, res) => {
  try {
    const mine = departmentsFor(req.user);
    const aspect = String(req.body?.aspect || '').toLowerCase().trim();

    if (!mine.includes(aspect)) {
      return res.status(403).json({
        success: false,
        message: `You do not run ${labelFor(aspect) || 'that department'}.`,
      });
    }

    const product = await Product.findById(req.params.id).select('name aspect category_id');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    /**
     * Any product may be claimed, including one filed elsewhere.
     *
     * The shop's reasoning: a head knows which stock is theirs better than
     * a keyword does, and a solar panel filed under IT is precisely what
     * they should be able to take back without finding an owner first.
     *
     * What is kept is the trace. The move is named in the reply, so
     * nobody takes another department's goods without being told that is
     * what they did, and the route writes an audit entry either way.
     */
    const current = String(product.aspect || '').toLowerCase();
    const moved = current && current !== 'other' && current !== aspect;

    product.aspect = aspect;
    await product.save();

    return res.status(200).json({
      success: true,
      data: {
        _id: product._id,
        name: product.name,
        aspect,
        moved_from: moved ? current : null,
        message: moved
          ? `${product.name} moved from ${labelFor(current)} to ${labelFor(aspect)}`
          : `${product.name} → ${labelFor(aspect)}`,
      },
    });
  } catch (err) {
    console.error('Claim product error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { myDepartments, claimProduct, departmentsFor };
