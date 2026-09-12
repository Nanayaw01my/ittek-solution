const mongoose = require('mongoose');

const WorkerPaymentSchema = new mongoose.Schema(
  {
    worker_name: {
      type: String,
      required: [true, 'Worker name is required'],
      trim: true,
    },
    worker_phone: {
      type: String,
      trim: true,
    },
    /**
     * What this payment is for. A salary is a fixed wage for a period; a
     * commission is a cut of what the worker sold or installed. They are kept
     * apart because one is a standing cost and the other moves with takings,
     * and the shop needs to see them separately.
     */
    payment_type: {
      type: String,
      enum: ['salary', 'commission'],
      default: 'salary',
      required: true,
    },
    commission_rate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    /** How the money actually left the business. */
    payment_method: {
      type: String,
      enum: ['cash', 'mobile_money', 'bank_transfer'],
      default: 'cash',
      required: true,
    },
    /** MoMo transaction id, cheque number, bank reference. */
    reference: {
      type: String,
      trim: true,
    },
    amount_paid: {
      type: Number,
      required: [true, 'Amount paid is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    payment_date: {
      type: Date,
      default: Date.now,
    },
    period_start: {
      type: Date,
    },
    period_end: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

WorkerPaymentSchema.index({ payment_date: -1 });
WorkerPaymentSchema.index({ worker_name: 1 });
WorkerPaymentSchema.index({ payment_type: 1, payment_date: -1 });

module.exports = mongoose.model('WorkerPayment', WorkerPaymentSchema);
