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

/**
 * POST /api/purchases/:id/pay — hand money to a supplier.
 *
 * Writes no Expense, deliberately. The goods are already carried at cost on
 * the shelf and that cost reaches the profit figure when they are sold;
 * recording the payment as an expense as well would charge the shop twice for
 * the same goods. This settles a debt that was already incurred.
 */
const payPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id).populate('supplier_id', 'name');
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found.' });

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'How much was paid?' });
    }

    const owed = Math.max(0, Number(((purchase.total_amount || 0) - (purchase.amount_paid || 0)).toFixed(2)));
    if (owed <= 0) {
      return res.status(400).json({ success: false, message: 'This one is already settled.' });
    }
    // Paying more than is owed is a typo, every time. Refusing it is kinder
    // than recording a supplier balance that reads as negative for ever.
    if (amount > owed + 0.004) {
      return res.status(400).json({
        success: false,
        message: `Only ${owed.toFixed(2)} is still owed on this delivery.`,
      });
    }

    const method = ['cash', 'bank', 'mobile_money', 'cheque', 'other'].includes(req.body?.method)
      ? req.body.method : 'cash';

    purchase.payments.push({
      amount: Number(amount.toFixed(2)),
      method,
      reference: req.body?.reference,
      note: req.body?.note,
      paid_at: new Date(),
      paid_by: req.user._id,
    });
    await purchase.save();

    const left = purchase.balance();
    const who = purchase.supplier_id?.name || 'the supplier';
    return res.status(200).json({
      success: true,
      message: left > 0
        ? `GH¢${amount.toFixed(2)} paid to ${who}. GH¢${left.toFixed(2)} still owed.`
        : `GH¢${amount.toFixed(2)} paid to ${who}. Settled in full.`,
      data: purchase,
    });
  } catch (err) {
    console.error('Pay purchase error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not record it: ${err.message}` });
  }
};

/**
 * PUT /api/purchases/:id/terms — when the supplier expects to be paid.
 *
 * Kept apart from editing the delivery itself: agreeing a date is a thing
 * that happens after the goods have arrived and the sheet is otherwise
 * finished with.
 */
const setPurchaseTerms = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found.' });

    if (req.body?.due_date === null || req.body?.due_date === '') purchase.due_date = undefined;
    else if (req.body?.due_date) {
      const when = new Date(req.body.due_date);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ success: false, message: 'That date did not make sense.' });
      }
      purchase.due_date = when;
    }
    if (typeof req.body?.notes === 'string') purchase.notes = req.body.notes.trim();

    await purchase.save();
    return res.status(200).json({ success: true, message: 'Saved.', data: purchase });
  } catch (err) {
    console.error('Set purchase terms error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/purchases/payables — what the shop owes, by supplier.
 *
 * Grouped by supplier because that is who gets paid. A list of eleven
 * deliveries is not an answer to "what do we owe Kofi Trading?"
 */
const getPayables = async (req, res) => {
  try {
    const open = await Purchase.find({ payment_status: { $ne: 'paid' } })
      .populate('supplier_id', 'name phone')
      .sort({ due_date: 1, purchase_date: 1 })
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bySupplier = new Map();
    let total = 0;
    let overdue = 0;

    for (const p of open) {
      const owed = Math.max(0, Number(((p.total_amount || 0) - (p.amount_paid || 0)).toFixed(2)));
      if (owed <= 0) continue;
      total += owed;

      const late = p.due_date && new Date(p.due_date) < today;
      if (late) overdue += owed;

      // Deliveries bought without naming a supplier still have to be shown,
      // or the total on screen quietly disagrees with the deliveries below it.
      const key = p.supplier_id?._id ? String(p.supplier_id._id) : 'unknown';
      if (!bySupplier.has(key)) {
        bySupplier.set(key, {
          supplier_id: p.supplier_id?._id ? String(p.supplier_id._id) : null,
          supplier_name: p.supplier_id?.name || 'No supplier recorded',
          supplier_phone: p.supplier_id?.phone || '',
          owed: 0,
          overdue: 0,
          deliveries: [],
        });
      }
      const row = bySupplier.get(key);
      row.owed = Number((row.owed + owed).toFixed(2));
      if (late) row.overdue = Number((row.overdue + owed).toFixed(2));
      row.deliveries.push({
        _id: String(p._id),
        purchase_date: p.purchase_date,
        due_date: p.due_date || null,
        total_amount: p.total_amount,
        amount_paid: p.amount_paid || 0,
        owed,
        overdue: !!late,
        item_count: (p.items || []).length,
        payment_status: p.payment_status,
      });
    }

    const suppliers = [...bySupplier.values()].sort((a, b) => b.owed - a.owed);

    return res.status(200).json({
      success: true,
      data: {
        suppliers,
        summary: {
          owed: Number(total.toFixed(2)),
          overdue: Number(overdue.toFixed(2)),
          suppliers: suppliers.length,
          deliveries: suppliers.reduce((n, s) => n + s.deliveries.length, 0),
        },
      },
    });
  } catch (err) {
    console.error('Get payables error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getPurchases, createPurchase, getPurchase, deletePurchase,
  payPurchase, setPurchaseTerms, getPayables,
};
