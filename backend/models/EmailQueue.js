const mongoose = require('mongoose');

const EmailQueueSchema = new mongoose.Schema(
  {
    to_email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    to_name: {
      type: String,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String, // HTML content
      required: true,
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'normal'],
      default: 'normal',
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    retry_count: {
      type: Number,
      default: 0,
    },
    error_message: {
      type: String,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    sent_at: {
      type: Date,
    },
  },
  {
    timestamps: false,
  }
);

EmailQueueSchema.index({ status: 1, priority: 1, created_at: 1 });
// Auto-delete sent/failed emails after 30 days
EmailQueueSchema.index({ sent_at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { status: { $in: ['sent', 'failed'] } } });

module.exports = mongoose.model('EmailQueue', EmailQueueSchema);
