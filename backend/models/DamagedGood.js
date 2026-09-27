const mongoose = require('mongoose');

/**
 * Stock that will never be sold — a phone that came in faulty, a panel
 * cracked in the van, a battery that swelled on the shelf.
 *
 * Writing one down takes the item off stock, because a count that still
 * includes a broken panel is a count that will sell it. What it deliberately
 * does NOT do is write an expense: the money left the business when the goods
 * were bought, and booking it again the day they break would charge the shop
 * twice for one loss. The cost is recorded here instead, so the damage can be
 * totalled and read against the month without double-counting it.
 */
const DamagedGoodSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },

    // The catalogue item, where there is one. A damaged thing that was never
    // on the books still gets written down — by name.
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },

    /** What is wrong with it, kept short so the list can be read at a glance. */
    fault: {
      type: String,
      enum: ['faulty', 'damaged', 'expired', 'missing', 'other'],
      default: 'damaged',
      required: true,
    },
    description: { type: String, trim: true },

    // What it cost the shop, per unit and in total, frozen at the moment it
    // was written off — the cost price can move afterwards.
    unit_cost: { type: Number, default: 0, min: 0 },
    total_cost: { type: Number, default: 0, min: 0 },

    /**
     * pending    — written down, nobody has decided what happens to it
     * returned   — went back to the supplier
     * replaced   — the supplier sent another one
     * written_off— the shop swallowed the loss
     */
    outcome: {
      type: String,
      enum: ['pending', 'returned', 'replaced', 'written_off'],
      default: 'pending',
      required: true,
    },
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    outcome_note: { type: String, trim: true },

    // Whether the stock deduction actually happened, so deleting the record
    // knows whether to put the goods back.
    stock_deducted: { type: Boolean, default: false },

    reported_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reported_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DamagedGoodSchema.index({ reported_at: -1 });
DamagedGoodSchema.index({ outcome: 1, reported_at: -1 });
DamagedGoodSchema.index({ product_id: 1 });

DamagedGoodSchema.pre('save', function cost(next) {
  this.total_cost = Number(((this.unit_cost || 0) * (this.quantity || 0)).toFixed(2));
  next();
});

module.exports = mongoose.model('DamagedGood', DamagedGoodSchema);
