const mongoose = require('mongoose');

/**
 * A flagged till behaviour for a manager to review.
 *
 * These are signals, not accusations — a heavy discount day or a late refund
 * usually has an innocent explanation. The point is that someone senior sees
 * it, so every alert carries the evidence that triggered it and can be
 * dismissed with a reason.
 */
const FraudAlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'excessive_discount',
        'after_hours_sale',
        'refund_spike',
        'void_spike',
        'high_discount_rate',
        'large_cash_sale',
        'rapid_sales',
        'price_override',
      ],
      required: true,
      index: true,
    },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    username: { type: String },
    title: { type: String, required: true },
    detail: { type: String, required: true },

    // What triggered it — kept so a reviewer can judge without re-running the query.
    evidence: {
      sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
      invoice_no: { type: String },
      amount: { type: Number },
      threshold: { type: Number },
      count: { type: Number },
      window: { type: String },
    },

    status: {
      type: String,
      enum: ['open', 'reviewed', 'dismissed'],
      default: 'open',
      index: true,
    },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    review_note: { type: String, trim: true },

    // Stops the same condition raising an alert on every scan.
    dedupe_key: { type: String, index: true },
  },
  { timestamps: true }
);

FraudAlertSchema.index({ status: 1, createdAt: -1 });
FraudAlertSchema.index({ dedupe_key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('FraudAlert', FraudAlertSchema);
