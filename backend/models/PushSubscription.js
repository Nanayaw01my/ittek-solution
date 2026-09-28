const mongoose = require('mongoose');

/**
 * A device that has agreed to receive push notifications.
 *
 * One person can have several — the phone, the tablet at the counter, a
 * laptop — and each is a separate subscription with its own endpoint, so the
 * CEO's phone buzzing does not depend on which device they last used.
 *
 * Endpoints go stale: a browser reinstalled, notifications turned off, an app
 * removed from a phone. The push service answers 404 or 410 for those, and
 * the sender deletes them rather than retrying something that can never work
 * again.
 */
const PushSubscriptionSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // Only to tell one device from another on screen.
    user_agent: { type: String, trim: true },
    last_used_at: { type: Date },
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ user_id: 1 });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
