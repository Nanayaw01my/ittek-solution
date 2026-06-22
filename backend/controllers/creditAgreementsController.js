const { validationResult } = require('express-validator');
const CreditAgreement = require('../models/CreditAgreement');
const Debt = require('../models/Debt');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const { generateCreditAgreement } = require('../utils/pdfGenerator');

/**
 * GET /api/credit-agreements
 */
const getCreditAgreements = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, customer } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (customer) filter.customer_name = { $regex: customer, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [agreements, total] = await Promise.all([
      CreditAgreement.find(filter)
        .populate('created_by', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      CreditAgreement.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: agreements,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get credit agreements error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
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

    // Auto-create a linked Debt record so it appears on the Debts page
    const amountOwed = agreement.remaining > 0 ? agreement.remaining : agreement.total_amount - (agreement.down_payment || 0);
    await Debt.create({
      credit_agreement_id: agreement._id,
      customer_name: agreement.customer_name,
      customer_phone: agreement.customer_phone,
      amount_owed: amountOwed,
      amount_paid: 0,
      due_date: agreement.end_date || (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d; })(),
      created_by: req.user._id,
    });

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

    // Keep the linked Debt record in sync
    const linkedDebt = await Debt.findOne({ credit_agreement_id: agreement._id });
    if (linkedDebt && linkedDebt.status !== 'paid') {
      const receipt_no = `CA-RCPT-${Date.now()}`;
      linkedDebt.payments.push({
        amount: Number(amount),
        payment_date: new Date(),
        receipt_no,
        recorded_by: req.user._id,
      });
      linkedDebt.amount_paid += Number(amount);
      await linkedDebt.save(); // pre-save hook updates status automatically
    }

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
    const pdfBuffer = await generateCreditAgreement(agreement.toObject(), { logoUrl: settings?.logo_url });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="credit-agreement-${agreement._id}.pdf"`);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('Generate credit PDF error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error generating PDF.' });
  }
};

module.exports = {
  getCreditAgreements, createCreditAgreement, getCreditAgreement,
  updateCreditAgreement, recordPayment, generatePDF,
};
