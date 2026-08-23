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
const getProducts = async (req, res) => {
  try {
    const { search, category, low_stock, view, page = 1, limit = 50 } = req.query;
    const filter = { is_active: true };

    const scoped = view === 'catalogue' && isInventoryOnly(req.user);
    if (scoped) {
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
        // Anchored and escaped: a name like "6mm (per roll)" is a valid regex
        // that would otherwise match the wrong things — or nothing at all.
        name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
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
const bulkImport = async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide an array of products.' });
    }

    const results = { created: 0, failed: 0, errors: [] };
    for (const item of items) {
      try {
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

module.exports = {
  getProducts, createProduct, getProduct, updateProduct, deleteProduct,
  getLowStock, getByBarcode, searchProducts, bulkImport,
};
