const AuditLog = require('../models/AuditLog');

/**
 * GET /api/audit-logs
 */
const getAuditLogs = async (req, res) => {
  try {
    const { user_id, action, startDate, endDate, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    // CEO cannot see Super Admin logs
    if (req.user.role === 'CEO') {
      filter.role = { $ne: 'Super Admin' };
    }

    if (user_id) filter.user_id = user_id;
    if (action) filter.action = { $regex: action, $options: 'i' };

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { ip_address: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user_id', 'username email role')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get audit logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getAuditLogs };
