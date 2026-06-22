const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, trim: true },
    role:     { type: String, trim: true },
    action:   { type: String, required: true, trim: true, uppercase: true },
    status:   { type: String, enum: ['success', 'failure'], default: 'success' },
    details:  {
      type: new mongoose.Schema({
        params:    { type: mongoose.Schema.Types.Mixed },
        body_keys: [String],
        error:     { type: String },
        extra:     { type: mongoose.Schema.Types.Mixed },
      }, { _id: false, strict: false }),
    },
    request_id: { type: String },
    ip_address: { type: String, trim: true },
    timestamp:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

AuditLogSchema.index({ user_id: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ role: 1, timestamp: -1 });
AuditLogSchema.index({ status: 1, timestamp: -1 });
// Auto-delete logs older than 90 days
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

