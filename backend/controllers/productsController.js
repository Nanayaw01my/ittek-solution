const { validationResult } = require('express-validator');
const Product = require('../models/Product');

const { effectiveMode } = require('../config/pageAccess');

/**
 * A user granted the Products page as 'inventory' is there to keep stock
 * straight, not to read the shop's margins: they add products and correct
 * quantities, and never see a cost price, a selling price or a supplier.
 *
 * The restriction is scoped to the catalogue view. The POS asks for products
 * without `view=catalogue`, so selling is unaffected by any of this.
 */
const productsMode = (user) => effectiveMode(user, 'products');

const isInventoryOnly = (user) => productsMode(user) === 'inventory';

/**
 * Categories an inventory user has been narrowed to. Optional: an empty list
 * means they may work across the whole catalogue.
 */
const assignedCategoryIds = (user) => (user?.assigned_categories || []).map(String);

/** Strip everything an inventory-only user is not meant to see off a product. */
const withoutPricing = (product) => {
  const p = typeof product.toObject === 'function' ? product.toObject() : { ...product };
  delete p.cost_price;
  delete p.selling_price;
  delete p.supplier_id;
  (p.variants || []).forEach((v) => {
    delete v.cost_price;
    delete v.selling_price;
  });
  return p;
};

/**
 * Confirm a category is one this user may put products in. Returns an error
 * message, or null when it is allowed.
 */
const categoryRefusal = (user, categoryId) => {
  if (!isInventoryOnly(user)) return null;
  const allowed = assignedCategoryIds(user);
  if (allowed.length === 0) return null; // not narrowed to particular categories
  if (!categoryId || !allowed.includes(String(categoryId))) {
    return 'You can only work with products in the categories assigned to you.';
  }
  return null;
};

/**
 * GET /api/products
 */
/**
 * The filter behind both the product list and its totals, so the figures on
 * screen always describe exactly the rows being shown — search a term and the
 * totals follow it.
 */
/**
 * Match a product name exactly, ignoring case and surrounding spaces.
 * Escaped, because a name like "6mm (per roll)" is itself a valid regex.
 */
const exactNameRegex = (name) =>
  new RegExp('^' + String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');

const buildProductFilter = (req) => {
  const { search, category, low_stock, view } = req.query;
  const filter = { is_active: true };

  if (view === 'catalogue' && isInventoryOnly(req.user)) {
    const allowed = assignedCategoryIds(req.user);
    if (allowed.length > 0) {
      filter.category_id = category && allowed.includes(String(category))
        ? category
        : { $in: allowed };
    }
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
    ];
  }
  if (category) filter.category_id = category;
  if (low_stock === 'true') {
    filter.$expr = { $lte: ['$quantity', '$low_stock_level'] };
  }
  return filter;
};

const getProducts = async (req, res) => {
  try {
    const { category, view, page = 1, limit = 50 } = req.query;
    const filter = buildProductFilter(req);
    const scoped = view === 'catalogue' && isInventoryOnly(req.user);

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category_id', 'name')
        .populate('supplier_id', 'name phone')
        .sort({ name: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: scoped ? products.map(withoutPricing) : products,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get products error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/products
 */
const createProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    // Checked here rather than in the route because it depends on the body.
    const refusal = categoryRefusal(req.user, req.body.category_id);
    if (refusal) return res.status(403).json({ success: false, message: refusal });

    // Refuse a product the shop already sells. Only the barcode was unique
    // before, so the same item could be added again under the same name with a
    // blank barcode — leaving its stock split across two records, with the POS
    // showing both and neither count right.
    const name = String(req.body.name || '').trim();
    if (name) {
      const existing = await Product.findOne({
        is_active: true,
        name: exactNameRegex(name),
      }).select('name quantity');

      if (existing) {
        return res.status(409).json({
          success: false,
          message: `"${existing.name}" is already in the catalogue with ${existing.quantity} in stock. Update that product instead of adding it again.`,
          data: { existing_id: existing._id },
        });
      }
    }

    const product = await Product.create(req.body);
    const populated = await Product.findById(product._id)
      .populate('category_id', 'name')
      .populate('supplier_id', 'name');

    return res.status(201).json({ success: true, message: 'Product created.', data: populated });
  } catch (err) {
    console.error('Create product error:', err.message);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Barcode already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/products/low-stock
 */
const getLowStock = async (req, res) => {
  try {
    const products = await Product.find({
      is_active: true,
      $expr: { $lte: ['$quantity', '$low_stock_level'] },
    })
      .populate('category_id', 'name')
      .populate('supplier_id', 'name')
      .sort({ quantity: 1 });

    return res.status(200).json({ success: true, data: products, count: products.length });
  } catch (err) {
    console.error('Low stock error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/products/barcode/:barcode
 */
const getByBarcode = async (req, res) => {
  try {
    const product = await Product.findOne({ barcode: req.params.barcode, is_active: true })
      .populate('category_id', 'name')
      .populate('supplier_id', 'name');

    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    console.error('Get by barcode error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/products/search
 */
const searchProducts = async (req, res) => {
  try {
    const { query, limit = 20 } = req.body;
    if (!query) return res.status(400).json({ success: false, message: 'Search query required.' });

    const products = await Product.find({
      is_active: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { barcode: { $regex: query, $options: 'i' } },
      ],
    })
      .populate('category_id', 'name')
      .limit(Number(limit));

    return res.status(200).json({ success: true, data: products });
  } catch (err) {
    console.error('Search products error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/products/:id
 */
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category_id', 'name')
      .populate('supplier_id', 'name phone');

    if (!product || !product.is_active) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    console.error('Get product error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/products/:id
 */
const updateProduct = async (req, res) => {
  try {
    // Load-assign-save rather than findByIdAndUpdate: the pre('save') hook is
    // what keeps has_variants and the rolled-up stock quantity correct, and
    // findByIdAndUpdate bypasses it.
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    if (Array.isArray(req.body.variants)) {
      const skus = req.body.variants.map((v) => String(v.sku || '').trim()).filter(Boolean);
      if (new Set(skus).size !== skus.length) {
        return res.status(400).json({ success: false, message: 'Variant SKUs must be unique within a product.' });
      }
    }

    // Inventory-only users keep stock straight; they do not reprice, rename or
    // move products between categories. Anything else in the body is ignored
    // rather than refused, so a stale form cannot fail the whole save.
    if (isInventoryOnly(req.user)) {
      const refusal = categoryRefusal(req.user, product.category_id);
      if (refusal) return res.status(403).json({ success: false, message: refusal });

      const INVENTORY_FIELDS = ['quantity', 'low_stock_level', 'barcode', 'image_url'];
      INVENTORY_FIELDS.forEach((field) => {
        if (req.body[field] !== undefined) product[field] = req.body[field];
      });
    } else {
      Object.assign(product, req.body);
    }
    await product.save();

    const populated = await Product.findById(product._id)
      .populate('category_id', 'name')
      .populate('supplier_id', 'name');

    return res.status(200).json({ success: true, message: 'Product updated.', data: populated });
  } catch (err) {
    console.error('Update product error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/products/:id (soft delete)
 */
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { is_active: false }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.status(200).json({ success: true, message: 'Product deactivated.' });
  } catch (err) {
    console.error('Delete product error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/products/bulk-import
 */
/**
 * GET /api/products/summary
 *
 * What the catalogue adds up to: how many products, how many units on the
 * shelf, and what that stock is worth at cost and at selling price. Takes the
 * same search/category/low-stock filters as the list, so the figures always
 * match what is on screen rather than the whole catalogue.
 *
 * Cost and the profit it implies are money figures, so they are left out for a
 * user granted the page as inventory-only.
 */
const getProductSummary = async (req, res) => {
  try {
    const filter = buildProductFilter(req);
    const hideMoney = isInventoryOnly(req.user);

    const [agg] = await Product.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          products: { $sum: 1 },
          units: { $sum: { $ifNull: ['$quantity', 0] } },
          costValue: {
            $sum: { $multiply: [{ $ifNull: ['$quantity', 0] }, { $ifNull: ['$cost_price', 0] }] },
          },
          sellingValue: {
            $sum: { $multiply: [{ $ifNull: ['$quantity', 0] }, { $ifNull: ['$selling_price', 0] }] },
          },
          outOfStock: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$quantity', 0] }, 0] }, 1, 0] } },
        },
      },
    ]);

    const totals = agg || { products: 0, units: 0, costValue: 0, sellingValue: 0, outOfStock: 0 };

    return res.status(200).json({
      success: true,
      data: {
        products: totals.products,
        units: totals.units,
        outOfStock: totals.outOfStock,
        sellingValue: totals.sellingValue,
        ...(hideMoney ? {} : {
          costValue: totals.costValue,
          potentialProfit: totals.sellingValue - totals.costValue,
        }),
      },
    });
  } catch (err) {
    console.error('Product summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const bulkImport = async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide an array of products.' });
    }

    const results = { created: 0, skipped: 0, failed: 0, errors: [] };
    for (const item of items) {
      try {
        // The same check the single-product form and the file import make.
        // Without it this route was a way into the catalogue that could add a
        // product that was already there.
        const name = String(item?.name || '').trim();
        if (!name) {
          results.skipped++;
          results.errors.push({ item: '(no name)', error: 'A product needs a name.' });
          continue;
        }
        const clash = await Product.findOne({ is_active: true, name: exactNameRegex(name) }, '_id');
        if (clash) {
          results.skipped++;
          results.errors.push({ item: name, error: 'Already in the catalogue' });
          continue;
        }

        await Product.create(item);
        results.created++;
      } catch (err) {
        results.failed++;
        results.errors.push({ item: item.name, error: err.message });
      }
    }

    return res.status(200).json({ success: true, message: 'Bulk import complete.', data: results });
  } catch (err) {
    console.error('Bulk import error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * The whole catalogue in one response, for the till to keep offline.
 *
 * Deliberately not the paginated list: the POS used to fill its offline copy
 * from page one of that, which meant only the first 50 products by name were
 * ever available with no connection and everything later in the alphabet
 * simply could not be sold.
 *
 * Trimmed to what the till actually needs. A full catalogue has to fit in the
 * browser's storage alongside the queued sales, and cost prices and supplier
 * details have no business sitting on a shop floor device in the first place.
 */
const getOfflineCatalogue = async (req, res) => {
  try {
    const products = await Product.find({ is_active: true })
      .select('name barcode selling_price quantity low_stock_level unit image_url has_variants variants category_id')
      .populate('category_id', 'name')
      .sort({ name: 1 })
      .lean();

    const slim = products.map((p) => ({
      _id: p._id,
      name: p.name,
      barcode: p.barcode || '',
      selling_price: p.selling_price,
      quantity: p.quantity,
      low_stock_level: p.low_stock_level,
      unit: p.unit,
      image_url: p.image_url,
      category_id: p.category_id ? { _id: p.category_id._id, name: p.category_id.name } : null,
      has_variants: !!p.has_variants,
      // A product with variants is unsellable without them — the till sells
      // the variant, never the parent.
      variants: (p.variants || []).map((v) => ({
        _id: v._id,
        sku: v.sku,
        name: v.name,
        barcode: v.barcode || '',
        selling_price: v.selling_price,
        quantity: v.quantity,
      })),
    }));

    return res.status(200).json({
      success: true,
      data: slim,
      count: slim.length,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Offline catalogue error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};


/**
 * The key two product names are the same under.
 *
 * Case and spacing are ignored, so "570W Panel", "570w  panel" and
 * "570W Panel " are one product. The add-product check only ever compared a
 * trimmed new name against whatever was stored, so a record saved years ago
 * with a trailing space was invisible to it and a second copy went in.
 */
const nameKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * GET /api/products/duplicates
 *
 * Active products that share a name, grouped. Read-only — it says what is
 * wrong and leaves the fixing to a person, because which record to keep is a
 * judgement about which one the shop has been counting against.
 */
const getDuplicateProducts = async (req, res) => {
  try {
    const products = await Product.find({ is_active: true })
      .select('name barcode quantity cost_price selling_price category_id createdAt')
      .populate('category_id', 'name')
      .sort({ createdAt: 1 })
      .lean();

    const groups = new Map();
    products.forEach((p) => {
      const key = nameKey(p.name);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        _id: p._id,
        name: p.name,
        barcode: p.barcode || '',
        quantity: p.quantity || 0,
        cost_price: p.cost_price,
        selling_price: p.selling_price,
        category: p.category_id?.name || '',
        createdAt: p.createdAt,
      });
    });

    const duplicates = [...groups.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({
        key,
        name: list[0].name,
        count: list.length,
        total_quantity: list.reduce((s, x) => s + (x.quantity || 0), 0),
        products: list,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return res.status(200).json({
      success: true,
      data: {
        groups: duplicates,
        group_count: duplicates.length,
        extra_records: duplicates.reduce((s, g) => s + g.count - 1, 0),
      },
    });
  } catch (err) {
    console.error('Duplicate products error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/products/merge-duplicates  { keep_id, remove_ids, move_stock }
 *
 * Keeps one record and retires the others.
 *
 * The retired ones are deactivated, never erased: past sales point at them,
 * and deleting them outright would put holes in the sales history. With
 * `move_stock` their quantities are added to the kept product first, which is
 * usually right — the stock is real and sitting on one shelf, split across two
 * records only because the catalogue had it twice.
 */
const mergeDuplicateProducts = async (req, res) => {
  try {
    const { keep_id, remove_ids, move_stock = true } = req.body || {};
    const removeIds = (Array.isArray(remove_ids) ? remove_ids : []).filter((id) => String(id) !== String(keep_id));

    if (!keep_id || removeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Choose the product to keep and at least one to retire.',
      });
    }

    const keep = await Product.findById(keep_id);
    if (!keep || !keep.is_active) {
      return res.status(404).json({ success: false, message: 'The product to keep was not found.' });
    }

    const removing = await Product.find({ _id: { $in: removeIds }, is_active: true });
    if (removing.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching products to retire.' });
    }

    let moved = 0;
    if (move_stock) {
      moved = removing.reduce((s, p) => s + (p.quantity || 0), 0);
      if (moved > 0) {
        // Atomic, and no validation on a record that is not being edited here.
        await Product.findByIdAndUpdate(keep._id, { $inc: { quantity: moved } });
      }
    }

    await Product.updateMany(
      { _id: { $in: removing.map((p) => p._id) } },
      { $set: { is_active: false, quantity: 0 } },
    );

    const updated = await Product.findById(keep._id).select('name quantity').lean();

    return res.status(200).json({
      success: true,
      message: `${removing.length} duplicate record${removing.length === 1 ? '' : 's'} retired.`
        + (move_stock && moved > 0
          ? ` ${moved} unit${moved === 1 ? '' : 's'} moved into "${updated.name}", now ${updated.quantity} in stock.`
          : ''),
      data: { kept: updated, retired: removing.length, moved },
    });
  } catch (err) {
    console.error('Merge duplicates error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getDuplicateProducts, mergeDuplicateProducts,
  getProducts, createProduct, getProduct, updateProduct, deleteProduct,
  getLowStock, getByBarcode, searchProducts, bulkImport, getProductSummary,
  getOfflineCatalogue,
};
