const Debt = require('../models/Debt');
const Sale = require('../models/Sale');
const Notification = require('../models/Notification');
const { queueEmail, templates } = require('../utils/email');
const { sendSMS } = require('../utils/sms');
const Settings = require('../models/Settings');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/debts
 */
const getDebts = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, customer } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (customer) filter.customer_name = { $regex: escapeRegex(String(customer)), $options: 'i' };

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

/**
 * POST /api/debts/:id/remind  — send SMS reminder to a single debtor
 */
const sendReminder = async (req, res) => {
  try {
    const debt = await Debt.findById(req.params.id);
    if (!debt) return res.status(404).json({ success: false, message: 'Debt not found.' });
    if (debt.status === 'paid') return res.status(400).json({ success: false, message: 'Debt is already paid.' });
    if (!debt.customer_phone) return res.status(400).json({ success: false, message: 'No phone number on record for this customer.' });

    const remaining = (debt.amount_owed - debt.amount_paid).toFixed(2);
    const dueDate = debt.due_date ? new Date(debt.due_date).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

    const settings = await Settings.findOne();
    const company = settings?.company_name || 'DAN & DOR SOLAR COMPANY LIMITED';
    const phone   = settings?.company_phone || '+233 598565277';

    const message =
      `Dear ${debt.customer_name}, you have an outstanding balance of GHC ${remaining} with ${company}. ` +
      `Due: ${dueDate}. Please make payment or contact us on ${phone}. Thank you.`;

    const result = await sendSMS(debt.customer_phone, message);

    if (!result.success) {
      return res.status(502).json({ success: false, message: `SMS failed: ${result.message}` });
    }

    await Notification.create({
      user_id: req.user._id,
      type: 'info',
      title: 'SMS Reminder Sent',
      message: `Reminder sent to ${debt.customer_name} (${debt.customer_phone})`,
      link: `/debts`,
    });

    return res.status(200).json({ success: true, message: `SMS reminder sent to ${debt.customer_phone}` });
  } catch (err) {
    console.error('Send reminder error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/debts/remind-all  — send SMS reminders to all active + overdue debtors with phone numbers
 */
const sendAllReminders = async (req, res) => {
  try {
    const debts = await Debt.find({ status: { $in: ['active', 'overdue'] }, customer_phone: { $exists: true, $ne: '' } });

    if (debts.length === 0) {
      return res.status(200).json({ success: true, message: 'No debtors with phone numbers found.', data: { sent: 0, failed: 0 } });
    }

    const settings = await Settings.findOne();
    const company = settings?.company_name || 'DAN & DOR SOLAR COMPANY LIMITED';
    const phone   = settings?.company_phone || '+233 598565277';

    let sent = 0, failed = 0, skipped = 0;

    for (const debt of debts) {
      if (!debt.customer_phone) { skipped++; continue; }

      const remaining = (debt.amount_owed - debt.amount_paid).toFixed(2);
      const dueDate = debt.due_date ? new Date(debt.due_date).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

      const message =
        `Dear ${debt.customer_name}, you have an outstanding balance of GHC ${remaining} with ${company}. ` +
        `Due: ${dueDate}. Please make payment or contact us on ${phone}. Thank you.`;

      const result = await sendSMS(debt.customer_phone, message);
      result.success ? sent++ : failed++;
    }

    await Notification.create({
      user_id: req.user._id,
      type: 'info',
      title: 'Bulk SMS Reminders Sent',
      message: `Sent ${sent} reminder${sent !== 1 ? 's' : ''}, ${failed} failed, ${skipped} skipped (no phone)`,
      link: '/debts',
    });

    return res.status(200).json({
      success: true,
      message: `Reminders sent: ${sent} succeeded, ${failed} failed, ${skipped} skipped.`,
      data: { sent, failed, skipped },
    });
  } catch (err) {
    console.error('Send all reminders error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/debts/:id
 */
const deleteDebt = async (req, res) => {
  try {
    const debt = await Debt.findById(req.params.id);
    if (!debt) return res.status(404).json({ success: false, message: 'Debt record not found.' });

    await Debt.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Debt record deleted.' });
  } catch (err) {
    console.error('Delete debt error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getDebts, getDebt, getDebtSummary, recordPayment, sendReminder, sendAllReminders, deleteDebt };
