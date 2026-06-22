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
NotificationSchema.index({ type: 1, created_at: -1 });
// Auto-delete notifications older than 60 days
NotificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', NotificationSchema);
