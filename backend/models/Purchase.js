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
    /**
     * True when the figure above is the product's last known cost rather
     * than a price anybody typed for this delivery. A manager receives goods
     * without touching money, so the cost has to come from somewhere, and
     * the books must not pretend it was confirmed.
     */
    cost_assumed: { type: Boolean, default: false },
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

    /**
     * Received by somebody who may not see cost prices.
     *
     * The stock is on the shelf and the delivery is recorded, but what it
     * cost has not been confirmed by an owner. Flagged so it can be found
     * and priced rather than silently carrying last month's figure into
     * every profit calculation.
     */
    awaiting_costing: { type: Boolean, default: false, index: true },
    costed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    costed_at: { type: Date },
  },
  {
    timestamps: true,
  }
);

PurchaseSchema.index({ purchase_date: -1 });
PurchaseSchema.index({ supplier_id: 1 });

module.exports = mongoose.model('Purchase', PurchaseSchema);
