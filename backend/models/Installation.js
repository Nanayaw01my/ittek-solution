const mongoose = require('mongoose');

/**
 * A job to go out and fit something.
 *
 * The shop sells panels and inverters, which means somebody has to carry them
 * to a house and put them up. None of that was anywhere in the system: who is
 * fitting what, where, on Thursday, and whether last Thursday's job was ever
 * finished all lived in somebody's head or on a phone. A customer ringing to
 * ask when the team is coming could not be answered from the screen.
 *
 * Deliberately not tied to a sale. Plenty of jobs are a repair, a relocation
 * or a survey with nothing sold against them, and a model that insists on an
 * invoice would push exactly those jobs back onto the phone it came from.
 */
const InstallationSchema = new mongoose.Schema(
  {
    reference: { type: String, unique: true, required: true, index: true },

    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, trim: true, index: true },
    /** Where the team is actually going. The whole job hinges on this. */
    location: { type: String, required: true, trim: true },

    /** What is being done, in the words the team needs to read on the day. */
    work: { type: String, required: true, trim: true },

    /** The sale it came from, when there is one. */
    sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    invoice_ref: { type: String, trim: true },

    scheduled_for: { type: Date, required: true, index: true },
    /** 'morning' | 'afternoon' | '' — finer than a date, cheaper than a time. */
    slot: { type: String, enum: ['', 'morning', 'afternoon'], default: '' },

    /**
     * Who is going. A list, because a panel installation is rarely one
     * person, and a job with nobody on it is a job nobody has agreed to do.
     */
    assigned_to: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    status: {
      type: String,
      enum: ['scheduled', 'in_progress', 'done', 'cancelled'],
      default: 'scheduled',
      index: true,
    },

    notes: { type: String, trim: true },
    /** Why it did not happen, when it did not. */
    outcome: { type: String, trim: true },

    started_at: { type: Date },
    completed_at: { type: Date },
    completed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// The two questions the screen asks: what is on for a given day, and what is
// still outstanding.
InstallationSchema.index({ scheduled_for: 1, status: 1 });
InstallationSchema.index({ assigned_to: 1, scheduled_for: 1 });

/** Overdue means the day has passed and nobody has closed it. */
InstallationSchema.methods.isOverdue = function isOverdue(on = new Date()) {
  if (['done', 'cancelled'].includes(this.status)) return false;
  const day = new Date(this.scheduled_for);
  day.setHours(23, 59, 59, 999);
  return day < on;
};

module.exports = mongoose.model('Installation', InstallationSchema);
