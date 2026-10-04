const mongoose = require('mongoose');

/**
 * A record that a scheduled job ran, and for which day.
 *
 * node-cron only fires while the process is awake. On Render's free plan the
 * service sleeps after a quarter of an hour with nobody using it, which is
 * exactly what the shop looks like at 11pm — so the nightly summary, the
 * overdue-debt sweep and the morning stock check mostly never ran at all.
 * Nothing said so; they simply did not happen.
 *
 * So the schedule is no longer the thing that decides. This is: a job is due
 * when its hour has passed today and there is no row here saying it already
 * ran. Whenever the service is awake — on a timer, at startup, or because
 * somebody opened the app — it catches up on whatever it missed.
 *
 * The unique index is the lock. Two instances, or a timer firing while a
 * request is already catching up, both try to insert the same row and only
 * one wins; the loser finds the row taken and leaves the job alone. Without
 * it, waking up would send the same summary twice.
 */
const JobRunSchema = new mongoose.Schema(
  {
    job: { type: String, required: true },
    /** The day this run was *for*, as YYYY-MM-DD, not when it happened. */
    run_for: { type: String, required: true },

    started_at: { type: Date, default: Date.now },
    finished_at: { type: Date },
    ok: { type: Boolean },
    /** Why it failed, or what it did. Kept short — this is a log, not a report. */
    message: { type: String, trim: true },
    /** True when it ran later than its hour, because the service was asleep. */
    caught_up: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One run per job per day, enforced by the database rather than by hoping.
JobRunSchema.index({ job: 1, run_for: 1 }, { unique: true });
JobRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model('JobRun', JobRunSchema);
