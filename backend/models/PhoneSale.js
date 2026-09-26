const mongoose = require('mongoose');

/**
 * A phone sold on credit, and the paperwork behind it.
 *
 * Anyone who can sign in may take one of these down — the whole point is that
 * a rep standing in front of a customer can capture the details and the Ghana
 * cards there and then. What they cannot do is read one back afterwards: the
 * customer's address, card number and card photographs are the customer's,
 * not the shop floor's, and they are only ever returned to a CEO or Super
 * Admin. Nobody sells anything on it until an owner has approved it.
 */
const IdDocsSchema = new mongoose.Schema(
  {
    ghana_card_number: { type: String, trim: true },
    ghana_card_front_url: { type: String },
    ghana_card_back_url: { type: String },
    // A photograph of the person, so the card can be checked against a face.
    photo_url: { type: String },
  },
  { _id: false }
);

const PhoneSaleSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },

    // ── The customer ────────────────────────────────────────────────────────
    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, required: true, trim: true },
    customer_address: { type: String, trim: true },
    customer_occupation: { type: String, trim: true },
    customer_id: { type: IdDocsSchema, default: () => ({}) },

    // ── The guarantor ───────────────────────────────────────────────────────
    guarantor_name: { type: String, required: true, trim: true },
    guarantor_phone: { type: String, required: true, trim: true },
    guarantor_address: { type: String, trim: true },
    guarantor_relationship: { type: String, trim: true },
    guarantor_id: { type: IdDocsSchema, default: () => ({}) },

    // ── The phone ───────────────────────────────────────────────────────────
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    phone_model: { type: String, required: true, trim: true },
    imei: { type: String, trim: true },

    // ── The money ───────────────────────────────────────────────────────────
    total_amount: { type: Number, required: true, min: 0 },
    down_payment: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },
    plan: { type: String, enum: ['monthly', 'weekly'], default: 'monthly' },
    installments: { type: Number, default: 3, min: 1 },
    installment_amount: { type: Number, default: 0 },

    /**
     * Every payment taken against this deal, the deposit included, so the
     * record answers "how much has he paid, how much is left" on its own
     * rather than sending someone to another screen for half the answer.
     */
    payments: [
      {
        amount: { type: Number, required: true, min: 0 },
        method: { type: String, enum: ['cash', 'card', 'mobile_money'], default: 'cash' },
        reference: { type: String, trim: true },
        note: { type: String, trim: true },
        paid_at: { type: Date, default: Date.now },
        invoice_no: { type: String, trim: true },
        recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        _id: false,
      },
    ],
    amount_paid: { type: Number, default: 0, min: 0 },

    /**
     * pending  — submitted, waiting on an owner
     * approved — an owner has agreed to it; the phone can be handed over
     * rejected — an owner has turned it down, with a reason
     */
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending',
      required: true,
    },

    // Written when an owner approves it: the money and the goods both move at
    // that moment, and these say where they went.
    sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    invoice_no: { type: String, trim: true },
    debt_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Debt' },
    // When the last instalment falls due, worked out from the plan at approval.
    final_due_date: { type: Date },
    stock_deducted: { type: Boolean, default: false },

    submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submitted_at: { type: Date, default: Date.now },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    rejection_reason: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

PhoneSaleSchema.index({ status: 1, submitted_at: -1 });
PhoneSaleSchema.index({ submitted_by: 1, submitted_at: -1 });
PhoneSaleSchema.index({ customer_phone: 1 });

PhoneSaleSchema.pre('save', function recalc(next) {
  // What has been paid is the deposit plus everything taken since, so the
  // balance falls as payments come in rather than standing at its opening
  // figure for the life of the deal.
  const taken = (this.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  this.amount_paid = Number(((this.down_payment || 0) + taken).toFixed(2));
  this.balance = Math.max(0, Number(((this.total_amount || 0) - this.amount_paid).toFixed(2)));

  // The instalment is worked out from the opening balance, not the shrinking
  // one — it is what was agreed, not what is left over the remaining months.
  const opening = Math.max(0, (this.total_amount || 0) - (this.down_payment || 0));
  const n = Math.max(1, this.installments || 1);
  this.installment_amount = Number((opening / n).toFixed(2));

  // Cleared deals drop out of the list of things to chase.
  if (this.status === 'approved' && this.balance <= 0.004) this.status = 'completed';
  next();
});

/**
 * The version safe to hand to someone who is not an owner: no address, no card
 * number, no photographs. They can see the application they took and what
 * became of it, and nothing about the person behind it beyond a name.
 */
PhoneSaleSchema.methods.withoutCustomerInfo = function withoutCustomerInfo() {
  const o = this.toObject({ virtuals: true });
  delete o.customer_address;
  delete o.customer_occupation;
  delete o.customer_id;
  delete o.guarantor_address;
  delete o.guarantor_relationship;
  delete o.guarantor_id;
  // The phone numbers are how the shop chases a payment — owners only.
  delete o.customer_phone;
  delete o.guarantor_phone;
  o.customer_info_hidden = true;
  return o;
};

module.exports = mongoose.model('PhoneSale', PhoneSaleSchema);
