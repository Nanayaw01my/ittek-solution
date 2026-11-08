const mongoose = require('mongoose');

/**
 * Something that went wrong, written down by whoever heard about it.
 *
 * A customer complains at the counter and the attendant tells a manager, who
 * tells somebody else, and by the end of the week nobody can say how many
 * complaints there were or whether any of them were settled. This is the
 * place to put it at the moment it happens, by the person it happened to.
 *
 * Deliberately not a workflow. A complaint is raised, somebody deals with it
 * and says what they did. A shop this size does not need more than that, and
 * anything more is a form nobody fills in.
 */
const ComplaintSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    detail: { type: String, required: true, trim: true },

    /** Who was unhappy. A staff complaint leaves the customer blank. */
    customer_name: { type: String, trim: true },
    customer_phone: { type: String, trim: true },

    /**
     * What it was about, for counting later: faulty goods, a wait, a price,
     * a delivery that did not come. Free text, because the shop will think
     * of a kind nobody listed.
     */
    about: { type: String, trim: true },

    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },

    resolution: { type: String, trim: true },
    resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolved_at: { type: Date },

    raised_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ComplaintSchema.index({ status: 1, createdAt: -1 });
ComplaintSchema.index({ raised_by: 1, createdAt: -1 });

module.exports = mongoose.model('Complaint', ComplaintSchema);
