import { describeApiError } from './apiError'

/**
 * Fetch a PDF from the API and show it to the user.
 *
 * Two traps this exists to avoid:
 *
 * 1. window.open() called *after* an await has lost the user-gesture context,
 *    so browsers treat it as an unsolicited popup and block it. The tab is
 *    therefore opened synchronously, before the request, and pointed at the
 *    blob once it arrives.
 *
 * 2. With responseType 'blob', an error response body is also a Blob — so
 *    err.response.data.message is undefined and the real reason ("Manager
 *    access required", "Server error…") never reaches the user. The body is
 *    read back as text and parsed.
 *
 * Must be called synchronously from the click handler, or trap 1 returns.
 *
 * @param {() => Promise} fetchPdf - returns an axios promise with responseType 'blob'
 * @param {string} filename - used if the popup is blocked and we fall back to a download
 */
export async function openPdfInNewTab(fetchPdf, filename = 'document.pdf') {
  // Synchronous: still inside the user gesture.
  const win = window.open('', '_blank')

  try {
    const res = await fetchPdf()
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))

    if (win && !win.closed) {
      win.location.href = url
    } else {
      // Popups blocked entirely — download it instead of failing silently.
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    }

    // Long enough for the tab to load before the URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return { ok: true }
  } catch (err) {
    if (win && !win.closed) win.close()
    throw new Error(await messageFromBlobError(err))
  }
}

/** Pull the server's message out of an error whose body is a Blob. */
async function messageFromBlobError(err) {
  const body = err?.response?.data
  if (body instanceof Blob) {
    try {
      const text = await body.text()
      const parsed = JSON.parse(text)
      if (parsed?.message) return parsed.message
    } catch {
      // Not JSON — fall through to the generic classifier.
    }
  }
  return describeApiError(err, 'Could not generate the document.').message
}
