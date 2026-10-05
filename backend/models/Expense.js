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

    /**
     * Money does not leave the books until an owner says so.
     *
     * An expense is the one record anybody can write that reduces the shop's
     * profit, and until now anybody could write one unseen. It is now a
     * request until approved.
     */
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approved_at: { type: Date },
    /** Said to the person who recorded it, so they know what to correct. */
    rejection_reason: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

/**
 * Only approved expenses count, everywhere, by default.
 *
 * There are more than twenty places in this system that add expenses up — the
 * dashboard, profit and loss, the cash up, the daily summary, the financial
 * screens. Filtering each one by hand would work until somebody wrote the
 * twenty-first and quietly let unapproved money into the profit figure. So
 * the default lives here, where a query cannot forget it.
 *
 * A screen that genuinely needs to see pending ones — the expenses list
 * itself, and the approval queue — asks for them explicitly. That is the rare
 * case and it should be the one that has to say so.
 */
const wantsAll = (options) => !!(options && options.withUnapproved);

/**
 * Named one by one rather than matched on /^find/, which does not cover
 * countDocuments — so a count would have quietly included pending expenses
 * while every total excluded them.
 *
 * findOne and findById are deliberately absent. Fetching one named record is
 * what approving, rejecting and editing do, and a filter there would hide the
 * very document somebody is trying to act on. A single document is also not a
 * figure; the lists and the sums are what had to be made safe.
 */
ExpenseSchema.pre(['find', 'countDocuments', 'count', 'distinct'], function approvedOnly() {
  if (wantsAll(this.getOptions())) return;
  // A query that already speaks about status means it, so it is left alone.
  const asked = this.getFilter() || {};
  if (asked.status !== undefined) return;
  this.where({ status: 'approved' });
});

ExpenseSchema.pre('aggregate', function approvedOnlyInPipeline() {
  if (wantsAll(this.options)) return;
  const pipeline = this.pipeline();
  // Ahead of everything, so it narrows before any grouping or unwinding
  // rather than after — and so a $match further down cannot undo it.
  pipeline.unshift({ $match: { status: 'approved' } });
});

ExpenseSchema.index({ status: 1, expense_date: -1 });
ExpenseSchema.index({ user_id: 1, expense_date: -1 });
ExpenseSchema.index({ expense_date: -1 });
ExpenseSchema.index({ category: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
