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
    // The logo printed nearly the full width of the roll. A third is plenty.
    logoWidth: Math.round((contentMm / 25.4) * 96 * 0.34),
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
        /* Narrower than the roll, and centred rather than pinned to a fixed
           left offset — left+right:0 with auto side margins centres an
           absolutely positioned element inside whatever page box the driver
           uses. A fixed inset only looked right when the driver honoured the
           @page size exactly; on a wider page the whole receipt shifted left.

           Still absolutely positioned: the receipt lives inside a modal and
           the rest of the app is hidden with visibility:hidden, which keeps
           its layout space, so in normal flow the receipt would print after a
           stack of blank space. */
        left: 0 !important;
        right: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
        width: ${m.contentMm}mm !important;
        max-width: ${m.contentMm}mm !important;
        padding: ${m.padY}mm 0 !important;
        font-size: ${m.fontSize}px !important;
        /* A sturdy sans, not the default monospace. Generic monospace resolves
           to Courier on most systems — thin strokes that a thermal head blurs
           into grey mush. The columns are fixed-width flex boxes, so nothing
           here depends on character alignment. */
        font-family: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif !important;
        /* Thermal output is stronger with weight behind it. */
        font-weight: 600 !important;
        /* Digits stay in column despite the proportional face. */
        font-variant-numeric: tabular-nums !important;
        /* A hair of tracking stops adjacent letters merging as the dot spreads. */
        letter-spacing: 0.2px !important;
      }
      .receipt-print-area * {
        font-family: inherit !important;
        font-variant-numeric: tabular-nums !important;
      }
      .receipt-print-area .font-bold,
      .receipt-print-area .font-semibold,
      .receipt-print-area .font-medium { font-weight: 700 !important; }
      .receipt-print-area .font-black  { font-weight: 800 !important; }
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
