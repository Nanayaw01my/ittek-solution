const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const logger = require('../utils/logger');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/products
 */
const getProducts = async (req, res) => {
  try {
    const { search, category, low_stock, page = 1, limit = 50 } = req.query;
    const filter = { is_active: true };

    if (search) {
      const safe = escapeRegex(String(search));
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { barcode: { $regex: safe, $options: 'i' } },
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
      data: products,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    logger.error('Get products error', { error: err.message });
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

    const product = await Product.create(req.body);
    const populated = await Product.findById(product._id)
      .populate('category_id', 'name')
      .populate('supplier_id', 'name');

    return res.status(201).json({ success: true, message: 'Product created.', data: populated });
  } catch (err) {
    logger.error('Create product error', { error: err.message });
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
    logger.error('Low stock error', { error: err.message });
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
    logger.error('Get by barcode error', { error: err.message });
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

    const safe = escapeRegex(String(query));
    const products = await Product.find({
      is_active: true,
      $or: [
        { name: { $regex: safe, $options: 'i' } },
        { barcode: { $regex: safe, $options: 'i' } },
      ],
    })
      .populate('category_id', 'name')
      .limit(Number(limit));

    return res.status(200).json({ success: true, data: products });
  } catch (err) {
    logger.error('Search products error', { error: err.message });
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
    logger.error('Get product error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/products/:id
 */
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('category_id', 'name')
      .populate('supplier_id', 'name');

    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.status(200).json({ success: true, message: 'Product updated.', data: product });
  } catch (err) {
    logger.error('Update product error', { error: err.message });
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
    logger.error('Delete product error', { error: err.message });
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
        const { name, barcode, description, selling_price, cost_price, quantity, low_stock_level, category_id, supplier_id, unit } = item;
        await Product.create({ name, barcode, description, selling_price, cost_price, quantity, low_stock_level, category_id, supplier_id, unit });
        results.created++;
      } catch (err) {
        results.failed++;
        results.errors.push({ item: item.name, error: err.message });
      }
    }

    return res.status(200).json({ success: true, message: 'Bulk import complete.', data: results });
  } catch (err) {
    logger.error('Bulk import error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getProducts, createProduct, getProduct, updateProduct, deleteProduct,
  getLowStock, getByBarcode, searchProducts, bulkImport,
};
