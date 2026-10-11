const { validationResult } = require('express-validator');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const { notifyUser, notifyOwners } = require('../utils/notify');
const { ROLE_LEVELS } = require('../middleware/rbac');

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

    /**
     * A manager receives goods; an owner prices them.
     *
     * Somebody counting boxes off a lorry should not have to know what the
     * shop paid, and should not be able to rewrite the figure every profit
     * number in the system is worked out from. Below owner level the costs
     * are neither asked for nor accepted: the delivery is recorded at what
     * the product last cost, marked as unconfirmed, and an owner prices it.
     */
    const canPrice = (ROLE_LEVELS[req.user.role] || 0) >= 3;

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
      let unitCost;
      let costAssumed = false;
      if (canPrice) {
        unitCost = Number(item.unit_cost);
        if (!Number.isFinite(unitCost) || unitCost <= 0) {
          return res.status(400).json({
            success: false,
            message: `Enter what one ${product.name} cost you.`,
          });
        }
      } else {
        // Whatever the shop paid last time, carried for the record only.
        unitCost = Number(product.cost_price) || 0;
        costAssumed = true;
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
        cost_assumed: costAssumed,
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
      awaiting_costing: !canPrice,
    });

    // The stock goes on either way — the goods are physically there. The
    // cost price only moves when an owner actually typed one.
    for (const item of purchaseItems) {
      const update = { $inc: { quantity: item.quantity } };
      if (!item.cost_assumed) update.$set = { cost_price: item.unit_cost };
      await Product.findByIdAndUpdate(item.product_id, update);
    }

    if (!canPrice) {
      // Unpriced stock quietly carries an old cost into every future profit
      // figure, so somebody who can price it is told it is waiting.
      await notifyOwners({
        type: 'important',
        title: 'Delivery needs pricing',
        message: `${req.user.username} received ${purchaseItems.length} item(s). `
          + 'What they cost has not been entered.',
        link: '/purchases',
        exclude_user_id: req.user._id,
      }).catch(() => {});
    }

    const populated = await Purchase.findById(purchase._id)
      .populate('supplier_id', 'name')
      .populate('created_by', 'username');

    return res.status(201).json({
      success: true,
      message: canPrice
        ? 'Purchase recorded.'
        : 'Stock received. The office will enter what it cost.',
      data: populated,
    });
  } catch (err) {
    console.error('Create purchase error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not record it: ${err.message}` });
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

/**
 * PUT /api/purchases/:id/costs
 *
 * An owner puts the real cost on a delivery a manager received.
 *
 * Only now does the product's cost price move, which is the whole point of
 * keeping the two jobs apart: the shop floor says what arrived, the office
 * says what it was worth.
 */
const pricePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, message: 'Delivery not found.' });

    const costs = Array.isArray(req.body?.costs) ? req.body.costs : null;
    if (!costs) {
      return res.status(400).json({ success: false, message: 'What did these cost?' });
    }

    // Checked in full before anything is written: half-priced goods are
    // worse than unpriced ones, because nothing flags them afterwards.
    const priced = [];
    for (let i = 0; i < purchase.items.length; i += 1) {
      const line = purchase.items[i];
      const value = Number(costs[i]);
      if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({
          success: false,
          message: `Enter what one ${line.product_name} cost you.`,
        });
      }
      priced.push(Number(value.toFixed(2)));
    }

    let total = 0;
    purchase.items.forEach((line, i) => {
      line.unit_cost = priced[i];
      line.total = Number((line.quantity * priced[i]).toFixed(2));
      line.cost_assumed = false;
      total += line.total;
    });
    purchase.total_amount = Number(total.toFixed(2));
    purchase.awaiting_costing = false;
    purchase.costed_by = req.user._id;
    purchase.costed_at = new Date();
    await purchase.save();

    // The stock itself was already added when the goods arrived; only what
    // it is worth changes here.
    for (const line of purchase.items) {
      if (!line.product_id) continue;
      await Product.findByIdAndUpdate(line.product_id, { $set: { cost_price: line.unit_cost } });
    }

    await notifyUser(purchase.created_by, {
      type: 'info',
      title: 'Delivery priced',
      message: `The delivery you received has been priced at GH₵${purchase.total_amount.toFixed(2)}.`,
      link: '/purchases',
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `Priced at GH₵${purchase.total_amount.toFixed(2)}.`,
      data: purchase,
    });
  } catch (err) {
    console.error('Price purchase error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not price it: ${err.message}` });
  }
};

module.exports = { getPurchases, createPurchase, getPurchase, deletePurchase, pricePurchase };
