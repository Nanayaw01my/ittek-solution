const mongoose = require('mongoose');

/**
 * A DSR — goods handed to a sales representative going out on the field.
 *
 * This is a stock MOVEMENT, not a sale. The goods leave the shop, so stock is
 * deducted when the sheet is issued, but nothing is written to the sales book
 * and no money is recorded. When the agent comes back, whatever they did not
 * sell is entered as a return and goes straight back on the shelf. The
 * difference between what went out and what came back is what they sold on the
 * field, and that is rung up at the till in the normal way.
 */
const DispatchItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_name: { type: String, required: true },
    variant_sku: { type: String },
    variant_name: { type: String },
    barcode: { type: String },
    quantity_issued: { type: Number, required: true, min: 1 },
    quantity_returned: { type: Number, default: 0, min: 0 },
    // Paid for through the Pay button on this sheet. Those pieces are gone for
    // good and DO count as a sale; returned ones came back on the shelf.
    quantity_sold: { type: Number, default: 0, min: 0 },
    unit_price: { type: Number, default: 0 },
    // Carried from the product when the sheet is issued. A sale line requires
    // it, and the profit on a field sale must be worked out against what the
    // goods cost when they left the shop, not what they cost weeks later.
    cost_price: { type: Number, default: 0 },
  },
  { _id: false }
);

const DispatchSchema = new mongoose.Schema(
  {
    dispatch_no: { type: String, required: true, unique: true, trim: true },
    agent_name: { type: String, required: true, trim: true },
    agent_phone: { type: String, trim: true },
    // Set when the agent is also a system user; free-text agent_name covers
    // the field hands who are not.
    agent_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    destination: { type: String, trim: true },
    notes: { type: String, trim: true },
    items: [DispatchItemSchema],
    // Every payment taken against this sheet, so the dispatch record shows
    // which invoices came out of it.
    sales: [
      {
        sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
        invoice_no: { type: String },
        amount: { type: Number, default: 0 },
        customer_name: { type: String },
        paid_at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    status: {
      type: String,
      enum: ['issued', 'partly_returned', 'closed'],
      default: 'issued',
    },
    issued_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issued_at: { type: Date, default: Date.now },
    closed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closed_at: { type: Date },
  },
  { timestamps: true }
);

DispatchSchema.index({ status: 1, issued_at: -1 });
DispatchSchema.index({ agent_name: 1 });

/** Total pieces still out with the agent — neither sold nor brought back. */
DispatchSchema.methods.outstanding = function outstanding() {
  return this.items.reduce(
    (sum, i) => sum + Math.max(
      0,
      i.quantity_issued - (i.quantity_returned || 0) - (i.quantity_sold || 0)
    ),
    0
  );
};

/** Money taken against this sheet. */
DispatchSchema.methods.soldValue = function soldValue() {
  return this.items.reduce((sum, i) => sum + (i.quantity_sold || 0) * (i.unit_price || 0), 0);
};

module.exports = mongoose.model('Dispatch', DispatchSchema);
