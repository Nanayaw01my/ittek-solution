const Notification = require('../models/Notification');

/**
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Get notifications for this user OR broadcast (null)
    const filter = {
      $or: [{ user_id: req.user._id }, { user_id: null }],
    };

    const [notifications, total, unread_count] = await Promise.all([
      Notification.find(filter)
        .sort({ is_read: 1, created_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, is_read: false }),
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
      unread_count,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get notifications error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      $or: [{ user_id: req.user._id }, { user_id: null }],
      is_read: false,
    });
    return res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    console.error('Unread count error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/notifications/:id/read
 */
const markRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { is_read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.status(200).json({ success: true, message: 'Marked as read.', data: notification });
  } catch (err) {
    console.error('Mark read error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/notifications/read-all
 */
const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { $or: [{ user_id: req.user._id }, { user_id: null }], is_read: false },
      { $set: { is_read: true } }
    );
    return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Mark all read error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.status(200).json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    console.error('Delete notification error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getNotifications, getUnreadCount, markRead, markAllRead, deleteNotification };
