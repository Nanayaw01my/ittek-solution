const PhoneSale = require('../models/PhoneSale');

/** Only these two ever see a customer's address, card number or photographs. */
const isOwner = (user) => ['CEO', 'Super Admin'].includes(user.role);

const todayPart = () => {
  const now = new Date();
  return `${now.getFullYear()}`
    + `${String(now.getMonth() + 1).padStart(2, '0')}`
    + `${String(now.getDate()).padStart(2, '0')}`;
};

/** Highest issued today + 1, for the same reason invoice numbers work that way. */
const nextReference = async (datePart) => {
  const todays = await PhoneSale.find({ reference: { $regex: `^PH-${datePart}-` } })
    .select('reference')
    .sort({ reference: -1 })
    .limit(50)
    .lean();
  const highest = todays.reduce((max, p) => {
    const n = parseInt(String(p.reference).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `PH-${datePart}-${String(highest + 1).padStart(4, '0')}`;
};

/**
 * GET /api/phone-sales
 *
 * Owners see every application in full. Everyone else sees the ones they
 * submitted themselves, stripped of the customer's details — they took those
 * details down, they do not get to browse them afterwards.
 */
const getPhoneSales = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const owner = isOwner(req.user);

    const filter = {};
    if (!owner) filter.submitted_by = req.user._id;
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [found, total] = await Promise.all([
      PhoneSale.find(filter)
        .populate('submitted_by', 'username')
        .populate('reviewed_by', 'username')
        .sort({ submitted_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      PhoneSale.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        sales: found.map((s) => (owner ? s.toObject({ virtuals: true }) : s.withoutCustomerInfo())),
        canViewCustomers: owner,
        canApprove: owner,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
    });
  } catch (err) {
    console.error('Get phone sales error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/phone-sales/:id */
const getPhoneSale = async (req, res) => {
  try {
    const sale = await PhoneSale.findById(req.params.id)
      .populate('submitted_by', 'username')
      .populate('reviewed_by', 'username');
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    const owner = isOwner(req.user);
    // Someone else's application is not theirs to read at all — reported as
    // missing so guessing ids reveals nothing.
    if (!owner && String(sale.submitted_by?._id || sale.submitted_by) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    return res.status(200).json({
      success: true,
      data: owner ? sale.toObject({ virtuals: true }) : sale.withoutCustomerInfo(),
    });
  } catch (err) {
    console.error('Get phone sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/phone-sales
 * Open to anyone who can sign in — including a field agent standing in front
 * of the customer. It sells nothing on its own: an owner has to approve it.
 */
const createPhoneSale = async (req, res) => {
  try {
    const {
      customer_name, customer_phone, customer_address, customer_occupation, customer_id,
      guarantor_name, guarantor_phone, guarantor_address, guarantor_relationship, guarantor_id,
      product_id, phone_model, imei,
      total_amount, down_payment, plan, installments, notes,
    } = req.body;

    const required = [
      [customer_name, "the customer's name"],
      [customer_phone, "the customer's phone number"],
      [guarantor_name, "the guarantor's name"],
      [guarantor_phone, "the guarantor's phone number"],
      [phone_model, 'which phone'],
    ];
    for (const [value, label] of required) {
      if (!value || !String(value).trim()) {
        return res.status(400).json({ success: false, message: `Enter ${label}.` });
      }
    }

    const total = Number(total_amount);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ success: false, message: 'Enter the total price.' });
    }
    const down = Math.min(Math.max(Number(down_payment) || 0, 0), total);

    // Both Ghana cards are the whole point of the paperwork. Taking the
    // application without them leaves the shop with nothing to chase.
    if (!customer_id?.ghana_card_front_url) {
      return res.status(400).json({
        success: false,
        message: "Add a photo of the customer's Ghana card.",
      });
    }
    if (!guarantor_id?.ghana_card_front_url) {
      return res.status(400).json({
        success: false,
        message: "Add a photo of the guarantor's Ghana card.",
      });
    }

    const datePart = todayPart();
    let sale = null;
    for (let attempt = 0; attempt < 8 && !sale; attempt++) {
      const reference = await nextReference(datePart);
      try {
        sale = await PhoneSale.create({
          reference,
          customer_name, customer_phone, customer_address, customer_occupation,
          customer_id,
          guarantor_name, guarantor_phone, guarantor_address, guarantor_relationship,
          guarantor_id,
          product_id: product_id || undefined,
          phone_model, imei,
          total_amount: total,
          down_payment: down,
          plan: plan === 'weekly' ? 'weekly' : 'monthly',
          installments: Math.max(1, Number(installments) || (plan === 'weekly' ? 12 : 3)),
          status: 'pending',
          submitted_by: req.user._id,
          submitted_at: new Date(),
          notes,
        });
      } catch (err) {
        const duplicate = err?.code === 11000
          && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('reference');
        if (!duplicate || attempt === 7) throw err;
      }
    }

    return res.status(201).json({
      success: true,
      message: `Application ${sale.reference} sent for approval.`,
      data: isOwner(req.user) ? sale : sale.withoutCustomerInfo(),
    });
  } catch (err) {
    console.error('Create phone sale error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not submit: ${err.message}` });
  }
};

/** PUT /api/phone-sales/:id/approve — owners only. */
const approvePhoneSale = async (req, res) => {
  try {
    const sale = await PhoneSale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    if (sale.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This application was already ${sale.status}.`,
      });
    }

    sale.status = 'approved';
    sale.reviewed_by = req.user._id;
    sale.reviewed_at = new Date();
    await sale.save();

    return res.status(200).json({
      success: true,
      message: `${sale.reference} approved. The phone can be handed over.`,
      data: sale,
    });
  } catch (err) {
    console.error('Approve phone sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** PUT /api/phone-sales/:id/reject — owners only. */
const rejectPhoneSale = async (req, res) => {
  try {
    const { reason } = req.body;
    const sale = await PhoneSale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    if (sale.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This application was already ${sale.status}.`,
      });
    }

    sale.status = 'rejected';
    sale.rejection_reason = reason;
    sale.reviewed_by = req.user._id;
    sale.reviewed_at = new Date();
    await sale.save();

    return res.status(200).json({ success: true, message: `${sale.reference} rejected.`, data: sale });
  } catch (err) {
    console.error('Reject phone sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getPhoneSales,
  getPhoneSale,
  createPhoneSale,
  approvePhoneSale,
  rejectPhoneSale,
};
