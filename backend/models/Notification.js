const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = broadcast to all
    },
    type: {
      type: String,
      enum: ['critical', 'important', 'info'],
      default: 'info',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String, // URL to navigate to
    },

    /**
     * A message written by an owner, rather than something the system
     * noticed.
     *
     * Kept apart so the two read differently on screen: "Kofi gave a 22%
     * discount" is the system reporting, and "Shop closes at 4 on Friday"
     * is a person speaking. A staff member should be able to tell at a
     * glance which they are looking at.
     */
    is_message: { type: Boolean, default: false },
    from_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    from_name: { type: String, trim: true },
    is_read: {
      type: Boolean,
      default: false,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

NotificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
