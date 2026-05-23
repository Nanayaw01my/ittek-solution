const mongoose = require('mongoose');

const ScheduleItemSchema = new mongoose.Schema(
  {
    due_date: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paid: {
      type: Boolean,
      default: false,
    },
    payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
  },
  { _id: true }
);

const InstallmentPlanSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    device_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    down_payment: {
      type: Number,
      required: true,
      min: 0,
    },
    total_price: {
      type: Number,
      required: true,
      min: 0,
    },
    remaining_balance: {
      type: Number,
      required: true,
      min: 0,
    },
    installment_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true,
    },
    total_payments: {
      type: Number,
      required: true,
      min: 1,
    },
    payments_made: {
      type: Number,
      default: 0,
      min: 0,
    },
    start_date: {
      type: Date,
      required: true,
    },
    next_due_date: {
      type: Date,
      required: true,
    },
    end_date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'defaulted'],
      default: 'active',
    },
    schedule: [ScheduleItemSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('InstallmentPlan', InstallmentPlanSchema);
