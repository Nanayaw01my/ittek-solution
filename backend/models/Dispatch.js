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
    unit_price: { type: Number, default: 0 },
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

/** Total pieces still out with the agent. */
DispatchSchema.methods.outstanding = function outstanding() {
  return this.items.reduce(
    (sum, i) => sum + Math.max(0, i.quantity_issued - (i.quantity_returned || 0)),
    0
  );
};

module.exports = mongoose.model('Dispatch', DispatchSchema);
