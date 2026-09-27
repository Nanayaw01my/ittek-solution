const mongoose = require('mongoose');

/**
 * A price given to a customer before they have agreed to anything.
 *
 * Solar is a quoting business — somebody wants a figure for panels, a
 * battery, an inverter and the cabling, and they take it away to think about
 * it. Until now that figure was written on paper, so nothing knew whether it
 * was ever accepted, and nobody could say how many quotes turn into sales.
 *
 * A quotation moves no stock and takes no money. Accepting one is what turns
 * it into a sale, and the sale it produced is recorded here so the same quote
 * cannot be cashed twice.
 */
const QuotationItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true, min: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const QuotationSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },

    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, trim: true },
    customer_address: { type: String, trim: true },

    items: { type: [QuotationItemSchema], default: [] },

    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total_amount: { type: Number, default: 0 },

    // A price is only good for so long — panel prices move with the cedi.
    valid_until: { type: Date },

    /**
     * draft    — being put together
     * sent     — given to the customer
     * accepted — turned into a sale
     * declined — they said no
     * expired  — nobody said anything and the price ran out
     */
    status: {
      type: String,
      enum: ['draft', 'sent', 'accepted', 'declined', 'expired'],
      default: 'draft',
      required: true,
    },

    // Written when it is accepted, so it cannot be turned into a second sale.
    sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    invoice_no: { type: String, trim: true },

    notes: { type: String, trim: true },
    prepared_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    decided_at: { type: Date },
  },
  { timestamps: true }
);

QuotationSchema.index({ status: 1, createdAt: -1 });
QuotationSchema.index({ customer_phone: 1 });

QuotationSchema.pre('validate', function totals(next) {
  for (const item of this.items || []) {
    item.total = Number(((item.unit_price || 0) * (item.quantity || 0)).toFixed(2));
  }
  this.subtotal = Number(
    (this.items || []).reduce((sum, i) => sum + (i.total || 0), 0).toFixed(2)
  );
  this.total_amount = Number(Math.max(0, this.subtotal - (this.discount || 0)).toFixed(2));
  next();
});

/** Past its date and nobody ever came back. */
QuotationSchema.methods.hasLapsed = function hasLapsed(on = new Date()) {
  if (!this.valid_until) return false;
  return ['draft', 'sent'].includes(this.status) && this.valid_until < on;
};

module.exports = mongoose.model('Quotation', QuotationSchema);
