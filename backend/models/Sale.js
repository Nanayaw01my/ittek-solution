const mongoose = require('mongoose');
const { generateReceiptToken } = require('../utils/receipt');

const SaleItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    product_name: { type: String, required: true },
    variant_sku: { type: String, trim: true },
    variant_name: { type: String, trim: true },
    barcode: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true },
    cost_price: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * One tender against a sale. A sale can be settled with several of these —
 * e.g. GHC200 cash + GHC300 mobile money — and their sum must equal the
 * amount paid.
 */
const PaymentSplitSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ['cash', 'card', 'mobile_money'], required: true },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, trim: true }, // MoMo txn id, card auth code
  },
  { _id: false }
);

const SaleSchema = new mongoose.Schema(
  {
    invoice_no: {
      type: String,
      unique: true,
      required: true,
    },
    // Random public handle for the receipt page. Never expose the ObjectId in
    // receipt URLs — ObjectIds are guessable and would leak other customers'
    // receipts to anyone who increments one.
    receipt_token: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      default: generateReceiptToken,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    customer_name: {
      type: String,
      trim: true,
    },
    customer_phone: {
      type: String,
      trim: true,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    discount_type: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'fixed',
    },
    total_amount: {
      type: Number,
      required: true,
    },
    cart_total: {
      type: Number,
      required: true,
    },
    debt_amount: {
      type: Number,
      default: 0,
    },
    payment_status: {
      type: String,
      enum: ['paid', 'partial', 'debt_payment'],
      required: true,
    },
    payment_method: {
      type: String,
      // 'split' when settled with more than one tender; the breakdown lives
      // in `payments`. Single-tender sales keep their real method so every
      // existing report and filter keeps working unchanged.
      enum: ['cash', 'card', 'mobile_money', 'split'],
      required: true,
    },
    payments: {
      type: [PaymentSplitSchema],
      default: [],
    },

    // ─── Currency ────────────────────────────────────────────────────────────
    // Amounts above are always stored in the shop's base currency (GHS) so
    // reporting stays consistent. These record what the customer actually saw.
    currency: { type: String, default: 'GHS', uppercase: true, trim: true },
    exchange_rate: { type: Number, default: 1 }, // base -> display currency
    display_total: { type: Number }, // total_amount expressed in `currency`

    // ─── Loyalty ─────────────────────────────────────────────────────────────
    loyalty_phone: { type: String, trim: true }, // normalised 233XXXXXXXXX
    points_earned: { type: Number, default: 0 },
    points_redeemed: { type: Number, default: 0 },
    loyalty_discount: { type: Number, default: 0 },
    sale_date: {
      type: Date,
      default: Date.now,
    },
    items: [SaleItemSchema],
  },
  {
    timestamps: true,
  }
);

SaleSchema.index({ user_id: 1, sale_date: -1 });
SaleSchema.index({ sale_date: -1 });
SaleSchema.index({ invoice_no: 1 });

module.exports = mongoose.model('Sale', SaleSchema);
