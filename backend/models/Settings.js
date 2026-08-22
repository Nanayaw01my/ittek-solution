const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema(
  {
    company_name: {
      type: String,
      default: 'DAN & DOR SOLAR COMPANY LIMITED',
      trim: true,
    },
    company_address: {
      type: String,
      trim: true,
    },
    company_phone: {
      type: String,
      trim: true,
    },
    company_email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    logo_url: {
      type: String,
    },
    tax_rate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    low_stock_alert: {
      type: Number,
      default: 5,
    },
    receipt_header: {
      type: String,
      trim: true,
    },
    receipt_footer: {
      type: String,
      trim: true,
    },
    currency_symbol: {
      type: String,
      default: 'GH₵',
    },
    email_config: {
      smtp_host: { type: String },
      smtp_port: { type: Number },
      smtp_user: { type: String },
      smtp_pass: { type: String, select: false },
      from_email: { type: String },
    },
    notification_settings: {
      large_sale_threshold: { type: Number, default: 5000 },
      expense_threshold: { type: Number, default: 1000 },
      email_notifications: { type: Boolean, default: true },
    },

    // ─── Multi-currency ────────────────────────────────────────────────────
    // Everything is stored in base_currency; the rest are display currencies
    // converted at `rate` (1 base = rate foreign).
    base_currency: { type: String, default: 'GHS', uppercase: true, trim: true },
    currencies: {
      type: [
        new mongoose.Schema(
          {
            code: { type: String, required: true, uppercase: true, trim: true },
            symbol: { type: String, required: true, trim: true },
            rate: { type: Number, required: true, min: 0 }, // 1 GHS = rate <code>
            is_active: { type: Boolean, default: true },
          },
          { _id: false }
        ),
      ],
      default: () => [
        { code: 'GHS', symbol: 'GH₵', rate: 1, is_active: true },
        { code: 'USD', symbol: '$', rate: 0.065, is_active: true },
        { code: 'EUR', symbol: '€', rate: 0.06, is_active: true },
        { code: 'GBP', symbol: '£', rate: 0.051, is_active: true },
      ],
    },

    // ─── Loyalty ───────────────────────────────────────────────────────────
    loyalty_settings: {
      enabled: { type: Boolean, default: true },
      // Points earned per unit of base currency spent.
      points_per_currency: { type: Number, default: 1 },
      // Base-currency value of one point when redeemed.
      currency_per_point: { type: Number, default: 0.01 },
      min_points_to_redeem: { type: Number, default: 100 },
      // Cap redemption so points can never zero out a sale.
      max_redeem_percent: { type: Number, default: 50, min: 0, max: 100 },
    },

    // ─── Pay & Pick Later (layaway) terms ──────────────────────────────────
    // Printed on the agreement, so they are shop policy rather than a hardcoded
    // number buried in the PDF generator.
    layaway_settings: {
      // Deducted from a refund when the customer abandons the plan.
      cancellation_fee_percent: { type: Number, default: 10, min: 0, max: 100 },
      // Days after final payment within which the goods must be collected.
      collection_days: { type: Number, default: 30, min: 1 },
      // Days in arrears before the agreement may be cancelled.
      default_after_days: { type: Number, default: 30, min: 1 },
    },

    // ─── Fraud detection thresholds ────────────────────────────────────────
    fraud_settings: {
      enabled: { type: Boolean, default: true },
      max_discount_percent: { type: Number, default: 20 }, // above this, flag it
      large_cash_sale: { type: Number, default: 10000 },
      // Trading hours; sales outside them get flagged.
      open_hour: { type: Number, default: 6, min: 0, max: 23 },
      close_hour: { type: Number, default: 21, min: 0, max: 23 },
      refunds_per_day: { type: Number, default: 3 },
      sales_per_minute: { type: Number, default: 5 },
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: false,
  }
);

module.exports = mongoose.model('Settings', SettingsSchema);
