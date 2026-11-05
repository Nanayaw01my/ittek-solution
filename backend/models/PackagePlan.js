const mongoose = require('mongoose');

/**
 * A package bought on instalments.
 *
 * The shop advertises a handful of fixed offers — a 218L freezer at 28,500
 * with 18,000 down and 3,500 a month, and so on. Until now those lived only
 * on a printed sheet: the customer took the sheet away, paid in bits over
 * three months, and the shop's record of it was a note in a book. Nothing
 * reached the day's takings, so a month where most of the money came in as
 * instalments looked like a month with no sales.
 *
 * A plan is that sheet, written down: what was agreed, and every payment
 * made against it. Each payment writes a Sale of its own, which is what puts
 * it in the day's figures on the day the money was actually handed over.
 */

const PaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },

    /**
     * What kind of payment this was.
     *
     * 'full' and 'half' are the two the counter uses, because that is how
     * customers actually pay: the whole instalment, or half of it now and
     * the rest later in the month. Recording which was meant — rather than
     * only the figure — is what lets the shop see at a glance that somebody
     * has been paying halves since August.
     */
    portion: {
      type: String,
      enum: ['deposit', 'full', 'half', 'part'],
      default: 'full',
    },
    payment_date: { type: Date, default: Date.now },
    payment_method: { type: String, default: 'cash' },
    receipt_no: { type: String, trim: true },
    note: { type: String, trim: true },
    recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /** The Sale written for this payment, which is how it reaches the day. */
    sale_ref: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  },
  { _id: true }
);

const PackagePlanSchema = new mongoose.Schema(
  {
    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, trim: true },

    /** Which printed sheet it came off, or 'custom' for a one-off. */
    package_set: { type: String, trim: true, default: 'custom' },
    package_name: { type: String, required: true, trim: true },

    total_amount: { type: Number, required: true, min: 0 },

    /**
     * One scheduled instalment, in full.
     *
     * Kept as its own figure rather than worked out from the balance: the
     * printed offers do not always divide evenly, and the sheet's number is
     * the one the customer agreed to.
     */
    installment_amount: { type: Number, required: true, min: 0 },
    frequency: { type: String, enum: ['monthly', 'weekly'], default: 'monthly' },
    installments_count: { type: Number, min: 1 },

    start_date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    notes: { type: String, trim: true },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payments: [PaymentSchema],
  },
  { timestamps: true }
);

/** Everything handed over so far, deposit included. */
PackagePlanSchema.methods.paid = function paid() {
  return Number(
    (this.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0).toFixed(2)
  );
};

/** What is still owed. Never negative, however much was overpaid. */
PackagePlanSchema.methods.outstanding = function outstanding() {
  return Number(Math.max(0, (Number(this.total_amount) || 0) - this.paid()).toFixed(2));
};

/**
 * A plan that is paid off says so, without anybody closing it.
 *
 * A cancelled plan stays cancelled: somebody decided that, and a late
 * payment arriving against it should not quietly reopen the agreement.
 */
PackagePlanSchema.pre('save', function markComplete(next) {
  if (this.status !== 'cancelled') {
    this.status = this.outstanding() <= 0 ? 'completed' : 'active';
  }
  next();
});

module.exports = mongoose.model('PackagePlan', PackagePlanSchema);
