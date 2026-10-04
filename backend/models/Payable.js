const mongoose = require('mongoose');

/**
 * Money the shop owes, written down by the owner.
 *
 * The first attempt at this worked it out from the purchase book, which
 * assumed every delivery is entered as a Purchase before anybody owes
 * anything for it. That is not how the shop runs: goods arrive, the owner
 * knows what is owed and to whom, and the purchase record may never exist.
 * A screen that can only show what the system already knew is a screen that
 * shows nothing.
 *
 * So this is a plain ledger. The CEO or Super Admin writes down who is owed,
 * how much, what for and when it falls due, and records payments against it
 * as they are made. Nothing derives it and nothing else can create one.
 *
 * A payment here is not an expense and must never be written as one. The
 * goods were already bought; this settles a debt that exists because of a
 * purchase that has already happened. Recording it as an expense as well
 * would charge the shop twice for the same thing.
 */
const PayableSchema = new mongoose.Schema(
  {
    /**
     * Typed, not chosen from a list. Plenty of what a shop owes is to
     * somebody who is not a registered supplier — a transporter, a landlord,
     * a fitter owed for last week. Forcing a supplier record first is how a
     * debt ends up not being written down at all.
     */
    supplier_name: { type: String, required: true, trim: true, index: true },
    supplier_phone: { type: String, trim: true },
    /** Linked where the shop does have the supplier on file. */
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },

    /** What it is for, in the owner's own words. */
    about: { type: String, required: true, trim: true },

    amount_owed: { type: Number, required: true, min: 0 },
    amount_paid: { type: Number, default: 0, min: 0 },

    payments: [
      {
        amount: { type: Number, required: true, min: 0 },
        method: { type: String, enum: ['cash', 'bank', 'mobile_money', 'cheque', 'other'], default: 'cash' },
        reference: { type: String, trim: true },
        paid_at: { type: Date, default: Date.now },
        paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, trim: true },
        _id: false,
      },
    ],

    incurred_on: { type: Date, default: Date.now },
    /** When they expect it. Blank means nothing was agreed. */
    due_date: { type: Date },

    status: {
      type: String,
      enum: ['unpaid', 'partial', 'paid'],
      default: 'unpaid',
      index: true,
    },

    notes: { type: String, trim: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

/**
 * The balance and the status follow the payments rather than being set by
 * whichever screen last touched them, so they cannot drift out of step with
 * the money. pre('validate') and not pre('save'): validation is mongoose's
 * first save hook, so a field filled in pre('save') is one validation has
 * already decided about.
 */
PayableSchema.pre('validate', function settleUp() {
  const paid = (this.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  this.amount_paid = Number(paid.toFixed(2));
  const owed = Number(((this.amount_owed || 0) - this.amount_paid).toFixed(2));
  // A rounding hair either way is settled, not a balance to chase.
  this.status = owed <= 0.004 ? 'paid' : this.amount_paid > 0 ? 'partial' : 'unpaid';
});

PayableSchema.methods.balance = function balance() {
  return Math.max(0, Number(((this.amount_owed || 0) - (this.amount_paid || 0)).toFixed(2)));
};

PayableSchema.index({ status: 1, due_date: 1 });

module.exports = mongoose.model('Payable', PayableSchema);
