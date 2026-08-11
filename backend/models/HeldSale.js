const mongoose = require('mongoose');

/**
 * A cart parked mid-transaction ("hold") so the till can serve someone else,
 * then resumed later. Deliberately a snapshot of the cart only — no stock is
 * reserved and no Sale exists until the held cart is resumed and completed.
 */
const HeldItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variant_sku: { type: String, trim: true },
    product_name: { type: String, required: true },
    barcode: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true },
  },
  { _id: false }
);

const HeldSaleSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    label: { type: String, trim: true }, // e.g. "Blue shirt guy" — how staff find it again
    held_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customer_name: { type: String, trim: true },
    customer_phone: { type: String, trim: true },
    discount: { type: Number, default: 0 },
    discount_type: { type: String, enum: ['percentage', 'fixed'], default: 'fixed' },
    items: { type: [HeldItemSchema], required: true },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

HeldSaleSchema.index({ held_by: 1, createdAt: -1 });

// Held carts are scratch data — expire them after 7 days so the list stays usable.
HeldSaleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

HeldSaleSchema.virtual('total').get(function () {
  return (this.items || []).reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
});

HeldSaleSchema.set('toJSON', { virtuals: true });
HeldSaleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('HeldSale', HeldSaleSchema);
