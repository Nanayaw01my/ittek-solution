const { validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const { ROLE_LEVELS, isOwner } = require('../middleware/rbac');
const { notifyOwners, notifyUser } = require('../utils/notify');

/**
 * Whose expenses a user may see.
 *
 * Everyone below CEO sees only what they entered themselves. Spending is
 * personal accountability — a Manager reading the whole shop's petty cash is
 * the owners' view, not a supervisor's — and it was previously scoped for
 * Sales alone, so a Manager saw everybody's.
 */
const ownExpensesOnly = (user) => (ROLE_LEVELS[user?.role] || 0) < 3;

/**
 * POST /api/expenses
 */
const createExpense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    // An owner recording a spend is the person who would approve it, so it
    // is approved as it is written. Everybody else's waits.
    const mine = isOwner(req.user.role);
    const expense = await Expense.create({
      ...req.body,
      user_id: req.user._id,
      status: mine ? 'approved' : 'pending',
      approved_by: mine ? req.user._id : undefined,
      approved_at: mine ? new Date() : undefined,
    });

    if (!mine) {
      await notifyOwners({
        type: 'important',
        title: 'An expense needs approving',
        message: `${req.user.username} recorded GH¢${Number(expense.amount).toFixed(2)} for ${expense.category}`
          + `${expense.description ? ` — ${expense.description}` : ''}.`,
        link: '/expenses',
        tag: 'expense-approval',
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: mine
        ? 'Expense recorded.'
        : 'Sent to the CEO. It does not count against the books until approved.',
      data: expense,
    });
  } catch (err) {
    console.error('Create expense error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/expenses/:id/approve — an owner lets it count.
 */
const approveExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).populate('user_id', 'username');
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    if (expense.status === 'approved') {
      return res.status(400).json({ success: false, message: 'That one is already approved.' });
    }

    expense.status = 'approved';
    expense.approved_by = req.user._id;
    expense.approved_at = new Date();
    expense.rejection_reason = undefined;
    await expense.save();

    await notifyUser(expense.user_id?._id || expense.user_id, {
      type: 'info',
      title: 'Your expense was approved',
      message: `GH¢${Number(expense.amount).toFixed(2)} for ${expense.category}.`,
      link: '/expenses',
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `GH¢${Number(expense.amount).toFixed(2)} approved — it now counts against the books.`,
      data: expense,
    });
  } catch (err) {
    console.error('Approve expense error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/expenses/:id/reject — turned down, with a reason.
 *
 * Rejected rather than deleted: the record of somebody having asked, and of
 * it having been refused, is the point. Deleting it leaves an argument with
 * nothing written down on either side.
 */
const rejectExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).populate('user_id', 'username');
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });

    expense.status = 'rejected';
    expense.approved_by = req.user._id;
    expense.approved_at = new Date();
    expense.rejection_reason = String(req.body?.reason || '').trim() || undefined;
    await expense.save();

    await notifyUser(expense.user_id?._id || expense.user_id, {
      type: 'important',
      title: 'Your expense was not approved',
      message: `GH¢${Number(expense.amount).toFixed(2)} for ${expense.category}`
        + `${expense.rejection_reason ? ` — ${expense.rejection_reason}` : ''}.`,
      link: '/expenses',
    }).catch(() => {});

    return res.status(200).json({ success: true, message: 'Turned down.', data: expense });
  } catch (err) {
    console.error('Reject expense error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/expenses
 */
const getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, category, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (ownExpensesOnly(req.user)) {
      filter.user_id = req.user._id;
    }

    if (startDate || endDate) {
      filter.expense_date = {};
      if (startDate) filter.expense_date.$gte = new Date(startDate);
      if (endDate) filter.expense_date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (category) filter.category = category;

    const skip = (Number(page) - 1) * Number(limit);
    // Pending ones belong here — this is the only screen that can show them,
    // and a queue nobody can see is a queue nobody works through. Everywhere
    // that adds money up still sees approved ones only.
    if (req.query.status) filter.status = req.query.status;
    const unapproved = { withUnapproved: true };

    const [expenses, total, awaiting] = await Promise.all([
      Expense.find(filter)
        .setOptions(unapproved)
        .populate('user_id', 'username')
        .populate('approved_by', 'username')
        .sort({ expense_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Expense.countDocuments(filter).setOptions(unapproved),
      Expense.countDocuments({
        ...(ownExpensesOnly(req.user) ? { user_id: req.user._id } : {}),
        status: 'pending',
      }).setOptions(unapproved),
    ]);

    return res.status(200).json({
      success: true,
      data: expenses,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
      awaiting_approval: awaiting,
    });
  } catch (err) {
    console.error('Get expenses error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/expenses/summary
 */
const getExpenseSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};

    if (ownExpensesOnly(req.user)) match.user_id = req.user._id;
    if (startDate || endDate) {
      match.expense_date = {};
      if (startDate) match.expense_date.$gte = new Date(startDate);
      if (endDate) match.expense_date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const summary = await Expense.aggregate([
      { $match: match },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    const grand_total = summary.reduce((sum, s) => sum + s.total, 0);
    return res.status(200).json({ success: true, data: { by_category: summary, grand_total } });
  } catch (err) {
    console.error('Expense summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/expenses/:id
 */
const getExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).populate('user_id', 'username');
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });

    if (ownExpensesOnly(req.user) && String(expense.user_id._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({ success: true, data: expense });
  } catch (err) {
    console.error('Get expense error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/expenses/:id
 */
const updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });

    if (ownExpensesOnly(req.user) && String(expense.user_id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const updated = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json({ success: true, message: 'Expense updated.', data: updated });
  } catch (err) {
    console.error('Update expense error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/expenses/:id
 */
const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });

    if (ownExpensesOnly(req.user) && String(expense.user_id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await Expense.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Expense deleted.' });
  } catch (err) {
    console.error('Delete expense error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  approveExpense, rejectExpense, createExpense, getExpenses, getExpense, updateExpense, deleteExpense, getExpenseSummary };
