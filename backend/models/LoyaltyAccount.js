const mongoose = require('mongoose');

/**
 * A customer's loyalty balance, keyed by their normalised phone number
 * (233XXXXXXXXX) so the same person is recognised however staff type it.
 *
 * Kept separate from the Customer model on purpose: Customer carries credit
 * paperwork (Ghana card, guarantor, photos) and only exists for credit sales,
 * whereas anyone who gives a phone number at the till can earn points.
 */
const LoyaltyTransactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['earn', 'redeem', 'adjust', 'expire'], required: true },
    points: { type: Number, required: true }, // positive for earn, negative for redeem
    sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    invoice_no: { type: String },
    note: { type: String, trim: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const LoyaltyAccountSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true }, // normalised: 233XXXXXXXXX
    name: { type: String, trim: true },
    points_balance: { type: Number, default: 0, min: 0 },
    lifetime_points: { type: Number, default: 0 },
    total_spent: { type: Number, default: 0 },
    visits: { type: Number, default: 0 },
    last_visit: { type: Date },
    is_active: { type: Boolean, default: true },
    transactions: [LoyaltyTransactionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('LoyaltyAccount', LoyaltyAccountSchema);
