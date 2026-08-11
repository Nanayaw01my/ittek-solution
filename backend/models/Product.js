const mongoose = require('mongoose');

/**
 * A sellable variation of a product — size, colour, wattage, capacity.
 *
 * Variants carry their own stock and price. When a product has variants, the
 * parent's `quantity` is the sum of its variants (kept in sync on save) and
 * the till sells the variant, never the parent.
 */
const VariantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true }, // e.g. "200W / Mono"
    barcode: { type: String, trim: true },
    // Free-form so a shop can use whatever axes it likes: { Size: 'L', Colour: 'Blue' }
    attributes: { type: Map, of: String, default: {} },
    cost_price: { type: Number, required: true, min: 0 },
    selling_price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    image_url: { type: String },
    is_active: { type: Boolean, default: true },
  },
  { _id: true }
);

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
    has_variants: {
      type: Boolean,
      default: false,
    },
    variants: {
      type: [VariantSchema],
      default: [],
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

// Variant lookup by scanned barcode or SKU
ProductSchema.index({ 'variants.barcode': 1 });
ProductSchema.index({ 'variants.sku': 1 });

/**
 * Keep the parent in step with its variants: `has_variants` reflects reality
 * and `quantity` is the roll-up, so every existing stock report, low-stock
 * alert and dashboard total keeps working untouched.
 */
ProductSchema.pre('save', function (next) {
  const active = (this.variants || []).filter((v) => v.is_active !== false);
  this.has_variants = active.length > 0;
  if (this.has_variants) {
    this.quantity = active.reduce((sum, v) => sum + (v.quantity || 0), 0);
  }
  next();
});

/** Find a variant by its SKU. */
ProductSchema.methods.findVariant = function (sku) {
  if (!sku) return null;
  return (this.variants || []).find((v) => v.sku === sku) || null;
};

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
