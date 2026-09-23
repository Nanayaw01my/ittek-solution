const mongoose = require('mongoose');

/**
 * Money taken for work done rather than goods sold — a repair, an
 * installation, a call-out.
 *
 * It writes a Sale of its own, so the money lands in the day's takings and on
 * every sales report exactly like a sale over the counter, and the ordinary
 * thermal receipt prints for it. This record holds what a Sale has nowhere to
 * put: where the job was and what the work actually was.
 */
const ServiceChargeSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },

    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, trim: true },
    location: { type: String, trim: true },

    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    payment_method: {
      type: String,
      enum: ['cash', 'card', 'mobile_money'],
      default: 'cash',
    },
    reference_no: { type: String, trim: true },

    // The sale this charge produced, so the receipt can be reprinted and the
    // takings traced back to the job.
    sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    invoice_no: { type: String, trim: true },

    recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    charged_at: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

ServiceChargeSchema.index({ charged_at: -1 });
ServiceChargeSchema.index({ customer_phone: 1 });

module.exports = mongoose.model('ServiceCharge', ServiceChargeSchema);
