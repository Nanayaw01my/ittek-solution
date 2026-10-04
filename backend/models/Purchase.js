const mongoose = require('mongoose');

const PurchaseItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    product_name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit_cost: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const PurchaseSchema = new mongoose.Schema(
  {
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    purchase_date: {
      type: Date,
      default: Date.now,
    },
    total_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    /**
     * What has been handed over to the supplier for this delivery.
     *
     * The shop tracked every cedi a customer owed it and nothing at all about
     * what it owed out. So the system could say exactly who owed GH¢4,000 and
     * knew nothing of the GH¢12,000 due to a supplier next week — half the
     * picture, and the half that gets a business into trouble.
     *
     * Paying a supplier is NOT an expense and must never be written as one.
     * Goods bought are already carried at cost on the shelf, and that cost
     * reaches the profit figure when they are sold. Recording the payment as
     * an expense as well would charge the shop twice for the same goods and
     * make every profit figure wrong. This settles a debt; it does not spend
     * anything that has not already been counted.
     */
    amount_paid: { type: Number, default: 0, min: 0 },
    payments: [
      {
        amount: { type: Number, required: true, min: 0 },
        method: { type: String, enum: ['cash', 'bank', 'mobile_money', 'cheque', 'other'], default: 'cash' },
        reference: { type: String, trim: true },
        paid_at: { type: Date, default: Date.now },
        paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, trim: true },
        _id: false,
      },
    ],
    /** When the supplier expects it. Blank means nobody agreed a date. */
    due_date: { type: Date },
    payment_status: {
      type: String,
      enum: ['unpaid', 'partial', 'paid'],
      default: 'unpaid',
      index: true,
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
    items: [PurchaseItemSchema],
  },
  {
    timestamps: true,
  }
);

PurchaseSchema.index({ purchase_date: -1 });
PurchaseSchema.index({ supplier_id: 1 });

/**
 * The balance and the status follow the payments, rather than being set by
 * whichever screen happened to change one. A status written by hand drifts
 * out of step with the money the first time somebody edits a payment.
 */
PurchaseSchema.pre('validate', function settleUp() {
  const paid = (this.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  this.amount_paid = Number(paid.toFixed(2));
  const owed = Number(((this.total_amount || 0) - this.amount_paid).toFixed(2));
  // A rounding hair either way is settled, not a balance to chase.
  this.payment_status = owed <= 0.004 ? 'paid' : this.amount_paid > 0 ? 'partial' : 'unpaid';
});

/** What is still owed on this delivery. */
PurchaseSchema.methods.balance = function balance() {
  return Math.max(0, Number(((this.total_amount || 0) - (this.amount_paid || 0)).toFixed(2)));
};

PurchaseSchema.index({ payment_status: 1, due_date: 1 });
PurchaseSchema.index({ supplier_id: 1, payment_status: 1 });

module.exports = mongoose.model('Purchase', PurchaseSchema);
