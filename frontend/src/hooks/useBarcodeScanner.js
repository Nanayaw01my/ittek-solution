import { useEffect, useRef } from 'react'

/**
 * Catching a barcode scanner anywhere on the page.
 *
 * A scanner is a keyboard. Its keystrokes go to whatever has focus, so if
 * nobody has clicked the scan box first they go nowhere, and the shop learns
 * to click a box before every scan — which is most of the time a scanner was
 * meant to save.
 *
 * What tells a scanner from a person is speed. A scanner delivers a whole
 * code in a few milliseconds per character and finishes with Enter; nobody
 * types thirteen digits in 150ms. So the burst is watched for rather than the
 * focus, and a person typing at human speed is never mistaken for one.
 */

// Slowest gap between two scanner keystrokes. Cheap scanners are around
// 10-30ms; a fast typist is above 80ms even at a sprint.
const MAX_GAP_MS = 50
// Short codes would swallow ordinary typing; real barcodes are 8 digits or more.
const MIN_LENGTH = 6

/**
 * Put back what a scan typed into a field it was not meant for.
 *
 * A scan can only be recognised once it ends, by which time its characters
 * have already landed wherever the cursor was — the notes box, a price. The
 * value from before the burst is restored through the native setter, because
 * assigning to .value directly leaves React's own copy behind and the old
 * text reappears on the next render.
 */
const restore = (el, before) => {
  if (!el || before === null || before === undefined) return
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  try {
    if (setter) setter.call(el, before)
    else el.value = before
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } catch { /* the field keeps the stray text; the scan still counts */ }
}

export default function useBarcodeScanner(onScan, { enabled = true } = {}) {
  // Held in a ref so re-rendering the page mid-scan cannot lose the buffer.
  const buffer = useRef('')
  const lastAt = useRef(0)
  // The field the burst is landing in, and what it held before it started.
  const typedInto = useRef({ el: null, before: null })
  const handler = useRef(onScan)
  handler.current = onScan

  useEffect(() => {
    if (!enabled) return undefined

    const onKeyDown = (e) => {
      // The dedicated scan box handles its own keystrokes; catching them here
      // as well would add every code twice.
      const el = document.activeElement
      if (el?.dataset?.scanInput !== undefined) return
      // A rich-text area cannot be put back reliably, so it is left alone.
      if (el?.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const now = Date.now()
      const gap = now - lastAt.current
      lastAt.current = now

      if (e.key === 'Enter') {
        const code = buffer.current
        const landed = typedInto.current
        buffer.current = ''
        typedInto.current = { el: null, before: null }
        // Only a fast burst of enough characters counts. Enter pressed on its
        // own, or after slow typing, is left entirely alone — it may be
        // somebody submitting a form.
        if (code.length >= MIN_LENGTH && gap < MAX_GAP_MS) {
          e.preventDefault()
          e.stopPropagation()
          // The code landed in whatever had the cursor. Take it back out
          // before acting on it, so a scan into the notes box does not leave
          // thirteen digits in the notes.
          restore(landed.el, landed.before)
          handler.current?.(code)
        }
        return
      }

      // A pause means a new burst, so the fragment before it is discarded
      // rather than joined onto the next scan.
      if (gap > MAX_GAP_MS) {
        buffer.current = ''
        typedInto.current = { el: null, before: null }
      }

      // Scanner output is single printable characters.
      if (e.key.length !== 1) return

      // Remember the field as it stood before the first character of a burst.
      if (buffer.current === '' && (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA')) {
        typedInto.current = { el, before: el.value }
      }
      buffer.current += e.key
    }

    // Capture, so a code is seen before a focused input can act on it.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [enabled])
}
