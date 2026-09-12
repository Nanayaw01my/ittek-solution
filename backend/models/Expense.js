const { EXPENSE_CATEGORIES } = require('../config/expenseCategories');
const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      required: [true, 'Expense category is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    description: {
      type: String,
      trim: true,
    },
    expense_date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

ExpenseSchema.index({ user_id: 1, expense_date: -1 });
ExpenseSchema.index({ expense_date: -1 });
ExpenseSchema.index({ category: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
