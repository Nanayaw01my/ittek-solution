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

module.exports = mongoose.model('Purchase', PurchaseSchema);
