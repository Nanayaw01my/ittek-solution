const Notification = require('../models/Notification');
const User = require('../models/User');
const { isOwner, ROLE_LEVELS } = require('../middleware/rbac');

/**
 * Which notifications belong to this person.
 *
 * A row with no user_id is not "for everybody" — it is for the owners.
 * Every place in the system that writes one means it that way: a new
 * sale, a refund waiting for approval, a debt, a complaint raised
 * against the shop, a stock request, a credit agreement. notifyOwners()
 * in utils/notify.js says so outright, and sends the matching phone
 * alert to OWNER_ROLES and nobody else.
 *
 * The bell read those rows as a broadcast to all staff. So a sales
 * attendant's notifications were the owners' notifications: every
 * refund, every debt, every complaint, and the value of every large
 * sale in the shop. Nobody noticed while the screen was showing an
 * empty list to everyone; the moment it started working, the whole
 * shop could suddenly read the office's post.
 *
 * A message addressed to named people has a real user_id, so it was
 * never the thing leaking — but it arrived in a bell already full of
 * rows everyone could see, which is indistinguishable from a message
 * that went to everybody.
 */
const visibleTo = (user) => (isOwner(user.role)
  ? { $or: [{ user_id: user._id }, { user_id: null }] }
  : { user_id: user._id });

/**
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = visibleTo(req.user);

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
      ...visibleTo(req.user),
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
    /**
     * Yours, or everybody's — not somebody else's.
     *
     * This looked the notification up by its id alone. That was nearly
     * harmless while every notification was either addressed to you or
     * broadcast to all, and stopped being harmless the moment an owner
     * could write a private message to one person: anybody holding an id
     * could clear somebody else's message, and the person it was for
     * would never see it unread.
     */
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...visibleTo(req.user) },
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
      { ...visibleTo(req.user), is_read: false },
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
    // Scoped for the same reason as markRead above: deleting is worse
    // than marking read, since the message is gone before the person it
    // was addressed to has seen it at all.
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      ...visibleTo(req.user),
    });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.status(200).json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    console.error('Delete notification error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/notifications/message
 *
 * An owner writing to the staff.
 *
 * One notification per recipient rather than a single broadcast row, which
 * is what the system already does for its own alerts by setting user_id to
 * null. That shortcut cannot work here: is_read lives on the document, so
 * one shared row means the first person to open a message marks it read
 * for everybody, and the message the shop most wanted read is the one
 * nobody else ever sees. A row each costs a handful of small documents and
 * buys a message that is read, and seen to be read, person by person.
 */
const sendMessage = async (req, res) => {
  try {
    if (!isOwner(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only an owner can send a message.' });
    }

    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'Give the message a heading.' });
    if (!message) return res.status(400).json({ success: false, message: 'The message is empty.' });

    const audience = ['everyone', 'roles', 'people'].includes(req.body?.audience)
      ? req.body.audience : 'everyone';
    const type = ['critical', 'important', 'info'].includes(req.body?.type) ? req.body.type : 'info';

    const filter = { is_active: true };
    if (audience === 'roles') {
      const roles = (Array.isArray(req.body?.roles) ? req.body.roles : [])
        .filter((r) => Object.keys(ROLE_LEVELS).includes(r));
      if (roles.length === 0) {
        return res.status(400).json({ success: false, message: 'Pick at least one role.' });
      }
      filter.role = { $in: roles };
    } else if (audience === 'people') {
      const ids = (Array.isArray(req.body?.user_ids) ? req.body.user_ids : []).filter(Boolean);
      if (ids.length === 0) {
        return res.status(400).json({ success: false, message: 'Pick at least one person.' });
      }
      filter._id = { $in: ids };
    }

    const recipients = await User.find(filter).select('_id username').lean();
    /**
     * The sender is left off their own message.
     *
     * Writing to "everyone" and then finding it in your own bell is a
     * small thing that makes the feature feel broken, and an owner knows
     * what they just wrote.
     */
    const targets = recipients.filter((u) => String(u._id) !== String(req.user._id));

    if (targets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nobody would receive that — the only match was you.',
      });
    }

    await Notification.insertMany(targets.map((u) => ({
      user_id: u._id,
      type,
      title,
      message,
      is_message: true,
      from_user_id: req.user._id,
      from_name: req.user.username,
      created_at: new Date(),
    })));

    return res.status(201).json({
      success: true,
      data: {
        sent_to: targets.length,
        names: targets.slice(0, 8).map((u) => u.username),
        /**
         * Who it went to, by name, not just how many.
         *
         * "Sent to 3 people" is only reassuring if you already trust
         * the thing that said it. Naming them lets the sender see at a
         * glance that their message went where they aimed it — which
         * is the one question an owner has after pressing Send.
         */
        message: (() => {
          const names = targets.map((u) => u.username);
          const head = names.slice(0, 5).join(', ');
          const rest = names.length - 5;
          return names.length === 1
            ? `Sent to ${head}.`
            : `Sent to ${names.length} people: ${head}${rest > 0 ? ` and ${rest} more` : ''}.`;
        })(),
      },
    });
  } catch (err) {
    console.error('Send message error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/notifications/recipients
 *
 * Who a message can be addressed to: names and roles, nothing else about
 * the accounts.
 */
const getRecipients = async (req, res) => {
  try {
    if (!isOwner(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only an owner can send a message.' });
    }
    const users = await User.find({ is_active: true, _id: { $ne: req.user._id } })
      .select('username role')
      .sort({ role: 1, username: 1 })
      .lean();
    return res.status(200).json({ success: true, data: users });
  } catch (err) {
    console.error('Get recipients error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getNotifications, getUnreadCount, markRead, markAllRead, deleteNotification,
  sendMessage, getRecipients,
};
