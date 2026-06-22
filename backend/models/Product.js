const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    barcode: {
      type: String,
      trim: true,
      sparse: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      index: true,
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
    },
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    quantity: {
      type: Number,
      default: 0,
      min: [0, 'Quantity cannot be negative'],
    },
    cost_price: {
      type: Number,
      required: [true, 'Cost price is required'],
      min: [0, 'Cost price cannot be negative'],
    },
    selling_price: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative'],
    },
    low_stock_level: {
      type: Number,
      default: 5,
      min: [0, 'Low stock level cannot be negative'],
    },
    image_url: {
      type: String,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Sparse unique index for barcode (allows multiple null values)
ProductSchema.index({ barcode: 1 }, { unique: true, sparse: true });
ProductSchema.index({ category_id: 1, is_active: 1 });
ProductSchema.index({ is_active: 1, quantity: 1 }); // low-stock queries
ProductSchema.index({ supplier_id: 1 });

// Virtuals
ProductSchema.virtual('profit_per_unit').get(function () {
  return this.selling_price - this.cost_price;
});

ProductSchema.virtual('profit_margin').get(function () {
  if (this.selling_price === 0) return 0;
  return (((this.selling_price - this.cost_price) / this.selling_price) * 100).toFixed(2);
});

ProductSchema.virtual('is_low_stock').get(function () {
  return this.quantity <= this.low_stock_level;
});

module.exports = mongoose.model('Product', ProductSchema);
