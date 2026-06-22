const mongoose = require('mongoose');

const DebtPaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    payment_date: { type: Date, default: Date.now },
    receipt_no: { type: String },
    recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const DebtSchema = new mongoose.Schema(
  {
    sale_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
    },
    credit_agreement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CreditAgreement',
    },
    customer_name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    customer_phone: {
      type: String,
      trim: true,
    },
    amount_owed: {
      type: Number,
      required: [true, 'Amount owed is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    amount_paid: {
      type: Number,
      default: 0,
    },
    due_date: {
      type: Date,
      default: () => {
        const date = new Date();
        date.setDate(date.getDate() + 21);
        return date;
      },
    },
    status: {
      type: String,
      enum: ['active', 'paid', 'overdue'],
      default: 'active',
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    payments: [DebtPaymentSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: remaining amount
DebtSchema.virtual('remaining').get(function () {
  return Math.max(0, this.amount_owed - this.amount_paid);
});

// Pre-save: update status based on remaining and due date
DebtSchema.pre('save', function (next) {
  const remaining = this.amount_owed - this.amount_paid;

  if (remaining <= 0) {
    this.status = 'paid';
  } else if (this.due_date && new Date() > this.due_date) {
    this.status = 'overdue';
  } else {
    this.status = 'active';
  }

  next();
});

DebtSchema.index({ status: 1 });
DebtSchema.index({ customer_name: 1 });
DebtSchema.index({ due_date: 1 });

module.exports = mongoose.model('Debt', DebtSchema);
