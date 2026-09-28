const ReceiptApproval = require('../models/ReceiptApproval');
const { notifyOwners, notifyUser } = require('../utils/notify');
const { ROLE_LEVELS } = require('../config/pageAccess');

const gh = (n) => 'GHC' + Number(n || 0).toFixed(2);

/** CEO and Super Admin print their own receipts without asking themselves. */
const isOwner = (user) => (ROLE_LEVELS[user?.role] || 0) >= 3;

const todayPart = () => {
  const now = new Date();
  return `${now.getFullYear()}`
    + `${String(now.getMonth() + 1).padStart(2, '0')}`
    + `${String(now.getDate()).padStart(2, '0')}`;
};

const nextReference = async (datePart) => {
  const todays = await ReceiptApproval.find({ reference: { $regex: `^RA-${datePart}-` } })
    .select('reference').sort({ reference: -1 }).limit(50).lean();
  const highest = todays.reduce((max, r) => {
    const n = parseInt(String(r.reference).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `RA-${datePart}-${String(highest + 1).padStart(4, '0')}`;
};

/** GET /api/receipt-approvals */
const getApprovals = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    // Somebody else's receipt is not theirs to read.
    if (!isOwner(req.user)) filter.requested_by = req.user._id;

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total, pending] = await Promise.all([
      ReceiptApproval.find(filter)
        .populate('requested_by', 'username')
        .populate('reviewed_by', 'username')
        .sort({ requested_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ReceiptApproval.countDocuments(filter),
      ReceiptApproval.countDocuments({ ...filter, status: 'pending' }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        approvals: records,
        summary: { pending, total },
        can_approve: isOwner(req.user),
        pagination: {
          total, page: Number(page), limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
    });
  } catch (err) {
    console.error('Get receipt approvals error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/receipt-approvals
 * The sheet, sent up for the owner to agree to. Nothing is printed, no money
 * moves and no stock moves until it comes back approved.
 */
const createApproval = async (req, res) => {
  try {
    const payload = req.body?.payload;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, message: 'Nothing to approve.' });
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    const filled = items.filter((i) => i && String(i.name || '').trim());
    const total = Number(payload.grandTotal) || 0;
    if (filled.length === 0 && total <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Add the items or the amount before sending it up.',
      });
    }

    const paid = Number(payload.amountPaid) || 0;
    const owing = Number.isFinite(Number(payload.balanceDue))
      ? Number(payload.balanceDue) : Math.max(0, total - paid);

    const datePart = todayPart();
    let record = null;
    for (let attempt = 0; attempt < 8 && !record; attempt++) {
      const reference = await nextReference(datePart);
      try {
        record = await ReceiptApproval.create({
          reference,
          payload,
          customer_name: payload.customer?.name,
          customer_phone: payload.customer?.phone,
          item_count: filled.length,
          grand_total: total,
          amount_paid: paid,
          balance_due: owing,
          takes_stock: !!payload.deductStock,
          status: 'pending',
          requested_by: req.user._id,
          requested_at: new Date(),
        });
      } catch (err) {
        const duplicate = err?.code === 11000
          && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('reference');
        if (!duplicate || attempt === 7) throw err;
      }
    }

    await notifyOwners({
      type: 'important',
      title: 'Receipt needs your approval',
      message: `${req.user.username} wants to print a ${gh(total)} receipt`
        + (record.customer_name ? ` for ${record.customer_name}` : '')
        + (owing > 0 ? ` — ${gh(owing)} would go to Debts.` : '.'),
      link: '/receipt-approvals',
      tag: 'receipt-approval',
    });

    return res.status(201).json({
      success: true,
      message: `${record.reference} sent to the CEO for approval.`,
      data: record,
    });
  } catch (err) {
    console.error('Create receipt approval error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not send it: ${err.message}` });
  }
};

/** PUT /api/receipt-approvals/:id/approve — owners only. */
const approve = async (req, res) => {
  try {
    const record = await ReceiptApproval.findById(req.params.id).populate('requested_by', 'username');
    if (!record) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (record.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This one was already ${record.status}.`,
      });
    }

    record.status = 'approved';
    record.reviewed_by = req.user._id;
    record.reviewed_at = new Date();
    await record.save();

    await notifyUser(record.requested_by?._id || record.requested_by, {
      type: 'important',
      title: 'Receipt approved',
      message: `${record.reference} was approved — you can print it now.`,
      link: '/packages-receipt',
      tag: 'receipt-approval',
    });

    return res.status(200).json({
      success: true,
      message: `${record.reference} approved.`,
      data: record,
    });
  } catch (err) {
    console.error('Approve receipt error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** PUT /api/receipt-approvals/:id/reject — owners only. */
const reject = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const record = await ReceiptApproval.findById(req.params.id).populate('requested_by', 'username');
    if (!record) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (record.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This one was already ${record.status}.`,
      });
    }

    record.status = 'rejected';
    record.rejection_reason = reason;
    record.reviewed_by = req.user._id;
    record.reviewed_at = new Date();
    await record.save();

    await notifyUser(record.requested_by?._id || record.requested_by, {
      type: 'important',
      title: 'Receipt turned down',
      message: `${record.reference} was not approved`
        + (reason ? `: ${reason}` : '.'),
      link: '/packages-receipt',
      tag: 'receipt-approval',
    });

    return res.status(200).json({
      success: true,
      message: `${record.reference} rejected.`,
      data: record,
    });
  } catch (err) {
    console.error('Reject receipt error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** DELETE /api/receipt-approvals/:id — the requester withdrawing, or an owner tidying. */
const remove = async (req, res) => {
  try {
    const record = await ReceiptApproval.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (!isOwner(req.user) && String(record.requested_by) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }
    if (record.status === 'used') {
      return res.status(400).json({
        success: false,
        message: `${record.reference} was printed as ${record.invoice_no} — deleting it would hide the sale.`,
      });
    }
    const { reference } = record;
    await record.deleteOne();
    return res.status(200).json({ success: true, message: `${reference} deleted.`, data: { reference } });
  } catch (err) {
    console.error('Delete receipt approval error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getApprovals, createApproval, approve, reject, remove, isOwner };
