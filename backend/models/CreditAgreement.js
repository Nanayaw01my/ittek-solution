const mongoose = require('mongoose');

const CreditPaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    payment_date: { type: Date, default: Date.now },
    week_number: { type: Number },
    recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

/**
 * A product swapped out after the agreement was signed.
 *
 * The customer brings back what they were given and takes something else.
 * The agreement does not restart — the same customer, the same guarantor and
 * everything already paid all stand — but the goods behind it change, and so
 * does the amount owed if the two items are not worth the same.
 *
 * Each swap is kept rather than overwriting the product, because the paper
 * the customer signed names the old item and its serial number. When a
 * dispute comes months later, the chain from what was signed for to what the
 * customer actually holds has to be readable.
 */
const ProductExchangeSchema = new mongoose.Schema(
  {
    reference: { type: String, trim: true },
    exchanged_on: { type: Date, default: Date.now },

    /** What came back. */
    returned_description: { type: String, required: true, trim: true },
    returned_serial: { type: String, trim: true },
    returned_value: { type: Number, required: true, min: 0 },
    returned_condition: { type: String, trim: true },

    /** What went out in its place. */
    replacement_type: { type: String, trim: true },
    replacement_description: { type: String, required: true, trim: true },
    replacement_serial: { type: String, trim: true },
    replacement_value: { type: Number, required: true, min: 0 },

    reason: { type: String, trim: true },

    /** The plan agreed for the new balance, at the moment of the swap. */
    plan: { type: String, enum: ['daily', 'weekly', 'monthly'] },
    instalments: { type: Number, min: 1 },
    instalment_amount: { type: Number, min: 0 },
    schedule_from: { type: Date },

    /** The money, as it stood before and after — frozen, not recomputed. */
    total_before: { type: Number, required: true },
    total_after: { type: Number, required: true },
    difference: { type: Number, required: true },
    paid_to_date: { type: Number, default: 0 },
    balance_before: { type: Number, default: 0 },
    balance_after: { type: Number, default: 0 },
    /** Owed back to the customer, when the new item is worth less than paid. */
    credit_due: { type: Number, default: 0 },

    done_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const CreditAgreementSchema = new mongoose.Schema(
  {
    // Customer
    customer_name: { type: String, required: [true, 'Customer name is required'], trim: true },
    customer_phone: { type: String, required: [true, 'Customer phone is required'], trim: true },
    customer_address: { type: String, trim: true },
    document_type: { type: String, trim: true },
    id_number: { type: String, trim: true },
    customer_passport_url: { type: String },

    // Product
    product_type: { type: String, trim: true },
    product_description: { type: String, trim: true },
    serial_number: { type: String, trim: true },

    // Financials
    total_amount: { type: Number, required: [true, 'Total amount is required'], min: [0.01, 'Must be > 0'] },
    down_payment: { type: Number, default: 0 },
    remaining: { type: Number },
    payment_plan: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
    weekly_installment: { type: Number },
    /** How many instalments the balance is split into. Three, historically. */
    instalment_count: { type: Number, default: 3, min: 1 },
    /**
     * When the current plan starts, and the amount it spreads.
     *
     * Only set once a swap has rewritten the plan. Before that the schedule
     * is the original one — the whole financed amount from the start date —
     * and these stay empty so nothing about existing agreements changes.
     *
     * Payments made before `schedule_from` are already accounted for in
     * `schedule_base`, so they must not be counted against the new
     * instalments as well.
     */
    schedule_from: { type: Date },
    schedule_base: { type: Number, min: 0 },
    interest_rate: { type: Number, default: 0 },

    // Dates
    start_date: { type: Date, default: Date.now },
    end_date: { type: Date },

    // Guarantor
    guarantor_name: { type: String, trim: true },
    guarantor_phone: { type: String, trim: true },
    guarantor_address: { type: String, trim: true },
    guarantor_ghana_card: { type: String, trim: true },
    guarantor_passport_url: { type: String },

    // Legacy photo (disk path)
    customer_photo: { type: String },

    status: { type: String, enum: ['active', 'completed', 'defaulted'], default: 'active' },
    payments: [CreditPaymentSchema],
    exchanges: [ProductExchangeSchema],
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

CreditAgreementSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('total_amount') || this.isModified('down_payment')
      || this.isModified('instalment_count') || this.isModified('schedule_base')) {
    this.remaining = Math.max(0, this.total_amount - this.down_payment);
    const count = Math.max(1, Number(this.instalment_count) || 3);
    // After a swap the instalments are worked out on the balance the plan was
    // agreed over, not on the whole financed amount — the customer is not
    // asked to pay again for what they already paid.
    const spread = this.schedule_base !== undefined && this.schedule_base !== null
      ? Number(this.schedule_base)
      : this.remaining;
    this.weekly_installment = spread > 0 ? +(spread / count).toFixed(2) : 0;
  }

  if (this.isNew && this.start_date && !this.end_date) {
    const planDays = { daily: 3, weekly: 21, monthly: 90 };
    const days = planDays[this.payment_plan] || 21;
    const end = new Date(this.start_date);
    end.setDate(end.getDate() + days);
    this.end_date = end;
  }

  next();
});

/** What the customer has actually handed over so far. */
CreditAgreementSchema.methods.paidToDate = function paidToDate() {
  const instalments = (this.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return Number(((Number(this.down_payment) || 0) + instalments).toFixed(2));
};

/**
 * What is still owed.
 *
 * `remaining` on this schema is the amount financed at the start and does not
 * move as payments come in, so it is not the answer to "what does this
 * customer still owe?" — that has to count the payments.
 */
CreditAgreementSchema.methods.outstanding = function outstanding() {
  return Math.max(0, Number(((Number(this.total_amount) || 0) - this.paidToDate()).toFixed(2)));
};

CreditAgreementSchema.index({ status: 1 });
CreditAgreementSchema.index({ customer_name: 1 });
CreditAgreementSchema.index({ created_by: 1, createdAt: -1 });

module.exports = mongoose.model('CreditAgreement', CreditAgreementSchema);

