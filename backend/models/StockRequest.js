const mongoose = require('mongoose');

const StockRequestItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    product_name: { type: String, required: true },
    quantity_requested: { type: Number, required: true, min: 1 },
    estimated_cost: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const StockRequestSchema = new mongoose.Schema(
  {
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    request_date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approved_date: {
      type: Date,
    },
    rejected_reason: {
      type: String,
      trim: true,
    },
    total_amount: {
      type: Number,
      default: 0,
    },
    notes: { type: String, trim: true },
    items: [StockRequestItemSchema],
  },
  {
    timestamps: true,
  }
);

StockRequestSchema.index({ status: 1 });
StockRequestSchema.index({ created_by: 1, request_date: -1 });

module.exports = mongoose.model('StockRequest', StockRequestSchema);
