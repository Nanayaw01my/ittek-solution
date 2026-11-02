import React from 'react'
import { FiX, FiPrinter } from 'react-icons/fi'
import { printWhenReady, metricsFor, LENGTH_SLOT_ID } from '../utils/printReceipt'

/**
 * A slip for setting up the printer, not for a customer.
 *
 * Getting a thermal printer right is three separate settings in three
 * different places — the roll width in ITTEK, the stock size in the Windows
 * driver, and the scale and margins in Chrome's own print dialog — and when
 * they disagree the only symptom is a receipt that comes out small, pale,
 * clipped down one side, or spread over a metre of paper. Diagnosing that by
 * making real sales means a real sale, a real stock movement and a real
 * invoice number for every attempt.
 *
 * So this prints the same way a receipt does, through the same code, with
 * content chosen to answer the questions instead of to sell anything:
 *
 *   - a 50mm bar, so a ruler says straight away whether the driver is
 *     scaling the page, and by how much
 *   - a ruler across the full width, so the real printable width can be read
 *     off the paper rather than guessed from the model number
 *   - edge markers, so a clipped first or last column of dots is visible
 *   - every type size and the money column the item rows use, so a wrapped
 *     price shows up here rather than on a customer's receipt
 */
export default function PrintTestSlip({ widthMm = 80, offsetMm = 0, textScale = 110, onClose }) {
  const width = Number(widthMm) || 80
  const offset = Number(offsetMm) || 0
  const type = Number(textScale) || 110
  const m = metricsFor(width, offset, type)

  // Ticks every 10mm across the printable width, numbered.
  const ticks = Array.from({ length: Math.floor(m.contentMm / 10) + 1 }, (_, i) => i * 10)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print-container">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 no-print">
          <h3 className="font-bold text-gray-900">Printer test slip</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600" aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        <div className="p-4">
          <div className="receipt-print-area bg-white border border-gray-200 rounded-xl p-4 font-mono text-sm">
            <div className="text-center">
              <p className="font-black text-base">PRINTER TEST</p>
              <p className="text-xs">Not a receipt. Nothing was sold.</p>
            </div>

            <div className="my-2 border-t border-dashed border-gray-400" />

            {/* The scale check. If this bar is not 50mm on the paper, the
                driver or Chrome is resizing the page, and the ratio says by
                how much — 25mm means half size, and so on. */}
            <div>
              <p className="text-xs font-bold">1. Measure this bar</p>
              <div style={{ width: '50mm', height: '3mm', background: '#000' }} />
              <p className="text-xs">It must be exactly 50mm. Shorter = the printer is shrinking the page.</p>
            </div>

            <div className="my-2 border-t border-dashed border-gray-400" />

            {/* The width check. Whichever number the paper runs out under is
                the printer's real printable width. */}
            <div>
              <p className="text-xs font-bold">2. Printable width</p>
              <div className="flex" style={{ width: `${m.contentMm}mm` }}>
                {ticks.map((t) => (
                  <div key={t} style={{ width: '10mm', flex: 'none' }}>
                    <div style={{ height: '3mm', borderLeft: '1px solid #000' }} />
                    <span className="text-[10px]">{t}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs">
                Set to {width}mm roll, printing {m.contentMm}mm wide
                {offset ? `, nudged ${offset > 0 ? '+' : ''}${offset}mm` : ''}, text at {type}%.
              </p>
              <p className="text-xs">
                Measure the white margin on each side. If they differ, put half the
                difference in &ldquo;Nudge the printing&rdquo; — leaning right means a minus.
              </p>
            </div>

            <div className="my-2 border-t border-dashed border-gray-400" />

            {/* The clipping check. Both blocks must be whole. */}
            <div>
              <p className="text-xs font-bold">3. Both edges</p>
              <div className="flex items-center justify-between">
                <span style={{ background: '#000', color: '#fff', padding: '0 2px' }}>LEFT</span>
                <span style={{ background: '#000', color: '#fff', padding: '0 2px' }}>RIGHT</span>
              </div>
              <p className="text-xs">If either word is cut, the paper is narrower than the setting.</p>
            </div>

            <div className="my-2 border-t border-dashed border-gray-400" />

            {/* The legibility check, at the real sizes and the real columns. */}
            <div>
              <p className="text-xs font-bold">4. Every size, and the item row</p>
              <p className="text-base font-bold">Headline {m.headline}px</p>
              <p className="text-sm">Body text {m.fontSize}px — abcdefghijklmnop</p>
              <p className="text-xs">Small print {m.small}px — 0123456789</p>
              {/* Laid out exactly as a real item row is: the product name on
                  a full-width line of its own, then an empty spacer, the
                  quantity and the two money columns. The first version of
                  this slip put the name in the row beside the prices, which
                  squeezed it into a column five characters wide and printed
                  "A / deliber / ately / long" down the slip — a fault that
                  existed only on the test, and exactly the sort of false
                  alarm a diagnostic must not raise.

                  Money is formatted the way the receipt formats it:
                  toFixed(2), no thousands separator. */}
              <div className="text-xs mb-1">
                <p className="font-medium">A deliberately long product name</p>
                <div className="flex">
                  <span className="flex-1" />
                  <span className="w-8 text-center">99</span>
                  <span className="w-20 text-right">GH&#8373;3500.00</span>
                  <span className="w-20 text-right font-bold">GH&#8373;3500.00</span>
                </div>
              </div>
              <p className="text-xs">
                The name may wrap onto a second line. Neither price may — if a price breaks
                over two lines, the roll width set here is wider than the paper.
              </p>
            </div>

            <div className="my-2 border-t border-dashed border-gray-400" />

            {/* Filled in by printReceipt at the moment of printing, because
                the length is only known once the slip has been laid out.
                It is the number Windows needs: Chrome cuts a receipt that
                is longer than the paper chosen in its print dialog, no
                matter how carefully the app measured it. */}
            <div>
              <p className="text-xs font-bold">5. Paper length</p>
              <p className="text-sm font-bold">
                This slip needs <span id={LENGTH_SLOT_ID}>…</span>
              </p>
              <p className="text-xs">
                Your Windows paper size must be at least this long, or the receipt is cut
                in two. A real receipt with a QR code runs longer than this test — set it
                to 300mm and nothing will ever split.
              </p>
            </div>

            <div className="my-2 border-t border-dashed border-gray-400" />

            <div className="text-center">
              <p className="text-xs">ITTEK Solution &middot; {new Date().toLocaleString()}</p>
              <p className="text-xs">Nothing should print below this line.</p>
            </div>
          </div>

          <div className="mt-4 no-print space-y-3">
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3 leading-relaxed">
              <p className="font-bold text-gray-800 mb-1">In Chrome&rsquo;s print box, before you print:</p>
              <p>Margins <span className="font-semibold">None</span> &middot; Scale <span className="font-semibold">100%</span>
                {' '}&middot; Headers and footers <span className="font-semibold">off</span>
                {' '}&middot; Background graphics <span className="font-semibold">on</span>.</p>
              <p className="mt-1">Chrome remembers these per printer, so it is once per till.</p>
            </div>
            <button
              type="button"
              onClick={() => printWhenReady(width, { offsetMm: offset, textScale: type })}
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm"
            >
              <FiPrinter size={16} /> Print test slip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
