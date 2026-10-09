const { validationResult } = require('express-validator');
const CreditAgreement = require('../models/CreditAgreement');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const { generateCreditAgreement, generateExchangeNote } = require('../utils/pdfGenerator');

/**
 * GET /api/credit-agreements
 */
const getCreditAgreements = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, customer, search } = req.query;
    const filter = {};

    if (status && status !== 'all') filter.status = status;
    // The screen sends `search`; only `customer` was ever read, so the search
    // box did nothing at all. Both are accepted, and a phone number finds the
    // agreement too — that is what the shop has when a customer rings.
    const term = String(search || customer || '').trim();
    if (term) {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [{ customer_name: rx }, { customer_phone: rx }, { serial_number: rx }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [agreements, total] = await Promise.all([
      CreditAgreement.find(filter)
        .populate('created_by', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      CreditAgreement.countDocuments(filter),
    ]);

    const pagination = {
      total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)),
    };

    return res.status(200).json({
      success: true,
      // Inside `data`, because the browser's axios layer unwraps that and
      // throws away everything beside it — the page count never arrived.
      data: { agreements, pagination },
      pagination,
    });
  } catch (err) {
    console.error('Get credit agreements error:', err.stack || err.message);
    return res.status(500).json({
      success: false,
      message: `Could not load the credit agreements: ${err.message}`,
    });
  }
};

/**
 * POST /api/credit-agreements
 */
const createCreditAgreement = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const data = { ...req.body, created_by: req.user._id };

    // If photo was uploaded via multer
    if (req.file) {
      data.customer_photo = req.file.path;
    }

    const agreement = await CreditAgreement.create(data);

    await Notification.create({
      user_id: null,
      type: 'important',
      title: 'New Credit Agreement',
      message: `Credit agreement created for ${agreement.customer_name} - GH₵${agreement.total_amount.toFixed(2)}`,
      link: `/credit-agreements/${agreement._id}`,
    });

    return res.status(201).json({ success: true, message: 'Credit agreement created.', data: agreement });
  } catch (err) {
    console.error('Create credit agreement error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/credit-agreements/:id
 */
const getCreditAgreement = async (req, res) => {
  try {
    const agreement = await CreditAgreement.findById(req.params.id)
      .populate('created_by', 'username')
      .populate('payments.recorded_by', 'username');

    if (!agreement) return res.status(404).json({ success: false, message: 'Credit agreement not found.' });
    return res.status(200).json({ success: true, data: agreement });
  } catch (err) {
    console.error('Get credit agreement error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/credit-agreements/:id
 */
const updateCreditAgreement = async (req, res) => {
  try {
    const agreement = await CreditAgreement.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!agreement) return res.status(404).json({ success: false, message: 'Credit agreement not found.' });
    return res.status(200).json({ success: true, message: 'Agreement updated.', data: agreement });
  } catch (err) {
    console.error('Update credit agreement error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/credit-agreements/:id/payment
 */
const recordPayment = async (req, res) => {
  try {
    const { amount, week_number } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be positive.' });
    }

    const agreement = await CreditAgreement.findById(req.params.id);
    if (!agreement) return res.status(404).json({ success: false, message: 'Credit agreement not found.' });

    if (agreement.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Agreement is already completed.' });
    }

    const totalPaid = agreement.payments.reduce((sum, p) => sum + p.amount, 0) + Number(amount);
    const remaining = Math.max(0, agreement.remaining - totalPaid + agreement.payments.reduce((sum, p) => sum + p.amount, 0));

    agreement.payments.push({
      amount: Number(amount),
      payment_date: new Date(),
      week_number: week_number || agreement.payments.length + 1,
      recorded_by: req.user._id,
    });

    // Check if completed
    if (remaining <= 0) {
      agreement.status = 'completed';
    }

    await agreement.save();

    return res.status(200).json({
      success: true,
      message: 'Payment recorded.',
      data: { agreement, remaining },
    });
  } catch (err) {
    console.error('Credit agreement payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/credit-agreements/:id/pdf
 */
const generatePDF = async (req, res) => {
  try {
    const agreement = await CreditAgreement.findById(req.params.id)
      .populate('created_by', 'username');

    if (!agreement) return res.status(404).json({ success: false, message: 'Credit agreement not found.' });

    const settings = await Settings.findOne().lean();
    const pdfBuffer = await generateCreditAgreement(agreement.toObject(), {
      logoUrl: settings?.logo_url,
      company: {
        address: settings?.company_address,
        phone: settings?.company_phone,
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="credit-agreement-${agreement._id}.pdf"`);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('Generate credit PDF error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error generating PDF.' });
  }
};

/** EXC-YYYYMMDD-0001, from the highest issued today. */
const nextExchangeRef = async () => {
  const now = new Date();
  const part = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const todays = await CreditAgreement.find({ 'exchanges.reference': { $regex: `^EXC-${part}-` } })
    .select('exchanges.reference').lean();
  const highest = todays.reduce((max, a) => {
    for (const e of a.exchanges || []) {
      const n = parseInt(String(e.reference || '').split('-').pop(), 10);
      if (String(e.reference || '').startsWith(`EXC-${part}-`) && Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }, 0);
  return `EXC-${part}-${String(highest + 1).padStart(4, '0')}`;
};

/**
 * POST /api/credit-agreements/:id/exchange
 *
 * The customer brings back what they were given and takes something else.
 *
 * The agreement is not torn up and rewritten: the same customer, the same
 * guarantor and everything already paid all stand. Only the goods change, and
 * the amount owed moves by the difference between the two items. Doing it as
 * a fresh agreement would lose the payment history and ask the guarantor to
 * sign again for a debt they already guaranteed.
 */
const exchangeProduct = async (req, res) => {
  try {
    const agreement = await CreditAgreement.findById(req.params.id);
    if (!agreement) {
      return res.status(404).json({ success: false, message: 'Credit agreement not found.' });
    }
    if (agreement.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This agreement is paid off. Handle a swap on a settled account as a return, not an exchange.',
      });
    }

    const {
      returned_description, returned_serial, returned_condition, returned_value,
      replacement_type, replacement_description, replacement_serial, replacement_value,
      reason,
    } = req.body;

    const backDesc = String(returned_description || agreement.product_description || agreement.product_type || '').trim();
    const newDesc = String(replacement_description || '').trim();
    if (!backDesc) {
      return res.status(400).json({ success: false, message: 'What is the customer bringing back?' });
    }
    if (!newDesc) {
      return res.status(400).json({ success: false, message: 'What are they taking in its place?' });
    }

    // The item coming back is credited at what it was charged at, unless the
    // shop says otherwise — a used item is rarely worth the full price, and
    // that is a judgement for the person at the counter, not a default.
    const backValue = returned_value === undefined || returned_value === ''
      ? Number(agreement.total_amount) || 0
      : Number(returned_value);
    const newValue = Number(replacement_value);

    if (!Number.isFinite(backValue) || backValue < 0) {
      return res.status(400).json({ success: false, message: 'What is the returned item being credited at?' });
    }
    if (!Number.isFinite(newValue) || newValue <= 0) {
      return res.status(400).json({ success: false, message: 'What does the new item cost?' });
    }

    const totalBefore = Number(agreement.total_amount) || 0;
    const paid = agreement.paidToDate();
    const balanceBefore = agreement.outstanding();
    const totalAfter = Number((totalBefore - backValue + newValue).toFixed(2));

    if (totalAfter < 0) {
      return res.status(400).json({
        success: false,
        message: 'That credits the returned item for more than the whole agreement. Check the figures.',
      });
    }

    // A cheaper replacement can leave the customer having paid more than the
    // new price. That is money owed back to them, and it must be written down
    // as such rather than disappearing into a balance that stops at zero.
    const creditDue = Math.max(0, Number((paid - totalAfter).toFixed(2)));
    const balanceAfter = Math.max(0, Number((totalAfter - paid).toFixed(2)));

    const entry = {
      reference: await nextExchangeRef(),
      exchanged_on: new Date(),
      returned_description: backDesc,
      returned_serial: returned_serial || agreement.serial_number || '',
      returned_value: Number(backValue.toFixed(2)),
      returned_condition: returned_condition || '',
      replacement_type: replacement_type || agreement.product_type || '',
      replacement_description: newDesc,
      replacement_serial: replacement_serial || '',
      replacement_value: Number(newValue.toFixed(2)),
      reason: reason || '',
      total_before: totalBefore,
      total_after: totalAfter,
      difference: Number((totalAfter - totalBefore).toFixed(2)),
      paid_to_date: paid,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      credit_due: creditDue,
      done_by: req.user._id,
    };

    agreement.exchanges.push(entry);
    // The agreement now describes what the customer actually holds.
    if (entry.replacement_type) agreement.product_type = entry.replacement_type;
    agreement.product_description = newDesc;
    agreement.serial_number = entry.replacement_serial;
    agreement.total_amount = totalAfter;

    // Paid off by the swap. Nothing more is owed, so the account closes.
    if (balanceAfter <= 0) agreement.status = 'completed';

    await agreement.save();

    const saved = agreement.exchanges[agreement.exchanges.length - 1];

    await Notification.create({
      user_id: null,
      type: 'important',
      title: 'Product exchanged on a credit agreement',
      message: `${agreement.customer_name}: ${backDesc} swapped for ${newDesc}. `
        + `Balance ${balanceBefore.toFixed(2)} to ${balanceAfter.toFixed(2)}.`,
      link: '/credit-agreements',
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: creditDue > 0
        ? `Swapped. The customer has overpaid by GH₵${creditDue.toFixed(2)} — that is owed back to them.`
        : `Swapped. They now owe GH₵${balanceAfter.toFixed(2)}.`,
      data: { agreement, exchange: saved },
    });
  } catch (err) {
    console.error('Credit exchange error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not record the swap: ${err.message}` });
  }
};

/**
 * GET /api/credit-agreements/:id/exchange/:exchangeId/pdf
 *
 * The paper the customer walks out with. Without it, the only record that the
 * item they are holding is not the one named on their agreement lives on our
 * server.
 */
const exchangeNotePDF = async (req, res) => {
  try {
    const agreement = await CreditAgreement.findById(req.params.id).lean();
    if (!agreement) return res.status(404).json({ success: false, message: 'Credit agreement not found.' });

    const exchange = (agreement.exchanges || []).find(
      (e) => String(e._id) === String(req.params.exchangeId)
    );
    if (!exchange) return res.status(404).json({ success: false, message: 'That exchange is not on this agreement.' });

    const settings = await Settings.findOne().lean();
    const pdf = await generateExchangeNote(agreement, exchange, {
      logoUrl: settings?.logo_url,
      company: {
        name: settings?.company_name,
        address: settings?.company_address,
        phone: settings?.company_phone,
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="exchange-${exchange.reference || exchange._id}.pdf"`);
    return res.end(pdf);
  } catch (err) {
    console.error('Exchange note PDF error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not make the note: ${err.message}` });
  }
};

module.exports = {
  getCreditAgreements, createCreditAgreement, getCreditAgreement,
  updateCreditAgreement, recordPayment, generatePDF,
  exchangeProduct, exchangeNotePDF,
};
