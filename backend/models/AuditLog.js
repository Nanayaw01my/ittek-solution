const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      enum: [
        'device_lock',
        'device_unlock',
        'payment_made',
        'customer_registered',
        'staff_added',
        'password_reset',
        'customer_updated',
        'device_added',
        'device_updated',
        'staff_updated',
        'staff_deleted',
        'customer_deleted',
        'device_deleted',
        'installment_completed',
        'installment_defaulted',
        'manual_payment',
      ],
      required: true,
    },
    device_udid: {
      type: String,
      trim: true,
    },
    target_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    ip_address: {
      type: String,
      trim: true,
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

// Index for efficient queries
AuditLogSchema.index({ user_id: 1, created_at: -1 });
AuditLogSchema.index({ action: 1, created_at: -1 });
AuditLogSchema.index({ target_user_id: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
