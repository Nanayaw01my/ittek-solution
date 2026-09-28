const mongoose = require('mongoose');

/**
 * A packages receipt waiting on the CEO.
 *
 * Printing one takes money and stock — it writes a sale, and a balance
 * becomes a debt — so it is the one document in the shop that an owner wanted
 * to see before it leaves the counter.
 *
 * The whole request body is kept as submitted. Approving is agreement to that
 * exact sheet: if the payload could be edited after approval, the approval
 * would mean nothing.
 */
const ReceiptApprovalSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },

    // Exactly what will be printed, frozen at submission.
    payload: { type: mongoose.Schema.Types.Mixed, required: true },

    // Pulled out of the payload so a list can be read without unpacking it.
    customer_name: { type: String, trim: true },
    customer_phone: { type: String, trim: true },
    item_count: { type: Number, default: 0 },
    grand_total: { type: Number, default: 0 },
    amount_paid: { type: Number, default: 0 },
    balance_due: { type: Number, default: 0 },
    takes_stock: { type: Boolean, default: false },

    /**
     * pending  — the owner has not looked at it
     * approved — agreed; it may be printed
     * rejected — turned down, with a reason
     * used     — printed, and the money recorded. A reprint is still allowed,
     *            but it records nothing a second time.
     */
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'used'],
      default: 'pending',
      required: true,
    },

    requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requested_at: { type: Date, default: Date.now },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    rejection_reason: { type: String, trim: true },

    invoice_no: { type: String, trim: true },
    printed_at: { type: Date },
  },
  { timestamps: true }
);

ReceiptApprovalSchema.index({ status: 1, requested_at: -1 });
ReceiptApprovalSchema.index({ requested_by: 1, requested_at: -1 });

module.exports = mongoose.model('ReceiptApproval', ReceiptApprovalSchema);
