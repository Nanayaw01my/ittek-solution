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
        // Named on a reprinted payment receipt, so it says who took the money.
        .populate('payments.recorded_by', 'username')
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

    // Everything the printed receipt needs, so the counter does not have to
    // re-fetch the debt to put a slip of paper in the customer's hand.
    return res.status(200).json({
      success: true,
      message: 'Payment recorded successfully.',
      data: {
        debt,
        receipt_no,
        payment_amount: paymentAmount,
        payment_date: now,
        payment_method: req.body.payment_method || 'cash',
        amount_owed: debt.amount_owed,
        amount_paid: debt.amount_paid,
        remaining: Math.max(0, debt.amount_owed - debt.amount_paid),
        customer_name: debt.customer_name,
        customer_phone: debt.customer_phone,
        received_by: req.user.username,
      },
    });
  } catch (err) {
    console.error('Record debt payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/debts/:id
 *
 * Removes a debt from the system entirely. CEO / Super Admin only: a debt is
 * money a customer owes the shop, and deleting one writes that money off with
 * nothing left to show it existed.
 *
 * The sale that created the debt is deliberately left alone. Erasing it too
 * would rewrite the day's takings for a sale that really happened; the debt
 * record is the claim on the customer, not the sale itself.
 */
const deleteDebt = async (req, res) => {
  try {
    const debt = await Debt.findById(req.params.id);
    if (!debt) return res.status(404).json({ success: false, message: 'Debt not found.' });

    const outstanding = Math.max(0, (debt.amount_owed || 0) - (debt.amount_paid || 0));
    await Debt.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: outstanding > 0
        ? `Debt deleted. GH₵${outstanding.toFixed(2)} owed by ${debt.customer_name} is no longer tracked.`
        : 'Debt deleted.',
    });
  } catch (err) {
    console.error('Delete debt error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/debts
 *
 * A debt written down by hand — goods that went out on trust without passing
 * through the till, or an amount agreed after the fact.
 *
 * No money is recorded here, deliberately. Nothing has been paid: this is the
 * promise, not the payment. Each instalment writes its own sale as it comes
 * in, and booking anything now would count the same cedi twice.
 */
const createDebt = async (req, res) => {
  try {
    const { customer_name, customer_phone, amount_owed, due_date, notes, amount_paid } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ success: false, message: "Enter the customer's name." });
    }

    const owed = Number(amount_owed);
    if (!Number.isFinite(owed) || owed <= 0) {
      return res.status(400).json({ success: false, message: 'Enter how much is owed.' });
    }

    // Somebody who has already paid part of it can be written down as they
    // stand, rather than as a debt that is immediately wrong.
    const alreadyPaid = Number(amount_paid) || 0;
    if (alreadyPaid < 0 || alreadyPaid > owed) {
      return res.status(400).json({
        success: false,
        message: `What was paid cannot be more than the ${owed.toFixed(2)} owed.`,
      });
    }

    let when;
    if (due_date) {
      when = new Date(due_date);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ success: false, message: 'Bad due date.' });
      }
    }

    const debt = await Debt.create({
      customer_name: String(customer_name).trim(),
      customer_phone: customer_phone ? String(customer_phone).trim() : undefined,
      amount_owed: Number(owed.toFixed(2)),
      amount_paid: Number(alreadyPaid.toFixed(2)),
      due_date: when,
      notes,
      created_by: req.user._id,
      // Deliberately no sale_id: nothing was rung up, and pointing at a sale
      // that does not exist would break every screen that follows the link.
    });

    return res.status(201).json({
      success: true,
      message: `${debt.customer_name} owes GHC${(owed - alreadyPaid).toFixed(2)}.`,
      data: debt,
    });
  } catch (err) {
    console.error('Create debt error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not record it: ${err.message}` });
  }
};

module.exports = { createDebt, getDebts, getDebt, getDebtSummary, recordPayment, deleteDebt };
