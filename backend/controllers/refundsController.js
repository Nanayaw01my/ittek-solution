const Refund = require('../models/Refund');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const { ROLE_LEVELS } = require('../middleware/rbac');

/** Put returned goods back on the shelf. */
const restoreStock = async (items = []) => {
  for (const item of items) {
    if (item.product_id && item.quantity > 0) {
      await Product.findByIdAndUpdate(item.product_id, { $inc: { quantity: item.quantity } });
    }
  }
};

/**
 * GET /api/refunds
 */
const getRefunds = async (req, res) => {
  try {
    const { startDate, endDate, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.refund_date = {};
      if (startDate) filter.refund_date.$gte = new Date(startDate);
      if (endDate) filter.refund_date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [refunds, total] = await Promise.all([
      Refund.find(filter)
        .populate('processed_by', 'username')
        .populate('approved_by', 'username')
        .populate('sale_id', 'invoice_no')
        .sort({ refund_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Refund.countDocuments(filter),
    ]);
    return res.status(200).json({
      success: true,
      data: refunds,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get refunds error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/refunds/lookup/:invoiceNo
 * Look up a sale by invoice number to pre-fill the refund form.
 */
const lookupSaleByInvoice = async (req, res) => {
  try {
    const sale = await Sale.findOne({ invoice_no: req.params.invoiceNo.trim() });
    if (!sale) return res.status(404).json({ success: false, message: 'Invoice not found.' });
    return res.status(200).json({ success: true, data: sale });
  } catch (err) {
    console.error('Lookup sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/refunds
 * All authenticated users can process a refund.
 */
const createRefund = async (req, res) => {
  try {
    const { invoice_ref, customer_name, customer_phone, refund_amount, reason, refund_method, items = [] } = req.body;

    if (!customer_name) return res.status(400).json({ success: false, message: 'Customer name is required.' });
    if (!refund_amount || refund_amount <= 0) return res.status(400).json({ success: false, message: 'Refund amount must be greater than 0.' });
    if (!reason) return res.status(400).json({ success: false, message: 'Reason is required.' });
    if (!refund_method) return res.status(400).json({ success: false, message: 'Refund method is required.' });

    let sale_id = null;

    // Look up original sale if invoice ref provided
    if (invoice_ref) {
      const sale = await Sale.findOne({ invoice_no: invoice_ref.trim() });
      if (sale) sale_id = sale._id;
    }

    // Staff raise a request; only a CEO or Super Admin can actually give money
    // back. Nothing moves until it is approved — no stock returns to the shelf
    // and the refund does not count against the day's sales.
    const canApprove = ROLE_LEVELS[req.user.role] >= 3;

    if (canApprove) {
      await restoreStock(items);
    }

    const refund = await Refund.create({
      sale_id,
      invoice_ref: invoice_ref?.trim() || undefined,
      customer_name,
      customer_phone: customer_phone || undefined,
      refund_amount: Number(refund_amount),
      reason,
      refund_method,
      items: items.map(i => ({
        product_id: i.product_id || undefined,
        product_name: i.product_name,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        total: Number(i.total),
      })),
      processed_by: req.user._id,
      requested_by: req.user._id,
      status: canApprove ? 'approved' : 'pending',
      ...(canApprove
        ? { approved_by: req.user._id, approved_at: new Date(), stock_restored: items.length > 0 }
        : {}),
    });

    await Notification.create({
      user_id: null,
      type: 'important',
      title: canApprove ? 'Refund Processed' : 'Refund Awaiting Approval',
      message: canApprove
        ? `Refund of GH₵${Number(refund_amount).toFixed(2)} for ${customer_name}${invoice_ref ? ` (${invoice_ref})` : ''} by ${req.user.username}`
        : `${req.user.username} requested a refund of GH₵${Number(refund_amount).toFixed(2)} for ${customer_name}${invoice_ref ? ` (${invoice_ref})` : ''}. It needs your approval.`,
      link: '/refunds',
    });

    const populated = await Refund.findById(refund._id).populate('processed_by', 'username');
    return res.status(201).json({
      success: true,
      message: canApprove
        ? 'Refund processed successfully.'
        : 'Refund sent to the CEO for approval. Do not give the money out until it is approved.',
      data: populated,
    });
  } catch (err) {
    console.error('Create refund error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/refunds/:id  — CEO / Super Admin only
 */
const updateRefund = async (req, res) => {
  try {
    const { reason, refund_method } = req.body;
    const refund = await Refund.findById(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund not found.' });
    if (reason) refund.reason = reason;
    if (refund_method) refund.refund_method = refund_method;
    await refund.save();
    const populated = await Refund.findById(refund._id).populate('processed_by', 'username');
    return res.status(200).json({ success: true, message: 'Refund updated.', data: populated });
  } catch (err) {
    console.error('Update refund error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/refunds/:id/approve — CEO / Super Admin only
 *
 * This is the point where the refund actually happens: the goods go back on
 * the shelf and the amount starts counting against the day's sales.
 */
const approveRefund = async (req, res) => {
  try {
    const refund = await Refund.findById(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund not found.' });
    if (refund.status === 'approved') {
      return res.status(400).json({ success: false, message: 'This refund was already approved.' });
    }
    if (refund.status === 'rejected') {
      return res.status(400).json({ success: false, message: 'This refund was rejected. Raise a new one instead.' });
    }

    // stock_restored guards a double approval from putting the goods back twice.
    if (!refund.stock_restored && refund.items.length > 0) {
      await restoreStock(refund.items);
      refund.stock_restored = true;
    }

    refund.status = 'approved';
    refund.approved_by = req.user._id;
    refund.approved_at = new Date();
    await refund.save();

    await Notification.create({
      user_id: refund.requested_by || null,
      type: 'info',
      title: 'Refund Approved',
      message: `Your refund of GH₵${refund.refund_amount.toFixed(2)} for ${refund.customer_name} was approved by ${req.user.username}.`,
      link: '/refunds',
    });

    const populated = await Refund.findById(refund._id)
      .populate('processed_by', 'username')
      .populate('approved_by', 'username');
    return res.status(200).json({ success: true, message: 'Refund approved. Stock has been returned.', data: populated });
  } catch (err) {
    console.error('Approve refund error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/refunds/:id/reject — CEO / Super Admin only
 * Nothing to undo: a pending refund never moved any stock or money.
 */
const rejectRefund = async (req, res) => {
  try {
    const { reason } = req.body;
    const refund = await Refund.findById(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund not found.' });
    if (refund.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This refund is already ${refund.status}.`,
      });
    }

    refund.status = 'rejected';
    refund.rejection_reason = reason?.trim() || undefined;
    refund.approved_by = req.user._id;
    refund.approved_at = new Date();
    await refund.save();

    await Notification.create({
      user_id: refund.requested_by || null,
      type: 'important',
      title: 'Refund Rejected',
      message: `Your refund of GH₵${refund.refund_amount.toFixed(2)} for ${refund.customer_name} was rejected${reason ? `: ${reason}` : '.'}`,
      link: '/refunds',
    });

    const populated = await Refund.findById(refund._id)
      .populate('processed_by', 'username')
      .populate('approved_by', 'username');
    return res.status(200).json({ success: true, message: 'Refund rejected.', data: populated });
  } catch (err) {
    console.error('Reject refund error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/refunds/:id  — CEO / Super Admin only
 * Reverses the stock restoration when deleting.
 */
const deleteRefund = async (req, res) => {
  try {
    const refund = await Refund.findById(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund not found.' });

    // Only take the stock back off the shelf if approving it put it there.
    // A pending or rejected refund never moved anything.
    if (refund.stock_restored) {
      for (const item of refund.items) {
        if (item.product_id && item.quantity > 0) {
          await Product.findByIdAndUpdate(item.product_id, { $inc: { quantity: -item.quantity } });
        }
      }
    }

    await Refund.findByIdAndDelete(req.params.id);
    return res.status(200).json({
      success: true,
      message: refund.stock_restored ? 'Refund deleted and stock reversed.' : 'Refund deleted.',
    });
  } catch (err) {
    console.error('Delete refund error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getRefunds, lookupSaleByInvoice, createRefund, approveRefund, rejectRefund, updateRefund, deleteRefund };
