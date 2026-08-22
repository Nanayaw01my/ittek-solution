const mongoose = require('mongoose');

const RefundItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const RefundSchema = new mongoose.Schema(
  {
    sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    invoice_ref: { type: String, trim: true },
    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, trim: true },
    refund_amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    refund_method: {
      type: String,
      enum: ['cash', 'card', 'mobile_money'],
      required: true,
    },
    items: [RefundItemSchema],
    processed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    refund_date: { type: Date, default: Date.now },

    /**
     * A refund raised by staff waits for a CEO or Super Admin before any money
     * or stock moves. Only an approved refund restores stock and counts
     * against the day's sales.
     */
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approved_at: { type: Date },
    rejection_reason: { type: String, trim: true },
    /** Guards against a double approval putting the goods back twice. */
    stock_restored: { type: Boolean, default: false },
  },
  { timestamps: true }
);

RefundSchema.index({ refund_date: -1 });
RefundSchema.index({ sale_id: 1 });

module.exports = mongoose.model('Refund', RefundSchema);
