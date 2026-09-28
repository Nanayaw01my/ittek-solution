const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const PushSubscription = require('../models/PushSubscription');
const { isConfigured, publicKey } = require('../utils/push');

router.use(authenticate);

/**
 * The key the browser needs before it can subscribe.
 *
 * When it is not set up, it says which variables are missing by name. Only
 * the names — never a value — because "push is not configured" with no way to
 * see which of three variables is absent is a afternoon of guessing.
 */
router.get('/public-key', (req, res) => {
  const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
    .filter((k) => !process.env[k]);
  return res.status(200).json({
    success: true,
    data: {
      key: publicKey(),
      enabled: isConfigured(),
      missing,
      subject_set: !!process.env.VAPID_SUBJECT,
    },
  });
});

/** This device would like to be told things. */
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, message: 'Incomplete subscription.' });
    }

    // Keyed on the endpoint, so re-subscribing on the same device updates the
    // row instead of leaving a stale one behind to be pushed to for ever.
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user_id: req.user._id,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        user_agent: (req.get('user-agent') || '').slice(0, 200),
        last_used_at: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, message: 'This device will be notified.' });
  } catch (err) {
    console.error('Push subscribe error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not subscribe.' });
  }
});

router.delete('/subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) await PushSubscription.deleteOne({ endpoint });
    else await PushSubscription.deleteMany({ user_id: req.user._id });
    return res.status(200).json({ success: true, message: 'Notifications turned off.' });
  } catch (err) {
    console.error('Push unsubscribe error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not unsubscribe.' });
  }
});

/** What this account currently has switched on, for the settings screen. */
router.get('/devices', async (req, res) => {
  try {
    const devices = await PushSubscription.find({ user_id: req.user._id })
      .select('user_agent createdAt last_used_at').sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: { devices, enabled: isConfigured() } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
