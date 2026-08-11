const mongoose = require('mongoose');

/**
 * Layaway / installment purchase: goods are reserved and paid off over time,
 * and only released to the customer once fully paid.
 *
 * Distinct from Debt (goods already handed over, money still owed) and from
 * CreditAgreement (a formal financed agreement with guarantor paperwork).
 * Stock is deducted up front so a reserved item can't be sold twice.
 */
const LayawayItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variant_sku: { type: String, trim: true },
    product_name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const LayawayPaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['cash', 'card', 'mobile_money'], default: 'cash' },
    reference: { type: String, trim: true },
    paid_at: { type: Date, default: Date.now },
    received_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const ScheduleEntrySchema = new mongoose.Schema(
  {
    due_date: { type: Date, required: true },
    amount: { type: Number, required: true },
    paid: { type: Boolean, default: false },
  },
  { _id: false }
);

const LayawaySchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, required: true, trim: true },
    items: { type: [LayawayItemSchema], required: true },

    total_amount: { type: Number, required: true },
    down_payment: { type: Number, default: 0 },
    amount_paid: { type: Number, default: 0 },
    balance: { type: Number, required: true },

    frequency: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'weekly' },
    installments: { type: Number, default: 4, min: 1 },
    installment_amount: { type: Number, default: 0 },
    schedule: [ScheduleEntrySchema],
    next_due_date: { type: Date },
    due_date: { type: Date }, // final deadline

    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled', 'defaulted'],
      default: 'active',
      index: true,
    },
    collected: { type: Boolean, default: false }, // goods handed over
    collected_at: { type: Date },

    payments: [LayawayPaymentSchema],
    sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' }, // set when finalised
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cancelled_reason: { type: String, trim: true },
  },
  { timestamps: true }
);

LayawaySchema.index({ customer_phone: 1 });
LayawaySchema.index({ status: 1, next_due_date: 1 });

/** Recompute balance/status from the payment list. */
LayawaySchema.methods.recalculate = function () {
  const paid = (this.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  this.amount_paid = paid;
  this.balance = Math.max(0, this.total_amount - paid);

  // Mark schedule entries paid in order, against the running total.
  let remaining = paid;
  (this.schedule || []).forEach((entry) => {
    if (remaining >= entry.amount) {
      entry.paid = true;
      remaining -= entry.amount;
    } else {
      entry.paid = false;
    }
  });

  const nextUnpaid = (this.schedule || []).find((e) => !e.paid);
  this.next_due_date = nextUnpaid ? nextUnpaid.due_date : null;

  if (this.balance <= 0 && this.status === 'active') this.status = 'completed';
  return this;
};

module.exports = mongoose.model('Layaway', LayawaySchema);
