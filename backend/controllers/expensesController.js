const { validationResult } = require('express-validator');
const Expense = require('../models/Expense');

/**
 * POST /api/expenses
 */
const createExpense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const expense = await Expense.create({ ...req.body, user_id: req.user._id });
    return res.status(201).json({ success: true, message: 'Expense recorded.', data: expense });
  } catch (err) {
    console.error('Create expense error:', err.message);
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

    // Sales can only see own expenses
    if (req.user.role === 'Sales') {
      filter.user_id = req.user._id;
    }

    if (startDate || endDate) {
      filter.expense_date = {};
      if (startDate) filter.expense_date.$gte = new Date(startDate);
      if (endDate) filter.expense_date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (category) filter.category = category;

    const skip = (Number(page) - 1) * Number(limit);
    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate('user_id', 'username')
        .sort({ expense_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Expense.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: expenses,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
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

    if (req.user.role === 'Sales') match.user_id = req.user._id;
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

    if (req.user.role === 'Sales' && String(expense.user_id._id) !== String(req.user._id)) {
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

    if (req.user.role === 'Sales' && String(expense.user_id) !== String(req.user._id)) {
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

    if (req.user.role === 'Sales' && String(expense.user_id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await Expense.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Expense deleted.' });
  } catch (err) {
    console.error('Delete expense error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { createExpense, getExpenses, getExpense, updateExpense, deleteExpense, getExpenseSummary };
