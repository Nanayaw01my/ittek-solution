const { validationResult } = require('express-validator');
const StockRequest = require('../models/StockRequest');
const Notification = require('../models/Notification');
const Product = require('../models/Product');

/**
 * GET /api/stock-requests
 */
const getStockRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};

    // Manager sees only own requests
    if (req.user.role === 'Manager') {
      filter.created_by = req.user._id;
    }
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [requests, total] = await Promise.all([
      StockRequest.find(filter)
        .populate('created_by', 'username')
        .populate('approved_by', 'username')
        .sort({ request_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StockRequest.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: requests,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get stock requests error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/stock-requests
 */
const createStockRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { items, notes } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item required.' });
    }

    // Take the line however it arrives. The screen sends product ids and the
    // record stores a named line, and a mismatch between the two used to fail
    // deep in the database and come back as a flat "Server error" with nothing
    // to act on. Anything genuinely missing is named below instead.
    const lines = [];
    for (const raw of items) {
      const name = String(raw.product_name || raw.name || '').trim();
      const quantity = Number(raw.quantity_requested ?? raw.quantity);
      const cost = Number(raw.estimated_cost ?? raw.estimatedCost) || 0;
      // A line with no product behind it is a new item being asked for.
      const isNew = !!(raw.is_new_product ?? raw.isNew) || !(raw.product_id || raw.product);
      const sellingPrice = Number(raw.selling_price ?? raw.sellingPrice);

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Every line needs a product — pick one, or type the name of a new one.',
        });
      }
      // The two prices are what a product cannot exist without, so they are
      // asked for here rather than leaving the owner to guess them at the
      // moment of approval.
      if (isNew && (!Number.isFinite(cost) || cost <= 0)) {
        return res.status(400).json({
          success: false,
          message: `What does ${name} cost to buy? A new item needs its cost.`,
        });
      }
      if (isNew && (!Number.isFinite(sellingPrice) || sellingPrice <= 0)) {
        return res.status(400).json({
          success: false,
          message: `What should ${name} sell for? A new item needs a selling price.`,
        });
      }
      if (!Number.isFinite(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `How many ${name}? Enter a quantity of at least 1.`,
        });
      }

      lines.push({
        product_id: raw.product_id || raw.product || undefined,
        product_name: name,
        quantity_requested: quantity,
        estimated_cost: cost,
        total: Number((raw.total ?? quantity * cost).toFixed(2)),
        is_new_product: isNew,
        selling_price: isNew ? Number(sellingPrice.toFixed(2)) : undefined,
        category_id: raw.category_id || raw.category || undefined,
      });
    }

    const total_amount = Number(lines.reduce((sum, i) => sum + i.total, 0).toFixed(2));

    const request = await StockRequest.create({
      created_by: req.user._id,
      items: lines,
      total_amount,
      notes,
    });

    // Notify CEO/Super Admin
    await Notification.create({
      user_id: null,
      type: 'important',
      title: 'New Stock Request',
      message: (() => {
        const brandNew = lines.filter((l) => l.is_new_product).map((l) => l.product_name);
        const base = `${req.user.username} submitted a stock request for ${lines.length} item(s).`;
        return brandNew.length
          ? `${base} ${brandNew.length} not stocked before: ${brandNew.join(', ')}.`
          : base;
      })(),
      link: `/stock-requests/${request._id}`,
    });

    return res.status(201).json({ success: true, message: 'Stock request submitted.', data: request });
  } catch (err) {
    // The real reason, on screen and in the log. "Server error." told the
    // person nothing and left no trail to follow.
    console.error('Create stock request error:', err.stack || err.message);
    if (err.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: first?.message || 'That request is missing something.',
      });
    }
    return res.status(500).json({
      success: false,
      message: `Could not submit the request: ${err.message}`,
    });
  }
};

/**
 * GET /api/stock-requests/:id
 */
const getStockRequest = async (req, res) => {
  try {
    const request = await StockRequest.findById(req.params.id)
      .populate('created_by', 'username')
      .populate('approved_by', 'username');

    if (!request) return res.status(404).json({ success: false, message: 'Stock request not found.' });

    if (req.user.role === 'Manager' && String(request.created_by._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({ success: true, data: request });
  } catch (err) {
    console.error('Get stock request error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/stock-requests/:id/approve
 */
const approveStockRequest = async (req, res) => {
  try {
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Stock request not found.' });

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is not pending.' });
    }

    /**
     * Approving a new item is how it gets onto the shelf.
     *
     * Only an owner may create a product, and the owner is the one standing
     * here saying yes — so this is the right moment to make it, rather than
     * sending them off to the products screen to type the same thing again
     * and probably spell it differently.
     *
     * It is created with no stock. Nothing has arrived yet; the request is
     * permission to buy it. The quantity lands when the delivery is received
     * against the purchase, the same as for anything already stocked.
     */
    const created = [];
    for (const line of request.items) {
      if (!line.is_new_product || line.product_id) continue;

      // Somebody may well have added it by hand in the meantime, and a second
      // copy of the same item is worse than no new item at all.
      const existing = await Product.findOne({
        name: new RegExp(`^${String(line.product_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).select('_id name');

      if (existing) {
        line.product_id = existing._id;
        continue;
      }

      const product = await Product.create({
        name: line.product_name,
        cost_price: line.estimated_cost || 0,
        selling_price: line.selling_price || line.estimated_cost || 0,
        category_id: line.category_id || undefined,
        quantity: 0,
      });
      line.product_id = product._id;
      created.push(product.name);
    }

    request.status = 'approved';
    request.approved_by = req.user._id;
    request.approved_date = new Date();
    await request.save();

    await Notification.create({
      user_id: request.created_by,
      type: 'info',
      title: 'Stock Request Approved',
      message: created.length
        ? `Your stock request has been approved by ${req.user.username}. `
          + `${created.join(', ')} ${created.length === 1 ? 'is' : 'are'} now in the products list, at zero stock until the goods come in.`
        : `Your stock request has been approved by ${req.user.username}.`,
      link: `/stock-requests/${request._id}`,
    });

    return res.status(200).json({
      success: true,
      message: created.length
        ? `Approved. Added to products: ${created.join(', ')}.`
        : 'Stock request approved.',
      data: request,
    });
  } catch (err) {
    console.error('Approve stock request error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/stock-requests/:id/reject
 */
const rejectStockRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Stock request not found.' });

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is not pending.' });
    }

    request.status = 'rejected';
    request.rejected_reason = reason || 'No reason provided.';
    request.approved_by = req.user._id;
    request.approved_date = new Date();
    await request.save();

    await Notification.create({
      user_id: request.created_by,
      type: 'important',
      title: 'Stock Request Rejected',
      message: `Your stock request was rejected. Reason: ${request.rejected_reason}`,
      link: `/stock-requests/${request._id}`,
    });

    return res.status(200).json({ success: true, message: 'Stock request rejected.', data: request });
  } catch (err) {
    console.error('Reject stock request error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/stock-requests/:id
 */
const deleteStockRequest = async (req, res) => {
  try {
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Stock request not found.' });

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be deleted.' });
    }

    if (String(request.created_by) !== String(req.user._id) && req.user.role === 'Manager') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await StockRequest.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Stock request deleted.' });
  } catch (err) {
    console.error('Delete stock request error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getStockRequests, createStockRequest, getStockRequest, approveStockRequest, rejectStockRequest, deleteStockRequest };
