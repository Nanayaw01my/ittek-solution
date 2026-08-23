import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { FiPrinter, FiFileText } from 'react-icons/fi'
import { getBlankReceiptForm } from '../api/forms'
import { openPdfInNewTab } from '../utils/openPdf'
import PageHeader from '../components/PageHeader'

/**
 * Blank receipt forms — stationery, not records.
 *
 * There is no sale behind these: the shop prints a stack and writes on them
 * when the counter printer is down, the power is out, or a receipt has to be
 * written away from the system. Open to any signed-in staff member, since
 * that is exactly when it is needed.
 */
export default function ReceiptForms() {
  const [rows, setRows] = useState(17)
  const [copies, setCopies] = useState(5)
  const [busy, setBusy] = useState(false)

  const print = async () => {
    setBusy(true)
    try {
      // Must stay inside the click: openPdfInNewTab opens the tab before the
      // request so the browser does not treat it as an unsolicited popup.
      await openPdfInNewTab(
        () => getBlankReceiptForm({ rows, copies }),
        'receipt-form.pdf'
      )
    } catch (err) {
      toast.error(err.message || 'Could not generate the form.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader
        title="Receipt Forms"
        subtitle="Print blank receipts to fill in by hand"
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        <div className="flex gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
          <FiFileText className="text-orange-500 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-orange-800">
            These are blank A4 forms with the company letterhead and logo watermark —
            no sale information on them. Print a stack and keep them at the counter for
            when the receipt printer or the power is down.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Item rows per form
            </label>
            <input
              type="number"
              min="5"
              max="30"
              value={rows}
              onChange={e => setRows(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Fewer rows means more room to write on each line.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              How many forms
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={copies}
              onChange={e => setCopies(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              One per page, up to 50 at a time.
            </p>
          </div>
        </div>

        <button
          onClick={print}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
        >
          <FiPrinter size={16} />
          {busy ? 'Preparing…' : 'Print blank receipt forms'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Opens in a new tab — print it from there on your A4 printer.
        </p>
      </div>
    </div>
  )
}
