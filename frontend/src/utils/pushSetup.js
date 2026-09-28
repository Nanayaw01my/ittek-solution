import { getPushKey, subscribePush, unsubscribePush } from '../api/push'

/**
 * Turning on notifications for this device.
 *
 * Push is the only way the shop reaches somebody who does not have the app
 * open, which is the whole point for a CEO who is not at the counter. It
 * needs three things to line up — a service worker, permission, and VAPID
 * keys on the server — and each can be missing for its own reason, so each
 * gets its own answer rather than a single "failed".
 *
 * On iPhone it only works once the app has been added to the Home Screen.
 * That is Apple's rule, not something the code can work around, so it is
 * detected and said plainly.
 */

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const pushState = () => {
  if (!pushSupported()) {
    return {
      ok: false,
      reason: isIos() && !isStandalone()
        ? 'On iPhone, add ITTEK to your Home Screen first — then notifications can be turned on.'
        : 'This browser cannot show notifications.',
    }
  }
  return { ok: true, permission: Notification.permission }
}

/** Ask, subscribe, and tell the server. Returns a plain outcome, never throws. */
export const enablePush = async () => {
  const state = pushState()
  if (!state.ok) return { ok: false, message: state.reason }

  try {
    const { data } = await getPushKey()
    if (!data?.enabled || !data?.key) {
      return {
        ok: false,
        message: 'Push is not set up on the server yet (VAPID keys are missing).',
      }
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return {
        ok: false,
        message: permission === 'denied'
          ? 'Notifications are blocked for this site. Turn them back on in the browser settings.'
          : 'Notifications were not allowed.',
      }
    }

    const reg = await navigator.serviceWorker.ready
    // An existing subscription made against a different key would be rejected
    // by the push service, so it is replaced rather than reused.
    const existing = await reg.pushManager.getSubscription()
    if (existing) await existing.unsubscribe().catch(() => {})

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.key),
    })

    await subscribePush(JSON.parse(JSON.stringify(sub)))
    return { ok: true, message: 'This device will now be notified.' }
  } catch (err) {
    return { ok: false, message: err?.message || 'Could not turn notifications on.' }
  }
}

export const disablePush = async () => {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await unsubscribePush(sub.endpoint).catch(() => {})
      await sub.unsubscribe().catch(() => {})
    }
    return { ok: true, message: 'Notifications turned off for this device.' }
  } catch (err) {
    return { ok: false, message: err?.message || 'Could not turn them off.' }
  }
}

/** Is this very device subscribed right now? */
export const isPushOn = async () => {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    return !!(await reg.pushManager.getSubscription())
  } catch {
    return false
  }
}
