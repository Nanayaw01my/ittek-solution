const Notification = require('../models/Notification');
const User = require('../models/User');
const PushSubscription = require('../models/PushSubscription');
const { sendToSubscriptions } = require('./push');

/**
 * One place that tells somebody something.
 *
 * Before this, every controller wrote its own Notification row, which meant
 * the in-app bell was the only way anything reached anyone — and nobody is
 * watching a bell at nine in the evening. Everything now goes through here,
 * so adding the phone was one change rather than fifteen.
 *
 * The bell is written first and always. Push is best effort on top: a phone
 * that cannot be reached must never cost the shop the record that something
 * happened.
 */

// Defined once, in rbac, so that who counts as an owner cannot differ
// between who is told about something and who is allowed to do it. The COO
// is among them: an account that can approve a refund and never hears one
// was raised is an approval queue nobody is watching.
const { OWNER_ROLES } = require('../middleware/rbac');

const push = async (userIds, { title, message, link, tag }) => {
  try {
    if (!userIds.length) return;
    const subs = await PushSubscription.find({ user_id: { $in: userIds } }).lean();
    await sendToSubscriptions(subs, {
      title,
      body: message,
      link: link || '/notifications',
      // A second notification with the same tag replaces the first, so a busy
      // afternoon does not bury the phone under twenty identical lines.
      tag: tag || 'ittek',
    });
  } catch (err) {
    console.error('[notify] push failed:', err.message);
  }
};

/**
 * The notification's level, whatever the caller called it.
 *
 * The collection only accepts 'critical', 'important' or 'info', and callers
 * all over this code have been passing what the notification is *about* —
 * 'sale', 'refund_spike', 'rapid_sales', 'redeem'. Mongoose rejected every
 * one of those, the create threw, the caller's catch swallowed it, and the
 * alert simply never appeared. A fraud sweep that found something said
 * nothing.
 *
 * So anything unrecognised becomes 'info' rather than being thrown away. A
 * notification filed under the wrong heading is worth incomparably more than
 * a notification that does not exist.
 */
const LEVELS = ['critical', 'important', 'info'];
const levelFor = (type, fallback) => (LEVELS.includes(type) ? type : fallback);

/**
 * The owners — CEO and Super Admin.
 *
 * The bell row keeps user_id null, which is how every existing screen reads
 * "this is for the owners". The push has to go to real people, so the owners
 * are looked up for that part.
 */
const notifyOwners = async ({
  type = 'important', title, message, link, tag,
  // Bell only, no phone. For the routine business of a shop, which belongs on
  // the record but is not worth interrupting anybody for.
  silent = false,
  // Whoever did the thing does not need telling that they did it.
  exclude_user_id = null,
} = {}) => {
  const row = await Notification.create({
    user_id: null, type: levelFor(type, 'important'), title, message, link,
  });

  if (silent) return row;

  const where = { role: { $in: OWNER_ROLES }, is_active: { $ne: false } };
  if (exclude_user_id) where._id = { $ne: exclude_user_id };

  const owners = await User.find(where).select('_id').lean();
  await push(owners.map((o) => o._id), { title, message, link, tag });

  return row;
};

/** One named person, on the bell and on their phone. */
const notifyUser = async (userId, { type = 'info', title, message, link, tag }) => {
  if (!userId) return null;
  const row = await Notification.create({
    user_id: userId, type: levelFor(type, 'info'), title, message, link,
  });
  await push([userId], { title, message, link, tag });
  return row;
};

module.exports = { notifyOwners, notifyUser, OWNER_ROLES };
