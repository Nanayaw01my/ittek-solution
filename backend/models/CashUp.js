const mongoose = require('mongoose');

/**
 * The close of a day's trading: what the system says came in, against what
 * was actually counted in the drawer and on the phone.
 *
 * The shop takes money through six different doors now — the till, service
 * charges, layaway, field dispatch, phone instalments and packages receipts —
 * and nothing ever compared the total against the cash in hand. A difference
 * found the same evening is a miscount somebody remembers; the same difference
 * found at month end is unexplainable.
 *
 * What the system expected is frozen into the record at the moment it is
 * closed. Later edits to a sale must not quietly change what a counted drawer
 * was once measured against.
 */
const CashUpSchema = new mongoose.Schema(
  {
    // Midnight of the day being closed, so one day has one cash-up.
    business_date: { type: Date, required: true, unique: true },

    // ── What the system says ────────────────────────────────────────────
    expected: {
      cash: { type: Number, default: 0 },
      mobile_money: { type: Number, default: 0 },
      card: { type: Number, default: 0 },
      // Paid out of the drawer during the day.
      expenses: { type: Number, default: 0 },
      refunds: { type: Number, default: 0 },
      // Cash expected in hand: takings, less what went out of the drawer.
      cash_in_hand: { type: Number, default: 0 },
      sales_count: { type: Number, default: 0 },
    },

    // ── What was actually counted ───────────────────────────────────────
    counted: {
      cash: { type: Number, default: 0 },
      mobile_money: { type: Number, default: 0 },
      card: { type: Number, default: 0 },
    },

    // counted − expected, per tender. Negative is money missing.
    variance: {
      cash: { type: Number, default: 0 },
      mobile_money: { type: Number, default: 0 },
      card: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    // Cash left in the drawer to start tomorrow, and so not missing.
    float_kept: { type: Number, default: 0, min: 0 },

    note: { type: String, trim: true },
    closed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    closed_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CashUpSchema.index({ business_date: -1 });

CashUpSchema.pre('save', function reckon(next) {
  const e = this.expected || {};
  const c = this.counted || {};
  // The float is tomorrow's opening cash, not today's shortfall.
  const cash = Number(((c.cash || 0) - (this.float_kept || 0) - (e.cash_in_hand || 0)).toFixed(2));
  const momo = Number(((c.mobile_money || 0) - (e.mobile_money || 0)).toFixed(2));
  const card = Number(((c.card || 0) - (e.card || 0)).toFixed(2));
  this.variance = { cash, mobile_money: momo, card, total: Number((cash + momo + card).toFixed(2)) };
  next();
});

module.exports = mongoose.model('CashUp', CashUpSchema);
