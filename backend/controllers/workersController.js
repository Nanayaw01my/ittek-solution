const { validationResult } = require('express-validator');
const WorkerPayment = require('../models/WorkerPayment');
const Expense = require('../models/Expense');

/**
 * GET /api/workers
 */
const getWorkerPayments = async (req, res) => {
  try {
    const { page = 1, limit = 50, type } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Salaries and commissions are listed apart when asked for, because they
    // are read for different reasons: one is the wage bill, the other is what
    // the selling cost.
    const filter = {};
    if (type === 'salary' || type === 'commission') filter.payment_type = type;

    const [payments, total] = await Promise.all([
      WorkerPayment.find(filter)
        .populate('created_by', 'username')
        .sort({ payment_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      WorkerPayment.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: payments,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get worker payments error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/workers
 */
const createWorkerPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const {
      worker_name, worker_phone, payment_type, commission_rate, amount_paid,
      payment_method, reference, payment_date, period_start, period_end, notes,
    } = req.body;

    const type = payment_type === 'commission' ? 'commission' : 'salary';
    const method = ['cash', 'mobile_money', 'bank_transfer'].includes(payment_method)
      ? payment_method : 'cash';
    const when = payment_date || new Date();

    const payment = await WorkerPayment.create({
      worker_name,
      worker_phone,
      payment_type: type,
      // A rate only means anything on a commission.
      commission_rate: type === 'commission' ? commission_rate : undefined,
      amount_paid,
      payment_method: method,
      reference,
      payment_date: when,
      period_start,
      period_end,
      notes,
      created_by: req.user._id,
    });

    // The money has gone out, so it is an expense too — filed under what it
    // actually was, so the wage bill and the commissions do not read as one
    // number in the accounts.
    await Expense.create({
      user_id: req.user._id,
      category: type === 'commission' ? 'Commission' : 'Salaries',
      amount: amount_paid,
      description: `${type === 'commission' ? 'Commission' : 'Salary'}: ${worker_name}`
        + `${notes ? ' - ' + notes : ''}`,
      expense_date: when,
    });

    return res.status(201).json({
      success: true,
      message: `${type === 'commission' ? 'Commission' : 'Salary'} of GHC ${Number(amount_paid).toFixed(2)} paid to ${worker_name}.`,
      data: payment,
    });
  } catch (err) {
    console.error('Create worker payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/workers/summary
 */
const getWorkerSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};

    if (startDate || endDate) {
      match.payment_date = {};
      if (startDate) match.payment_date.$gte = new Date(startDate);
      if (endDate) match.payment_date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const summary = await WorkerPayment.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$worker_name',
          total_paid: { $sum: '$amount_paid' },
          payment_count: { $sum: 1 },
          avg_commission: { $avg: '$commission_rate' },
          salary_total: {
            $sum: { $cond: [{ $eq: ['$payment_type', 'commission'] }, 0, '$amount_paid'] },
          },
          commission_total: {
            $sum: { $cond: [{ $eq: ['$payment_type', 'commission'] }, '$amount_paid', 0] },
          },
        },
      },
      { $sort: { total_paid: -1 } },
    ]);

    const grand_total = summary.reduce((sum, s) => sum + s.total_paid, 0);
    const salary_total = summary.reduce((sum, s) => sum + (s.salary_total || 0), 0);
    const commission_total = summary.reduce((sum, s) => sum + (s.commission_total || 0), 0);
    return res.status(200).json({
      success: true,
      data: { by_worker: summary, grand_total, salary_total, commission_total },
    });
  } catch (err) {
    console.error('Worker summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/workers/:id
 */
const deleteWorkerPayment = async (req, res) => {
  try {
    const payment = await WorkerPayment.findByIdAndDelete(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }
    return res.status(200).json({ success: true, message: 'Payment record deleted.' });
  } catch (err) {
    console.error('Delete worker payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getWorkerPayments, createWorkerPayment, getWorkerSummary, deleteWorkerPayment };
