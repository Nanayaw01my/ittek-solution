import React from 'react'
import { FiPrinter, FiAlertTriangle } from 'react-icons/fi'
import Modal from './Modal'
import { getPendingQueue, getCachedProducts } from '../utils/offlineQueue'
import { formatCurrency } from '../utils/helpers'

/**
 * What is still waiting to reach the server, in words.
 *
 * The queue stores product ids and quantities — nothing a person can read. So
 * a till holding unsynced sales could show a count and nothing else, which is
 * useless to someone trying to work out what was sold while the line was down.
 *
 * Product names and prices are resolved from the offline catalogue on this
 * device. That catalogue is a snapshot, so a price changed since the sale
 * shows as it was when the catalogue was last downloaded — near enough to
 * reconcile against a paper receipt, and it is the only record here.
 */
export default function PendingSalesModal({ isOpen, onClose }) {
  const queue = isOpen ? getPendingQueue() : []
  const catalogue = isOpen ? (getCachedProducts() || []) : []

  const byId = new Map(catalogue.map((p) => [String(p._id), p]))

  const describe = (line) => {
    const product = byId.get(String(line.product_id))
    if (!product) {
      return { name: `Unknown product (${String(line.product_id).slice(-6)})`, price: null }
    }
    if (line.variant_sku) {
      const v = (product.variants || []).find((x) => x.sku === line.variant_sku)
      if (v) return { name: `${product.name} — ${v.name}`, price: v.selling_price }
    }
    return { name: product.name, price: product.selling_price }
  }

  const sales = queue.map((entry) => {
    const p = entry.payload || {}
    const lines = (p.cart || []).map((line) => {
      const { name, price } = describe(line)
      const qty = Number(line.quantity) || 0
      return { name, qty, price, total: price === null ? null : price * qty }
    })
    const known = lines.every((l) => l.total !== null)
    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0)
    const discount = p.discount_type === 'percentage'
      ? (subtotal * (Number(p.discount) || 0)) / 100
      : (Number(p.discount) || 0)
    return {
      id: entry.id,
      when: entry.timestamp ? new Date(entry.timestamp) : null,
      type: entry.type,
      customer: p.customer_name || '',
      phone: p.customer_phone || '',
      method: (p.payment_method || '').replace(/_/g, ' '),
      amountPaid: p.amount_paid != null ? Number(p.amount_paid) : null,
      lines,
      known,
      total: Math.max(0, subtotal - discount),
    }
  })

  const grandTotal = sales.reduce((s, x) => s + x.total, 0)
  const anyUnknown = sales.some((s) => !s.known)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sales waiting to sync" size="lg">
      <div className="p-4">
        {sales.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            Nothing is waiting on this device.
          </p>
        ) : (
          <>
            <div className="receipt-print-area">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">
                  <span className="font-bold text-gray-900">{sales.length}</span> sale
                  {sales.length === 1 ? '' : 's'} held on this device
                </p>
                <p className="text-sm">
                  Total <span className="font-black text-gray-900">{formatCurrency(grandTotal)}</span>
                </p>
              </div>

              {anyUnknown && (
                <div className="flex gap-2 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg no-print">
                  <FiAlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={15} />
                  <p className="text-xs text-amber-800">
                    Some products are not in this device's saved catalogue, so their name and
                    price could not be filled in. Those totals are understated.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {sales.map((s, i) => (
                  <div key={s.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800">
                          #{i + 1}
                          {s.when && ` · ${s.when.toLocaleString('en-GB')}`}
                          {s.type === 'short_payment' && ' · PART PAYMENT'}
                        </p>
                        {(s.customer || s.phone) && (
                          <p className="text-xs text-gray-500 truncate">
                            {s.customer}{s.phone ? ` · ${s.phone}` : ''}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-black text-gray-900 flex-shrink-0">
                        {formatCurrency(s.total)}
                      </p>
                    </div>

                    <table className="w-full text-xs">
                      <tbody>
                        {s.lines.map((l, li) => (
                          <tr key={li} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-1.5 text-gray-700">{l.name}</td>
                            <td className="px-2 py-1.5 text-right text-gray-500 w-12">×{l.qty}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-gray-800 w-24">
                              {l.total === null ? '—' : formatCurrency(l.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {(s.method || s.amountPaid !== null) && (
                      <p className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
                        {s.method && <span className="uppercase">{s.method}</span>}
                        {s.amountPaid !== null && ` · paid ${formatCurrency(s.amountPaid)}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-4 no-print">
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm"
              >
                <FiPrinter size={15} /> Print this list
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-3 text-center no-print">
              These have not reached the server yet. Do not clear this device's data —
              this list is the only record of them.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
