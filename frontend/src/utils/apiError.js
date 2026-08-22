/**
 * Turn an axios error into something a cashier can act on.
 *
 * The trap this exists to avoid: falling back to "Invalid credentials" for
 * anything without a JSON message. A timeout, a dropped connection, or a 502
 * while the server wakes up would all tell staff their password was wrong,
 * sending them off to reset a password that was never the problem.
 *
 * @param {Error} err - axios error
 * @param {string} fallback - message for a genuine 4xx with no server text
 * @returns {{ message: string, kind: 'connection'|'server'|'client', canRetry: boolean }}
 */
export function describeApiError(err, fallback = 'Something went wrong. Please try again.') {
  // Request never completed: offline, DNS failure, connection refused, CORS.
  if (!err?.response) {
    if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
      return {
        message: 'The server is taking too long to respond. Check your connection and try again.',
        kind: 'connection',
        canRetry: true,
      }
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        message: 'You appear to be offline. Reconnect and try again.',
        kind: 'connection',
        canRetry: true,
      }
    }
    return {
      message: 'Poor network connection — could not reach the server. Please try again.',
      kind: 'connection',
      canRetry: true,
    }
  }

  const { status, data } = err.response

  // The server answered but is not healthy. On a free hosting tier this is
  // usually the service waking from idle, which resolves on a second attempt.
  if (status === 502 || status === 503 || status === 504) {
    return {
      message: 'The server is starting up or unavailable. Wait a moment and try again.',
      kind: 'server',
      canRetry: true,
    }
  }

  if (status === 429) {
    return {
      message: 'Too many attempts. Please wait a moment before trying again.',
      kind: 'server',
      canRetry: true,
    }
  }

  if (status >= 500) {
    return {
      message: data?.message || 'The server had a problem handling that. Please try again.',
      kind: 'server',
      canRetry: true,
    }
  }

  // A real 4xx — trust the server's own wording when it gave one.
  return {
    message: typeof data?.message === 'string' && data.message ? data.message : fallback,
    kind: 'client',
    canRetry: false,
  }
}
