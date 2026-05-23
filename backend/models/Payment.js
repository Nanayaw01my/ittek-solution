const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    installment_plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InstallmentPlan',
      required: true,
    },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    payment_date: {
      type: Date,
      default: Date.now,
    },
    payment_method: {
      type: String,
      enum: ['paystack', 'manual_cash'],
      required: true,
    },
    paystack_reference: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    paystack_status: {
      type: String,
      trim: true,
    },
    paid_by: {
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      user_role: {
        type: String,
        enum: ['admin', 'staff', 'customer'],
      },
      name: {
        type: String,
        trim: true,
      },
    },
    recorded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Payment', PaymentSchema);
