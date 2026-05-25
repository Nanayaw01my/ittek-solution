const Debt = require('../models/Debt');
const Sale = require('../models/Sale');
const Notification = require('../models/Notification');
const { queueEmail, templates } = require('../utils/email');
const Settings = require('../models/Settings');

/**
 * GET /api/debts
 */
const getDebts = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, customer } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (customer) filter.customer_name = { $regex: customer, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [debts, total] = await Promise.all([
      Debt.find(filter)
        .populate('sale_id', 'invoice_no sale_date')
        .populate('created_by', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Debt.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: debts,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get debts error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/debts/summary
 */
const getDebtSummary = async (req, res) => {
  try {
    const [active, overdue, paid] = await Promise.all([
      Debt.aggregate([{ $match: { status: 'active' } }, { $group: { _id: null, total: { $sum: { $subtract: ['$amount_owed', '$amount_paid'] } }, count: { $sum: 1 } } }]),
      Debt.aggregate([{ $match: { status: 'overdue' } }, { $group: { _id: null, total: { $sum: { $subtract: ['$amount_owed', '$amount_paid'] } }, count: { $sum: 1 } } }]),
      Debt.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount_paid' }, count: { $sum: 1 } } }]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        active: { total: active[0]?.total || 0, count: active[0]?.count || 0 },
        overdue: { total: overdue[0]?.total || 0, count: overdue[0]?.count || 0 },
        paid: { total: paid[0]?.total || 0, count: paid[0]?.count || 0 },
      },
    });
  } catch (err) {
    console.error('Debt summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/debts/:id
 */
const getDebt = async (req, res) => {
  try {
    const debt = await Debt.findById(req.params.id)
      .populate('sale_id', 'invoice_no sale_date total_amount items')
      .populate('created_by', 'username')
      .populate('payments.recorded_by', 'username');

    if (!debt) return res.status(404).json({ success: false, message: 'Debt not found.' });
    return res.status(200).json({ success: true, data: debt });
  } catch (err) {
    console.error('Get debt error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/debts/:id/payment
 */
const recordPayment = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be positive.' });
    }

    const debt = await Debt.findById(req.params.id);
    if (!debt) return res.status(404).json({ success: false, message: 'Debt not found.' });

    if (debt.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Debt is already fully paid.' });
    }

    const remaining = debt.amount_owed - debt.amount_paid;
    const paymentAmount = Math.min(Number(amount), remaining);

    const receipt_no = `RCPT-${Date.now()}`;
    debt.payments.push({
      amount: paymentAmount,
      payment_date: new Date(),
      receipt_no,
      recorded_by: req.user._id,
    });
    debt.amount_paid += paymentAmount;
    await debt.save(); // pre-save hook updates status

    // Create a debt_payment sale record
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const debtInvoice = `DEBT-${datePart}-${String(debt._id).slice(-4).toUpperCase()}`;

    await Sale.create({
      invoice_no: debtInvoice,
      user_id: req.user._id,
      customer_name: debt.customer_name,
      customer_phone: debt.customer_phone,
      subtotal: paymentAmount,
      discount: 0,
      total_amount: paymentAmount,
      cart_total: paymentAmount,
      debt_amount: 0,
      payment_status: 'debt_payment',
      payment_method: req.body.payment_method || 'cash',
      items: [],
    });

    // Notification
    await Notification.create({
      user_id: null,
      type: 'info',
      title: 'Debt Payment',
      message: `${debt.customer_name} paid GH₵${paymentAmount.toFixed(2)}. Remaining: GH₵${Math.max(0, debt.amount_owed - debt.amount_paid).toFixed(2)}`,
      link: `/debts/${debt._id}`,
    });

    // Queue email
    const settings = await Settings.findOne();
    if (settings?.notification_settings?.email_notifications) {
      const recipientEmail = settings.company_email || process.env.EMAIL_USER;
      if (recipientEmail) {
        await queueEmail({
          to: recipientEmail,
          subject: `Debt Payment - ${debt.customer_name}`,
          html: templates.debtPayment({
            customer_name: debt.customer_name,
            amount_paid: paymentAmount,
            remaining: Math.max(0, debt.amount_owed - debt.amount_paid),
          }),
          priority: 'normal',
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Payment recorded successfully.',
      data: { debt, receipt_no, payment_amount: paymentAmount },
    });
  } catch (err) {
    console.error('Record debt payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getDebts, getDebt, getDebtSummary, recordPayment };
