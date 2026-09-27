const mongoose = require('mongoose');

/**
 * A warranty on something the shop sold.
 *
 * Solar equipment comes back. A customer arrives with a dead inverter, and
 * the two questions are always the same: is it still covered, and whose
 * problem is it — ours or the supplier's. Both were answered by searching
 * through paper, so both took as long as the customer was willing to wait.
 *
 * The record is kept separately from the sale because a warranty outlives the
 * transaction: it is claimed against months later, by serial number, often by
 * somebody who has lost the receipt.
 */
const WarrantySchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },

    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_name: { type: String, required: true, trim: true },
    // What is actually written on the unit. The way a claim is found.
    serial_number: { type: String, trim: true, index: true },

    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, trim: true, index: true },

    // Where it was sold, when there is a sale to point at.
    sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    invoice_no: { type: String, trim: true },

    // Who the shop claims against when the customer claims against the shop.
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },

    starts_on: { type: Date, required: true, default: Date.now },
    months: { type: Number, required: true, min: 1 },
    expires_on: { type: Date, required: true },

    /**
     * active   — in date, nothing wrong with it
     * claimed  — the customer has brought it back and it was honoured
     * rejected — brought back, not covered
     * void     — the customer broke it, or the warranty was cancelled
     */
    status: {
      type: String,
      enum: ['active', 'claimed', 'rejected', 'void'],
      default: 'active',
      required: true,
    },

    claims: [
      {
        reported_at: { type: Date, default: Date.now },
        fault: { type: String, trim: true },
        outcome: {
          type: String,
          enum: ['repaired', 'replaced', 'refunded', 'refused', 'sent_to_supplier'],
        },
        note: { type: String, trim: true },
        handled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        _id: false,
      },
    ],

    notes: { type: String, trim: true },
    registered_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

WarrantySchema.index({ expires_on: -1 });
WarrantySchema.index({ status: 1, expires_on: -1 });

/**
 * Worked out before validation, not before saving. Mongoose runs its own
 * validation as the first pre-save hook, so a required field computed in a
 * later save hook fails validation before it is ever set — the whole
 * registration then dies on a field the shop never fills in by hand.
 */
WarrantySchema.pre('validate', function expiry(next) {
  if (this.starts_on && this.months) {
    const end = new Date(this.starts_on);
    end.setMonth(end.getMonth() + this.months);
    this.expires_on = end;
  }
  next();
});

/**
 * Covered right now — which is not the same as 'active'. A warranty nobody
 * has touched since it was sold is still 'active' the day after it runs out,
 * so the date is what decides, not the status.
 */
WarrantySchema.methods.isCovered = function isCovered(on = new Date()) {
  if (['void', 'rejected'].includes(this.status)) return false;
  return this.expires_on > on;
};

WarrantySchema.methods.daysLeft = function daysLeft(on = new Date()) {
  return Math.ceil((this.expires_on - on) / 86400000);
};

module.exports = mongoose.model('Warranty', WarrantySchema);
