/**
 * Signing in with no internet.
 *
 * The till already sells offline, but only for whoever was already signed in.
 * A dropped connection at the start of a shift, or a phone that logged out
 * overnight, left the shop unable to open at all — which is the one thing an
 * offline-capable till must never do.
 *
 * So after every successful online sign-in, this remembers enough on the
 * device to check the same password again later without the server. It never
 * stores the password: it stores a PBKDF2 hash of it, with a random salt and
 * a high iteration count, so a copy of the device's storage does not hand
 * anyone the password.
 *
 * What it deliberately cannot do is notice that an account was disabled or
 * its role changed after the record was written. That is why records expire,
 * and why the expiry is short enough to matter.
 */

const KEY = 'ittek_offline_auth'
const BADGE_KEY = 'ittek_offline_badges'
const MAX_USERS = 5
/** A record older than this is ignored — a sacked worker must not sign in for ever. */
const MAX_AGE_DAYS = 14
const ITERATIONS = 120000

/** crypto.subtle is missing on plain HTTP, so offline sign-in simply is not offered. */
const subtle = () => (typeof window !== 'undefined'
  && window.crypto && window.crypto.subtle) || null

export const offlineAuthSupported = () => !!subtle()

const toHex = (buf) => [...new Uint8Array(buf)]
  .map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex) => new Uint8Array(
  (hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16))
)

const hash = async (password, salt) => {
  const api = subtle()
  if (!api) return null
  const key = await api.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await api.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256
  )
  return toHex(bits)
}

const read = () => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const rows = JSON.parse(raw)
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

const write = (rows) => {
  try { localStorage.setItem(KEY, JSON.stringify(rows)) } catch { /* private mode */ }
}

const readBadges = () => {
  try {
    const raw = localStorage.getItem(BADGE_KEY)
    if (!raw) return []
    const rows = JSON.parse(raw)
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

const writeBadges = (rows) => {
  try { localStorage.setItem(BADGE_KEY, JSON.stringify(rows)) } catch { /* private mode */ }
}

const fresh = (row) =>
  Date.now() - (row.saved_at || 0) < MAX_AGE_DAYS * 86400000

const norm = (u) => String(u || '').trim().toLowerCase()

/**
 * Remember this sign-in, so the same person can get back in without the
 * server. Called after the server has already said the password is right.
 */
export const rememberCredentials = async (username, password, user, token) => {
  if (!subtle() || !username || !password) return
  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16))
    const digest = await hash(password, salt)
    if (!digest) return

    const row = {
      username: norm(username),
      display_name: user?.username || username,
      salt: toHex(salt),
      digest,
      iterations: ITERATIONS,
      user,
      token,
      saved_at: Date.now(),
    }

    // Newest first, one row per person, and only a handful of devices' worth.
    const rows = [row, ...read().filter((r) => r.username !== row.username)]
      .slice(0, MAX_USERS)
    write(rows)
  } catch {
    // Remembering is a convenience; failing to must never fail the login.
  }
}

/**
 * Check a username and password against what this device remembers.
 *
 * Returns the stored user and token on a match, or a reason it cannot help:
 * 'unsupported', 'unknown' (nobody by that name has signed in here),
 * 'expired', or 'wrong' — which is a genuinely wrong password.
 */
export const verifyOffline = async (username, password) => {
  if (!subtle()) return { ok: false, reason: 'unsupported' }

  const row = read().find((r) => r.username === norm(username))
  if (!row) return { ok: false, reason: 'unknown' }
  if (!fresh(row)) return { ok: false, reason: 'expired' }

  try {
    const digest = await hash(password, fromHex(row.salt))
    if (!digest || digest !== row.digest) return { ok: false, reason: 'wrong' }
    return { ok: true, user: row.user, token: row.token, saved_at: row.saved_at }
  } catch {
    return { ok: false, reason: 'unsupported' }
  }
}

/**
 * Remember a badge sign-in, so the card works when the line is down.
 *
 * Kept separately from the password records, and keyed on the badge code the
 * same way — hashed, never stored as it was scanned. A card is not a secret,
 * but a device's storage should still not hand anybody a working badge for
 * every member of staff.
 *
 * A badge whose role needs a PIN is remembered with the PIN folded into the
 * hash, so the code alone will not open it offline any more than it would
 * online.
 */
export const rememberBadge = async (code, pin, user, token) => {
  if (!subtle() || !code) return
  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16))
    const digest = await hash(`${code}::${pin || ''}`, salt)
    if (!digest) return

    const row = {
      // Only for telling one card from another in a list — not enough to
      // reconstruct the number from.
      tail: String(code).slice(-4),
      display_name: user?.username || 'staff',
      salt: toHex(salt),
      digest,
      iterations: ITERATIONS,
      needs_pin: !!pin,
      user,
      token,
      saved_at: Date.now(),
    }

    const rows = [row, ...readBadges().filter((r) => r.digest !== digest)].slice(0, MAX_USERS)
    writeBadges(rows)
  } catch {
    // Remembering is a convenience; failing to must never fail the sign-in.
  }
}

/**
 * Check a scanned badge against what this device remembers.
 *
 * Every card on the device has to be tried, because the codes are hashed and
 * there is nothing to look one up by. With at most five that is five hashes,
 * which is the cost of not storing the numbers in the clear.
 */
export const verifyBadgeOffline = async (code, pin) => {
  if (!subtle()) return { ok: false, reason: 'unsupported' }

  const all = readBadges().filter(fresh)
  if (all.length === 0) return { ok: false, reason: 'unknown' }

  // Narrowed by the last four digits before anything is hashed. Without this
  // an unknown card would be answered by whichever remembered card happened
  // to want a PIN, and the screen would ask a stranger for somebody else's
  // code. Four digits is not proof — the hash below is — it only says which
  // card is being claimed.
  const tail = String(code || '').slice(-4)
  const rows = all.filter((r) => r.tail === tail)
  if (rows.length === 0) return { ok: false, reason: 'unknown' }

  for (const row of rows) {
    try {
      const digest = await hash(`${code}::${pin || ''}`, fromHex(row.salt))
      if (digest === row.digest) {
        return { ok: true, user: row.user, token: row.token }
      }
    } catch {
      // Try the next card.
    }
  }

  // The card is one this device knows and it wants a PIN, so ask for it —
  // the same answer the server gives.
  if (!pin && rows.some((r) => r.needs_pin)) {
    const who = rows.find((r) => r.needs_pin)
    return { ok: false, reason: 'pin_required', username: who.display_name }
  }
  return { ok: false, reason: 'wrong' }
}

/** Whether this device could let anybody in by badge at all. */
export const hasOfflineBadges = () => readBadges().filter(fresh).length > 0

/** Who this device can let in without the internet. */
export const offlineUsers = () => read().filter(fresh).map((r) => ({
  username: r.display_name,
  saved_at: r.saved_at,
}))

export const clearOfflineCredentials = () => {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(BADGE_KEY)
  } catch { /* nothing to clear */ }
}
