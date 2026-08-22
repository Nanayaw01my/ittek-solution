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
const BASELINE_MM = 80

/**
 * Design metrics at 80mm, scaled proportionally for narrower rolls.
 *
 * Sizes are deliberately larger than they need to be on a screen. A thermal
 * head is around 203dpi and burns a slightly blurred dot, so small type comes
 * out muddy — the first real print at 9px was hard to read.
 */
const metricsFor = (widthMm) => {
  const scale = widthMm / BASELINE_MM
  return {
    fontSize: Math.max(8, +(11 * scale).toFixed(2)),
    moneyCol: Math.max(42, Math.round(74 * scale)),
    qtyCol: Math.max(14, Math.round(22 * scale)),
    padX: Math.max(1.5, +(3 * scale).toFixed(1)),
    padY: Math.max(2, +(4 * scale).toFixed(1)),
    headline: Math.max(11, +(15 * scale).toFixed(2)),
    small: Math.max(8, +(10 * scale).toFixed(2)),
    // The logo printed nearly the full width of the roll. A third is plenty.
    logoWidth: Math.round((widthMm / 25.4) * 96 * 0.34),
  }
}

// The printer accepts rolls down to 20mm, but a receipt line needs a name, a
// quantity, a unit price and a total side by side. Below ~40mm those columns
// cannot fit at a legible size, so narrower settings are treated as 40mm rather
// than printing something with the right-hand edge sliced off.
const MIN_PRINTABLE_MM = 40

export function printReceipt(widthMm = BASELINE_MM) {
  const width = Math.min(82, Math.max(MIN_PRINTABLE_MM, Number(widthMm) || BASELINE_MM))
  const m = metricsFor(width)

  document.getElementById(STYLE_ID)?.remove()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @page { size: ${width}mm auto; margin: 0; }
    @media print {
      .receipt-print-area {
        width: ${width}mm !important;
        max-width: ${width}mm !important;
        padding: ${m.padY}mm ${m.padX}mm !important;
        font-size: ${m.fontSize}px !important;
      }
      /* padding-left keeps the price and total columns from touching */
      .receipt-print-area .w-20 { width: ${m.moneyCol}px !important; padding-left: 4px !important; }
      .receipt-print-area .w-8  { width: ${m.qtyCol}px !important; }
      .receipt-print-area .text-base { font-size: ${m.headline}px !important; }
      .receipt-print-area .text-sm   { font-size: ${m.small}px !important; }
      .receipt-print-area .text-xs   { font-size: ${m.small}px !important; }
      .receipt-print-area .text-\\[10px\\] { font-size: ${m.small}px !important; }

      /* A thermal printer has no grey — it dithers it into scattered dots,
         which is what made the address and item lines look faint and mottled.
         Everything prints pure black. */
      .receipt-print-area,
      .receipt-print-area * { color: #000 !important; }

      .receipt-print-area img {
        width: ${m.logoWidth}px !important;
        max-width: ${m.logoWidth}px !important;
        height: auto !important;
        display: block !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
    }
  `
  document.head.appendChild(style)

  // Give the browser a frame to apply the rules before opening the dialog.
  requestAnimationFrame(() => {
    window.print()
    // Chrome's print dialog is modal and window.print() returns once it closes,
    // but Safari and some mobile browsers return immediately — hence the delay
    // rather than removing the style straight away.
    setTimeout(() => document.getElementById(STYLE_ID)?.remove(), 1000)
  })
}

export { metricsFor, BASELINE_MM, MIN_PRINTABLE_MM }
