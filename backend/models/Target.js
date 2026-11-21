const mongoose = require('mongoose');

/**
 * What a side of the business is aiming for in a month, and how far
 * along it is.
 *
 * Counted in jobs rather than cedis — installations, sites, call-outs —
 * because that is how the shop talks about the work its departments do.
 * Money is already reported per department on the owners' dashboard,
 * worked out from the till; this is the other half, the work itself,
 * which the till cannot see.
 *
 * One row per department per month. Two sources may write it: an owner
 * typing it on the Targets screen, and the IT department's own system
 * pushing it over the API. Which of them last touched each figure is
 * recorded, because a number nobody can account for is worse than no
 * number at all.
 */

const TargetSchema = new mongoose.Schema(
  {
    /**
     * The side of the business, as the rest of the system names them:
     * solar, networking (which the shop calls IT), electrical.
     *
     * Kept as a free string rather than an enum so a department the
     * shop invents next year does not need a deployment — the routes
     * check it against the known list, and an unknown one is refused
     * there with a message that says which are allowed.
     */
    department: { type: String, required: true, trim: true, lowercase: true },

    /** The month this is for. Stored as two numbers, not a date: a
     *  target belongs to November, not to a moment in it. */
    year: { type: Number, required: true, min: 2020, max: 2100 },
    month: { type: Number, required: true, min: 1, max: 12 },

    /** What is being counted — "installations", "sites", "call-outs". */
    unit: { type: String, trim: true, default: 'jobs' },

    /**
     * The goal in cedis — what this side of the business is to bring in
     * this month. The shop gives each head of department GH₵70,000,
     * and asks how far along they are as a percentage of it.
     *
     * Progress against this is NOT stored. It is worked out from the
     * shop's own sales every time the screen is opened, because a
     * figure somebody has to keep updating by hand is out of date by
     * Wednesday.
     */
    target_amount: { type: Number, default: null, min: 0 },

    /**
     * The older goal, counted in jobs rather than cedis. Kept because
     * rows already exist with it, and because a count is still the
     * right unit for some work — but the screen now leads with money.
     */
    target: { type: Number, required: true, min: 0, default: 0 },

    /**
     * How many are done.
     *
     * Null is not zero. A department that has not reported yet and one
     * that has genuinely done nothing are different facts, and showing
     * the first as 0% would have an owner chasing a department that is
     * simply quiet about its paperwork.
     */
    achieved: { type: Number, default: null, min: 0 },

    note: { type: String, trim: true, default: '' },

    /**
     * Who last wrote each half, and when.
     *
     * The target and the progress are routinely set by different
     * hands — an owner sets the goal, the department's own system
     * reports against it — so one "last updated by" would be a lie
     * about whichever of the two it did not describe.
     */
    target_source: { type: String, enum: ['app', 'api'], default: 'app' },
    target_set_by: { type: String, trim: true, default: '' },
    target_set_at: { type: Date, default: Date.now },

    achieved_source: { type: String, enum: ['app', 'api', null], default: null },
    achieved_set_by: { type: String, trim: true, default: '' },
    achieved_set_at: { type: Date, default: null },

    created_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/** One row per department per month, enforced by the database. */
TargetSchema.index({ department: 1, year: 1, month: 1 }, { unique: true });
TargetSchema.index({ year: -1, month: -1 });

/**
 * How far along, as a percentage, or null when nothing was reported.
 *
 * Null rather than 0 for the same reason `achieved` is: a department
 * that has not said anything has not said it is at nothing.
 */
TargetSchema.statics.progressOf = function progressOf(row) {
  if (!row || row.achieved === null || row.achieved === undefined) return null;
  if (!row.target) return row.achieved > 0 ? 100 : 0;
  return Math.round((row.achieved / row.target) * 100);
};

module.exports = mongoose.model('Target', TargetSchema);
