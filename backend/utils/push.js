const webpush = require('web-push');

/**
 * Push notifications to a phone, even when nobody has the app open.
 *
 * Configured entirely by environment — VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
 * and VAPID_SUBJECT. Without them push is simply off: the in-app bell still
 * works, nothing throws, and the shop is not blocked on a key it has not
 * generated yet.
 */
let ready = false;
let warned = false;

const publicKey = () => process.env.VAPID_PUBLIC_KEY || '';

const configure = () => {
  if (ready) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    if (!warned) {
      console.log('[push] VAPID keys not set — push notifications are off.');
      warned = true;
    }
    return false;
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@ittek.local', pub, priv
    );
    ready = true;
    return true;
  } catch (err) {
    console.error('[push] Bad VAPID keys:', err.message);
    return false;
  }
};

const isConfigured = () => configure();

/**
 * Send to every device on the list. Dead endpoints are removed rather than
 * retried — a browser that has been reinstalled will never answer again, and
 * keeping it means every future send pays for a failure.
 */
const sendToSubscriptions = async (subs, payload) => {
  if (!configure() || !subs?.length) return { sent: 0, gone: 0 };

  const PushSubscription = require('../models/PushSubscription');
  const body = JSON.stringify(payload);
  let sent = 0;
  const dead = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
        body,
        { TTL: 60 * 60 * 24 }
      );
      sent += 1;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.endpoint);
      else console.error('[push] send failed:', err?.statusCode || err?.message);
    }
  }));

  if (dead.length) {
    await PushSubscription.deleteMany({ endpoint: { $in: dead } }).catch(() => {});
  }
  return { sent, gone: dead.length };
};

/**
 * The same send, but reporting what the push service said about each device.
 *
 * "I get no notifications" has half a dozen causes that look identical from
 * the outside. This is what tells them apart: whether a device is registered
 * at all, whether the push service accepted it, and if not, what it objected
 * to.
 */
const sendWithReport = async (subs, payload) => {
  if (!configure()) {
    return { configured: false, devices: subs?.length || 0, sent: 0, results: [] };
  }
  const body = JSON.stringify(payload);
  const results = [];

  for (const s of subs || []) {
    const host = (() => {
      try { return new URL(s.endpoint).host; } catch { return 'unknown'; }
    })();
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
        body, { TTL: 60 }
      );
      results.push({ host, ok: true });
    } catch (err) {
      results.push({
        host,
        ok: false,
        status: err?.statusCode || null,
        reason: String(err?.body || err?.message || '').slice(0, 200),
      });
    }
  }

  return {
    configured: true,
    devices: subs?.length || 0,
    sent: results.filter((r) => r.ok).length,
    results,
  };
};

module.exports = { isConfigured, publicKey, sendToSubscriptions, sendWithReport };
