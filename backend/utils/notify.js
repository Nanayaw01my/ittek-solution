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

const OWNER_ROLES = ['CEO', 'Super Admin'];

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
 * The owners — CEO and Super Admin.
 *
 * The bell row keeps user_id null, which is how every existing screen reads
 * "this is for the owners". The push has to go to real people, so the owners
 * are looked up for that part.
 */
const notifyOwners = async ({ type = 'important', title, message, link, tag }) => {
  const row = await Notification.create({
    user_id: null, type, title, message, link,
  });

  const owners = await User.find({ role: { $in: OWNER_ROLES }, is_active: { $ne: false } })
    .select('_id').lean();
  await push(owners.map((o) => o._id), { title, message, link, tag });

  return row;
};

/** One named person, on the bell and on their phone. */
const notifyUser = async (userId, { type = 'info', title, message, link, tag }) => {
  if (!userId) return null;
  const row = await Notification.create({ user_id: userId, type, title, message, link });
  await push([userId], { title, message, link, tag });
  return row;
};

module.exports = { notifyOwners, notifyUser, OWNER_ROLES };
