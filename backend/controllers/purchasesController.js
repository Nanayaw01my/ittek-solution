const { validationResult } = require('express-validator');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');

/**
 * GET /api/purchases
 */
const getPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 50, startDate, endDate } = req.query;
    const filter = {};

    if (startDate || endDate) {
      filter.purchase_date = {};
      if (startDate) filter.purchase_date.$gte = new Date(startDate);
      if (endDate) filter.purchase_date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [purchases, total] = await Promise.all([
      Purchase.find(filter)
        .populate('supplier_id', 'name phone')
        .populate('created_by', 'username')
        .sort({ purchase_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Purchase.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: purchases,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get purchases error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/purchases
 */
const createPurchase = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { supplier_id, purchase_date, notes, items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Purchase must have at least one item.' });
    }

    // Compute totals and validate products
    const purchaseItems = [];
    let total_amount = 0;

    for (const item of items) {
      const product = await Product.findById(item.product_id).catch(() => null);
      if (!product) {
        return res.status(400).json({ success: false, message: `Product not found: ${item.product_id}` });
      }

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `How many ${product.name} came in?`,
        });
      }

      // The cost is what every profit figure in the system is worked out
      // from, and this is the one place it gets rewritten. A blank left
      // unchecked would set it to zero and quietly report the whole selling
      // price as profit on every future sale of that product.
      const unitCost = Number(item.unit_cost);
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        return res.status(400).json({
          success: false,
          message: `Enter what one ${product.name} cost you.`,
        });
      }

      // A variant product keeps its counts on the variants, so adding to the
      // parent would put the stock somewhere nothing sells from.
      if (product.has_variants && (product.variants || []).length > 0) {
        return res.status(400).json({
          success: false,
          message: `${product.name} has variants — receive those on the product itself.`,
        });
      }

      const itemTotal = Number((quantity * unitCost).toFixed(2));
      purchaseItems.push({
        product_id: product._id,
        product_name: product.name,
        quantity,
        unit_cost: unitCost,
        total: itemTotal,
      });
      total_amount += itemTotal;
    }
    total_amount = Number(total_amount.toFixed(2));

    const purchase = await Purchase.create({
      // An empty string is not an id; left as one it fails the cast and the
      // whole delivery is lost to a 500 over an optional field.
      supplier_id: supplier_id || undefined,
      purchase_date: purchase_date || new Date(),
      total_amount,
      notes,
      created_by: req.user._id,
      items: purchaseItems,
    });

    // Update stock quantities and cost prices
    for (const item of purchaseItems) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { quantity: item.quantity },
        $set: { cost_price: item.unit_cost },
      });
    }

    const populated = await Purchase.findById(purchase._id)
      .populate('supplier_id', 'name')
      .populate('created_by', 'username');

    return res.status(201).json({ success: true, message: 'Purchase recorded.', data: populated });
  } catch (err) {
    console.error('Create purchase error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/purchases/:id
 */
const getPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate('supplier_id', 'name phone address')
      .populate('created_by', 'username');

    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found.' });
    return res.status(200).json({ success: true, data: purchase });
  } catch (err) {
    console.error('Get purchase error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/purchases/:id (reverse purchase)
 */
const deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found.' });

    // Reverse stock deductions
    for (const item of purchase.items) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { quantity: -item.quantity },
      });
    }

    await Purchase.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Purchase reversed and deleted.' });
  } catch (err) {
    console.error('Delete purchase error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getPurchases, createPurchase, getPurchase, deletePurchase };
