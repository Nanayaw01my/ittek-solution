/**
 * Print the on-screen receipt at the shop's actual roll width.
 *
 * The width can't live in the stylesheet: `@page { size: ... }` does not accept
 * a CSS variable in any current browser, so the rule is written out with a
 * concrete millimetre value just before printing and removed afterwards.
 *
 * Everything is scaled from an 80mm baseline, because a 58mm roll is only
 * ~219px wide — 9px type with 58px money columns would not fit, and the right
 * edge would be sliced off exactly as it was before.
 */

const STYLE_ID = 'ittek-receipt-print-size'
const MEASURE_STYLE_ID = 'ittek-receipt-measure'
const ROOT_ID = 'ittek-print-root'
const BASELINE_MM = 80

/**
 * Design metrics at 80mm, scaled proportionally for narrower rolls.
 *
 * Sizes are deliberately larger than they need to be on a screen. A thermal
 * head is around 203dpi and burns a slightly blurred dot, so small type comes
 * out muddy — the first real print at 9px was hard to read.
 */
/**
 * A thermal printer's head is narrower than its roll: an "80mm" printer
 * typically images about 72mm, centred, with the rest as dead margin. Laying
 * content out across the full roll width pushes the left column under that
 * margin, which is why the first letter of every label came out faint or
 * clipped. Reserve a side margin and centre what is left.
 */
const SIDE_MARGIN_MM = 4

const metricsFor = (widthMm) => {
  const scale = widthMm / BASELINE_MM
  const contentMm = Math.max(30, widthMm - SIDE_MARGIN_MM * 2)
  return {
    contentMm,
    fontSize: Math.max(9, +(13 * scale).toFixed(2)),
    // Widened with the type: a money column a shade too narrow for
    // "GHC3500.00" wraps the price onto a second line.
    moneyCol: Math.max(50, Math.round(86 * scale)),
    qtyCol: Math.max(16, Math.round(26 * scale)),
    padY: Math.max(2, +(4 * scale).toFixed(1)),
    headline: Math.max(13, +(17 * scale).toFixed(2)),
    small: Math.max(9, +(12 * scale).toFixed(2)),
    /**
     * The logo, in CSS pixels.
     *
     * A third of the roll came out of the Xprinter as an unreadable smudge
     * a few millimetres across: a 203dpi head renders a small logo as a
     * handful of scattered dots, and under a third of a 72mm roll there are
     * not enough dots left to make a shape. Half the width is the smallest
     * that prints as a mark somebody recognises.
     */
    logoWidth: Math.round((contentMm / 25.4) * 96 * 0.5),
  }
}

// The printer accepts rolls down to 20mm, but a receipt line needs a name, a
// quantity, a unit price and a total side by side. Below ~40mm those columns
// cannot fit at a legible size, so narrower settings are treated as 40mm rather
// than printing something with the right-hand edge sliced off.
const MIN_PRINTABLE_MM = 40

/**
 * Take the receipt out of the app before printing it.
 *
 * The app used to be hidden with `visibility: hidden`, which hides an element
 * but keeps the space it occupies. The page was therefore as tall as the whole
 * screen — a full-height POS behind a full-screen modal — and `size: auto`
 * dutifully made the paper that long. A two-item sale fed most of a foot of
 * blank roll after it, every sale, on a consumable the shop buys.
 *
 * So the receipt is copied to a container of its own directly under <body>,
 * and everything else is collapsed with `display: none`, which takes its
 * space away as well as its ink. What is left in the document is the receipt
 * and nothing else, so `auto` means the height of the receipt.
 *
 * A copy rather than a move: the receipt is React's, and taking the real node
 * out from under it invites React to trip over the missing child when the
 * modal closes.
 */
const mountPrintCopy = () => {
  const source = document.querySelector('.receipt-print-area')
  if (!source) return null

  document.getElementById(ROOT_ID)?.remove()
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.appendChild(source.cloneNode(true))
  document.body.appendChild(root)
  return root
}

const unmountPrintCopy = () => document.getElementById(ROOT_ID)?.remove()

/**
 * The teardown waiting to run, so a second print can call it off.
 *
 * Each print cleans up a second after it starts, because Safari and some
 * phones return from window.print() immediately rather than when the dialog
 * closes. That was safe while printing needed a button press. It stopped
 * being safe when the receipt began printing itself: the slip prints on
 * open, and a cashier pressing Print within that second gets the first
 * print's timer pulling the receipt and its stylesheet out from under the
 * second one — which prints a blank page, or the whole app.
 */
let pendingTeardown = null

/**
 * Everything that decides how tall the receipt comes out.
 *
 * Written once and used twice: to measure the slip, and to print it. That is
 * the whole point of the function — the page has to be told its own length in
 * advance, so the length has to be measured against the very rules that will
 * lay the slip out. When the two drifted apart the measurement came out 45mm
 * long and the shop fed 45mm of blank roll after every sale.
 *
 * `scope` prefixes every selector, so the same text can be dropped inside
 * `@media print` or into a temporary off-screen probe.
 *
 * line-height and the root font size are stated rather than inherited for the
 * same reason: index.css sets `html { font-size: 12px }` for print, which
 * quietly rescales every rem-based gap on the slip, and a measurement taken
 * at the screen's 16px was measuring a different receipt.
 */
const receiptRules = (m, scope) => {
  const a = `${scope} .receipt-print-area`
  return `
  ${scope} { line-height: 1.35 !important; }
  ${a} {
    width: ${m.contentMm}mm !important;
    max-width: ${m.contentMm}mm !important;
    max-height: none !important;
    overflow: visible !important;
    /* A couple of millimetres in from each edge. The page is now exactly the
       printable strip, so content at the very edge sits on the first and last
       column of dots the head can reach — which is where the first letter of
       "Invoice" and "Item" came out clipped. */
    padding: ${m.padY}mm 2mm !important;
    font-size: ${m.fontSize}px !important;
    line-height: 1.35 !important;
    /* A sturdy sans, not monospace. Generic monospace resolves to Courier on
       most systems — thin strokes that a 203dpi thermal head blurs into grey
       mush. The columns are fixed-width flex boxes, so nothing here depends
       on character alignment. */
    font-family: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif !important;
    /* Thermal output is stronger with weight behind it. */
    font-weight: 600 !important;
    /* Digits stay in column despite the proportional face. */
    font-variant-numeric: tabular-nums !important;
    /* A hair of tracking stops adjacent letters merging as the dot spreads. */
    letter-spacing: 0.2px !important;
  }
  ${a} * {
    font-family: inherit !important;
    font-variant-numeric: tabular-nums !important;
    /* Nothing may exceed the roll width; a long product name wraps instead
       of pushing the layout wider than the paper. */
    max-width: 100% !important;
    overflow-wrap: break-word !important;
    word-break: break-word !important;
  }
  ${a} .font-bold,
  ${a} .font-semibold,
  ${a} .font-medium { font-weight: 700 !important; }
  ${a} .font-black  { font-weight: 800 !important; }
  /* flex:none, or the row squeezes these below their set width and a price
     like GHC3500.00 wraps onto a second line. padding-left keeps the price
     and total columns from touching. */
  ${a} .w-20 { width: ${m.moneyCol}px !important; flex: none !important; padding-left: 4px !important; }
  ${a} .w-8  { width: ${m.qtyCol}px !important; flex: none !important; }
  /* The name column absorbs the difference instead. */
  ${a} .flex-1 { min-width: 0 !important; }
  ${a} .text-base { font-size: ${m.headline}px !important; }
  ${a} .text-sm   { font-size: ${m.small}px !important; }
  ${a} .text-xs   { font-size: ${m.small}px !important; }
  ${a} .text-\\[10px\\] { font-size: ${m.small}px !important; }

  /* A thermal printer has no grey — it dithers it into scattered dots, which
     is what made the address and item lines look faint and mottled.
     Everything prints pure black. */
  ${a},
  ${a} * { color: #000 !important; }

  ${a} img {
    width: ${m.logoWidth}px !important;
    max-width: ${m.logoWidth}px !important;
    height: auto !important;
    display: block !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }
  /* The QR has to stay big enough for a phone camera to read it. */
  ${a} img[alt="Receipt QR code"] {
    width: ${Math.round(m.logoWidth * 1.3)}px !important;
    max-width: ${Math.round(m.logoWidth * 1.3)}px !important;
  }
`
}

/** CSS pixels to millimetres, at the 96dpi the browser lays out in. */
const pxToMm = (px) => (px * 25.4) / 96

/**
 * How tall the receipt is in millimetres, at the size it will print.
 *
 * Measured, because `@page` has to be given a number. The mounted copy is
 * parked off-screen with the print rules applied and its height read back.
 *
 * All of it happens inside one function call with no await and no paint in
 * between, so the stylesheet is gone again before the screen can show any of
 * it. It costs one forced layout, once per print.
 */
const measureMm = (root, m) => {
  const probe = document.createElement('style')
  probe.id = MEASURE_STYLE_ID
  probe.textContent = `
    /* index.css does this for print; the slip's rem-based gaps depend on it. */
    html { font-size: 12px !important; }
    #${ROOT_ID} {
      position: absolute !important;
      left: -10000px !important;
      top: 0 !important;
      display: block !important;
      width: ${m.contentMm}mm !important;
    }
    #${ROOT_ID} .receipt-print-area {
      position: static !important;
      visibility: visible !important;
    }
    ${receiptRules(m, `#${ROOT_ID}`)}
  `
  document.head.appendChild(probe)
  const px = Math.max(root.scrollHeight, root.getBoundingClientRect().height)
  probe.remove()
  return pxToMm(px)
}

export function printReceipt(widthMm = BASELINE_MM) {
  const width = Math.min(82, Math.max(MIN_PRINTABLE_MM, Number(widthMm) || BASELINE_MM))
  const m = metricsFor(width)

  // Any teardown still pending belongs to a print that is finished with.
  // Letting it run would dismantle this one.
  if (pendingTeardown) { clearTimeout(pendingTeardown); pendingTeardown = null }

  document.getElementById(STYLE_ID)?.remove()
  document.getElementById(MEASURE_STYLE_ID)?.remove()
  const printRoot = mountPrintCopy()

  /**
   * The page is cut to the receipt, in millimetres.
   *
   * It used to say `size: 80mm auto`, which is not valid CSS — `auto` is
   * only allowed on its own, so the whole declaration was thrown away. The
   * browser then used the printer driver's own page length, broke the
   * receipt across however many of those it took, and the printer fed a
   * full page for each: a one-item sale came out as half a metre of roll
   * with the logo, the header, the items and the barcode each marooned on
   * their own sheet.
   *
   * So the height is measured and stated. A few millimetres are added for
   * the tear-off, and the whole thing is capped — a receipt longer than
   * three metres is a fault somewhere else, and should not become three
   * metres of the shop's paper.
   */
  const measured = printRoot ? measureMm(printRoot, m) : 150
  const height = Math.min(3000, Math.ceil(measured) + 6)

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    /**
     * The page is the printable strip, not the roll.
     *
     * An "80mm" printer images about 72mm and treats the rest as dead
     * margin, so a page declared at the full 80mm is wider than anything the
     * driver can put ink on. Chrome's answer to a page wider than the
     * printable area is to shrink the whole thing to fit — which is why the
     * first good print came out small, pale and floating in white space with
     * a margin down both sides: 72mm of content was scaled down inside an
     * 80mm page that was itself scaled down into 72mm of paper, twice.
     *
     * Declaring the page as the strip itself means nothing is scaled, and
     * the type prints at the size it was measured at.
     */
    @page { size: ${m.contentMm}mm ${height}mm; margin: 0; }
    #${ROOT_ID} { display: none; }
    @media print {
      /* Everything but the receipt is collapsed, not merely hidden, so the
         page is only as long as what is printed on it. */
      body > *:not(#${ROOT_ID}) { display: none !important; }
      html, body { height: auto !important; min-height: 0 !important; margin: 0 !important; }

      #${ROOT_ID} { display: block !important; }
      /* In its own container the receipt is the only thing in flow, so the
         absolute positioning that used to lift it clear of the hidden app
         would now just take it back out of the flow it needs to be in. */
      #${ROOT_ID} .receipt-print-area {
        position: static !important;
        visibility: visible !important;
        top: auto !important;
        left: 0 !important;
        right: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      #${ROOT_ID} .receipt-print-area * { visibility: visible !important; }
      /* Nothing should print after the last line of the receipt. */
      #${ROOT_ID} .receipt-print-area > *:last-child { margin-bottom: 0 !important; }

      /* Nothing is allowed to break across pages. On a roll there is only
         ever one page, and a stray break is what put each block of the
         receipt on a sheet of its own. */
      #${ROOT_ID}, #${ROOT_ID} * {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      ${receiptRules(m, `#${ROOT_ID}`)}
    }
  `
  document.head.appendChild(style)

  // Give the browser a frame to apply the rules before opening the dialog.
  requestAnimationFrame(() => {
    window.print()
    // Chrome's print dialog is modal and window.print() returns once it closes,
    // but Safari and some mobile browsers return immediately — hence the delay
    // rather than tearing down straight away. The copy must go either way, or
    // a second receipt would print under the first.
    pendingTeardown = setTimeout(() => {
      pendingTeardown = null
      document.getElementById(STYLE_ID)?.remove()
      unmountPrintCopy()
    }, 1000)
  })

  return printRoot
}

export { metricsFor, BASELINE_MM, MIN_PRINTABLE_MM, pxToMm }

/**
 * Print as soon as the slip is on screen and its pictures have arrived.
 *
 * Printing the instant React renders catches the logo and the barcode
 * mid-download, and a thermal slip with a blank square where the logo should
 * be is the one the customer keeps. So: wait for the images in the receipt,
 * then print — but never wait for ever, because an unreachable logo must
 * cost the shop a logo, not a receipt.
 *
 * Note on silence: a browser always asks which printer unless it has been
 * started with --kiosk-printing (Chrome), which prints to the default
 * printer with no dialog at all. Nothing in a web page can suppress that
 * prompt on its own, and pretending otherwise would be a promise this code
 * cannot keep.
 */
export function printWhenReady(widthMm, { timeout = 2500 } = {}) {
  const area = document.querySelector('.receipt-print-area')
  if (!area) return Promise.resolve(false)

  const images = [...area.querySelectorAll('img')].filter((i) => !i.complete)
  if (images.length === 0) {
    printReceipt(widthMm)
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    let done = false
    const go = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      printReceipt(widthMm)
      resolve(true)
    }
    let left = images.length
    const tick = () => { left -= 1; if (left <= 0) go() }
    images.forEach((img) => {
      img.addEventListener('load', tick, { once: true })
      // A logo that will not load must not hold up the slip.
      img.addEventListener('error', tick, { once: true })
    })
    const timer = setTimeout(go, timeout)
  })
}
