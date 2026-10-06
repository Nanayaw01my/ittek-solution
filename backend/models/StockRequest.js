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

    /**
     * Something the shop has never stocked.
     *
     * Only an owner may create a product, which left a Manager who needed a
     * new line of goods with nowhere to ask: the request screen could only
     * offer what was already on the shelf. So a line may instead be typed in
     * by name, and the product itself is created when the owner approves it —
     * approving is the owner's act of adding it, so nobody gains the right to
     * invent stock, and nobody has to telephone the office to get a new item
     * on a list.
     */
    is_new_product: { type: Boolean, default: false },
    /** What it should sell for. Needed before a product can exist at all. */
    selling_price: { type: Number, min: 0 },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
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
