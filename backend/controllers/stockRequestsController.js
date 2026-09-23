const { validationResult } = require('express-validator');
const StockRequest = require('../models/StockRequest');
const Notification = require('../models/Notification');

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

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Every line needs a product. Pick one from the list.',
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
      message: `${req.user.username} submitted a stock request for ${items.length} item(s).`,
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

    request.status = 'approved';
    request.approved_by = req.user._id;
    request.approved_date = new Date();
    await request.save();

    await Notification.create({
      user_id: request.created_by,
      type: 'info',
      title: 'Stock Request Approved',
      message: `Your stock request has been approved by ${req.user.username}.`,
      link: `/stock-requests/${request._id}`,
    });

    return res.status(200).json({ success: true, message: 'Stock request approved.', data: request });
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
