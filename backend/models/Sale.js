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
    /**
     * Idempotency key set by the till, one per attempt at a sale.
     *
     * A till that loses the connection mid-request cannot tell whether the
     * sale was written or not, so it retries. Without this, that retry books
     * the sale twice and deducts the stock twice. With it, the second attempt
     * finds the first and returns it instead of writing again.
     *
     * Not unique at the index level: sales made before this existed have no
     * key, and a unique index over many nulls is a migration risk on a live
     * collection. The lookup below is the guard.
     */
    client_ref: {
      type: String,
      index: true,
      sparse: true,
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
    /**
     * The number the till printed when it sold this with no connection.
     *
     * A till offline cannot be given an invoice number — those come from the
     * server, in sequence — so it prints its own, POS-20260930-0001, and the
     * server issues the real INV- number when the sale syncs. That left the
     * slip in the customer's hand quoting a number the system had never heard
     * of: typing it into Refunds found nothing, and the customer's own
     * receipt was no use for the one thing a receipt is kept for.
     *
     * So the till's number is kept here, and every lookup that takes an
     * invoice number takes this too.
     */
    offline_ref: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    /**
     * The receipt's own barcode, printed on it so a return can be scanned.
     *
     * The invoice number itself cannot be the barcode: INV-20260930-0001 has
     * letters and hyphens, and EAN-13 — the symbology every other label in
     * this shop already uses, and the only one these scanners are guaranteed
     * to read without reconfiguring them — carries digits alone.
     *
     * So the sale carries a thirteen-digit handle of its own, stored and
     * indexed rather than worked back out of the invoice number, which means
     * the invoice format can change without every printed receipt going dead.
     *
     * Sparse, because every sale written before this existed has none.
     */
    receipt_barcode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
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
    /**
     * Set when the sale was paid in against a field dispatch sheet, so takings
     * from the field can be traced back to the agent who carried the goods.
     * Empty for an ordinary sale at the till.
     */
    dispatch_ref: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    /**
     * Set when the sale was work done rather than goods sold — a repair, an
     * installation, a call-out. It counts in the takings like any other sale;
     * this only says where it came from.
     */
    service_ref: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    /**
     * Set when the sale was written from a printed receipt form — a receipt
     * made out by hand at the counter rather than rung through the till.
     */
    form_ref: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    /**
     * Set when the sale came from a Pay & Pick Later plan being collected.
     * The money arrived in instalments over weeks; the sale is recorded when
     * the goods actually leave, which is the point the shop has earned it.
     */
    layaway_ref: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
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

/**
 * Every sale gets its receipt barcode, whoever wrote it.
 *
 * Minting it in the one helper that most sales go through left the others
 * without one — a debt payment written straight to the collection, a sale
 * arriving from a till that queued it offline — and a receipt with no barcode
 * cannot be scanned at the refund screen. So it is done here instead, where
 * nothing can go round it.
 *
 * pre('validate') rather than pre('save'): validation is mongoose's first
 * save hook, so a field filled in pre('save') is one validation has already
 * decided was missing.
 *
 * A till that minted its own code offline keeps it — the slip in the
 * customer's hand carries that number, and it has to be the one stored.
 */
SaleSchema.pre('validate', async function assignReceiptBarcode() {
  if (this.receipt_barcode) return;
  try {
    const { nextFreeReceiptBarcode } = require('../utils/barcode');
    const code = await nextFreeReceiptBarcode(this.constructor);
    if (code) this.receipt_barcode = code;
  } catch (err) {
    // A sale must never be lost over a barcode. Without one the receipt still
    // prints and the invoice number still finds it.
    console.error('Receipt barcode mint failed:', err.message);
  }
});

/**
 * Remember whoever left a number.
 *
 * On the sale rather than in the till code, for the same reason the receipt
 * barcode is: there are a dozen ways a sale gets written — the counter, a
 * short payment, a queued offline sale syncing, a quotation accepted — and a
 * contact book that depends on each of them remembering is a contact book
 * with holes in it.
 *
 * post('save') and not pre: a customer is only worth recording once the sale
 * they came from is actually on the books. It also runs detached, because
 * nothing about a contact is worth failing a sale over.
 */
SaleSchema.post('save', function rememberCustomer(doc) {
  if (!doc?.customer_phone) return;
  setImmediate(async () => {
    try {
      const { normaliseGhanaPhone } = require('../utils/phone');
      const phone = normaliseGhanaPhone(doc.customer_phone);
      // Not a number anybody could be messaged on, so not worth a row.
      if (!phone) return;

      const Contact = require('./Contact');
      const name = String(doc.customer_name || '').trim();
      const when = doc.sale_date || new Date();
      const spent = Number(doc.total_amount) || 0;

      await Contact.findOneAndUpdate(
        { phone },
        {
          $inc: { visits: 1, total_spent: spent },
          $max: { last_seen: when },
          $setOnInsert: { phone, first_seen: when },
          // A fuller name replaces a blank one; a blank never replaces a name.
          ...(name ? { $set: { name } } : {}),
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      // A sale is already written and must not be undone over a contact.
      console.error('Remember customer failed:', err.message);
    }
  });
});

SaleSchema.index({ user_id: 1, sale_date: -1 });
SaleSchema.index({ sale_date: -1 });
SaleSchema.index({ invoice_no: 1 });

module.exports = mongoose.model('Sale', SaleSchema);
