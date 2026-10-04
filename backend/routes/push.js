const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const PushSubscription = require('../models/PushSubscription');
const { isConfigured, publicKey, sendWithReport } = require('../utils/push');

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

/**
 * POST /api/push/test — send one to whoever is asking, and say what happened.
 */
router.post('/test', async (req, res) => {
  try {
    if (!isConfigured()) {
      const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
        .filter((k) => !process.env[k]);
      return res.status(200).json({
        success: true,
        data: {
          ok: false,
          stage: 'server',
          message: missing.length
            ? `The server is missing ${missing.join(' and ')}.`
            : 'Push is not configured on the server.',
        },
      });
    }

    const subs = await PushSubscription.find({ user_id: req.user._id }).lean();
    if (subs.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          ok: false,
          stage: 'device',
          message: 'This account has no device registered. Press "Turn on" first, '
            + 'on the phone you want notified.',
        },
      });
    }

    const report = await sendWithReport(subs, {
      title: 'ITTEK — test',
      body: 'If you can see this, notifications are working.',
      link: '/notifications',
      tag: 'test',
    });

    // Push working and "nothing ever notifies me" are both true at once when
    // the CEO is testing on his own account. Say so here rather than leaving
    // somebody to conclude the whole thing is broken.
    const notes = [];
    try {
      const Settings = require('../models/Settings');
      const User = require('../models/User');
      const { ROLE_LEVELS } = require('../config/pageAccess');

      const s = await Settings.findOne().select('notification_settings').lean();
      const level = s?.notification_settings?.activity_alerts || 'important';

      if (level === 'off') {
        notes.push('Activity alerts are switched off in Settings, so nothing staff do will reach you.');
      } else if (level === 'important') {
        notes.push('Only notable actions reach your phone — deletions, refunds, stock corrections, '
          + 'user changes. Ordinary sales and edits stay in the app. Change this in Settings.');
      }

      if ((ROLE_LEVELS[req.user.role] || 0) >= 3) {
        const others = await User.countDocuments({
          role: { $in: require('../middleware/rbac').OWNER_ROLES },
          is_active: { $ne: false },
          _id: { $ne: req.user._id },
        });
        notes.push(others === 0
          ? 'You are the only owner, and your own actions never notify you — so testing by '
            + 'doing things yourself will show nothing. Have a member of staff do something.'
          : 'Your own actions never notify you, only other people\'s.');
      }
    } catch { /* the test still reports what it did */ }

    const failed = report.results.filter((r) => !r.ok);
    return res.status(200).json({
      success: true,
      data: {
        ok: report.sent > 0,
        stage: report.sent > 0 ? 'sent' : 'push-service',
        message: report.sent > 0
          ? `Sent to ${report.sent} of ${report.devices} device${report.devices === 1 ? '' : 's'}.`
          // The status is often absent when the subscription itself is
          // malformed, and "said ?" helps nobody — the reason does.
          : `The push service refused it: ${failed
            .map((f) => `${f.host} — ${f.status || f.reason || 'no reason given'}`)
            .join('; ')}`,
        devices: report.devices,
        sent: report.sent,
        results: report.results,
        notes,
      },
    });
  } catch (err) {
    console.error('Push test error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
