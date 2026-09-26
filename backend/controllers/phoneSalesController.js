const PhoneSale = require('../models/PhoneSale');
const Debt = require('../models/Debt');
const { buildSaleItems, deductStock } = require('../utils/saleHelpers');
const { createSaleWithInvoice } = require('../utils/generateInvoice');

const gh = (n) => 'GHC' + Number(n || 0).toFixed(2);

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

    // ── Approving is when it becomes real ───────────────────────────────
    // Until now the application was paperwork. An owner agreeing to it is the
    // moment the phone leaves the shop and the money starts moving, so that is
    // where it is recorded — one decision rather than three jobs to remember.
    const { payment_method } = req.body;
    const down = Number(sale.down_payment) || 0;
    const owing = Number(sale.balance) || 0;

    // 1. The phone off the shelf, if the application named one from the
    //    catalogue. Done first: if there is none left, nothing else should
    //    happen either.
    if (sale.product_id && !sale.stock_deducted) {
      const built = await buildSaleItems([{ product_id: sale.product_id, quantity: 1 }]);
      if (built.error) {
        return res.status(400).json({ success: false, message: built.error });
      }
      await deductStock(built.items);
      sale.stock_deducted = true;
    }

    // 2. The down payment, as takings. Only the money actually handed over —
    //    the balance counts as it is paid, through the debt.
    if (down > 0) {
      try {
        const written = await createSaleWithInvoice({
          user_id: req.user._id,
          customer_name: sale.customer_name,
          customer_phone: sale.customer_phone,
          form_ref: sale.reference,
          subtotal: down,
          discount: 0,
          discount_type: 'fixed',
          total_amount: down,
          cart_total: sale.total_amount,
          debt_amount: owing,
          payment_status: owing > 0 ? 'partial' : 'paid',
          payment_method: ['cash', 'card', 'mobile_money'].includes(payment_method)
            ? payment_method : 'cash',
          items: [{
            product_id: sale.product_id || undefined,
            product_name: `${sale.phone_model} — down payment on ${sale.reference}`,
            quantity: 1,
            unit_price: down,
            cost_price: 0,
            total: down,
          }],
        });
        sale.sale_id = written._id;
        sale.invoice_no = written.invoice_no;
      } catch (saleErr) {
        console.error('Phone sale down payment failed:', saleErr.stack || saleErr.message);
      }
    }

    // 3. The balance, as a debt due on the last instalment date, so it is
    //    chased and paid off through the screen that already does that.
    if (owing > 0) {
      const due = new Date();
      if (sale.plan === 'weekly') due.setDate(due.getDate() + sale.installments * 7);
      else due.setMonth(due.getMonth() + sale.installments);

      const debt = await Debt.create({
        sale_id: sale.sale_id,
        customer_name: sale.customer_name,
        customer_phone: sale.customer_phone,
        amount_owed: owing,
        amount_paid: 0,
        due_date: due,
        created_by: req.user._id,
      });
      sale.debt_id = debt._id;
    }

    sale.status = 'approved';
    sale.reviewed_by = req.user._id;
    sale.reviewed_at = new Date();
    await sale.save();

    const parts = [];
    if (sale.stock_deducted) parts.push('the phone is off stock');
    if (sale.invoice_no) parts.push(`${gh(down)} taken (${sale.invoice_no})`);
    if (sale.debt_id) parts.push(`${gh(owing)} owed over ${sale.installments} ${sale.plan === 'weekly' ? 'weeks' : 'months'}`);

    return res.status(200).json({
      success: true,
      message: `${sale.reference} approved${parts.length ? ' — ' + parts.join(', ') : ''}.`,
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

/**
 * DELETE /api/phone-sales/:id — owners only.
 *
 * Removes the record and the customer's details with it. Kept to the two
 * people who can read those details in the first place: an application is the
 * only trace of a credit deal and of the cards taken for it, and whoever
 * submitted it should not be able to make a rejected one disappear.
 */
const deletePhoneSale = async (req, res) => {
  try {
    const sale = await PhoneSale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    const { reference, customer_name, status } = sale;
    await sale.deleteOne();

    return res.status(200).json({
      success: true,
      message: `${reference} (${customer_name}) deleted.`,
      data: { reference, status },
    });
  } catch (err) {
    console.error('Delete phone sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getPhoneSales,
  deletePhoneSale,
  getPhoneSale,
  createPhoneSale,
  approvePhoneSale,
  rejectPhoneSale,
};
