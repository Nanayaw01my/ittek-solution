import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiPrinter, FiFileText, FiSearch, FiX, FiPlus } from 'react-icons/fi'
import { getBlankReceiptForm, getFilledReceiptForm } from '../api/forms'
import { getProducts } from '../api/products'
import { openPdfInNewTab } from '../utils/openPdf'
import { formatCurrency } from '../utils/helpers'
import PageHeader from '../components/PageHeader'

/**
 * Receipt forms — stationery, not records.
 *
 * Two ways to use the same sheet:
 *   • print it empty and write on it (power out, counter printer down)
 *   • add products first and print it filled in, leaving the rest blank
 *
 * Neither records a sale or moves stock. That is deliberate: this prints paper.
 * A sale that needs to count goes through the POS.
 */
export default function ReceiptForms() {
  const [rows, setRows] = useState(17)
  const [copies, setCopies] = useState(5)
  const [busy, setBusy] = useState(false)

  const [lines, setLines] = useState([])
  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' })
  const [receiptNo, setReceiptNo] = useState('')
  const [discount, setDiscount] = useState('')

  const { data: productData, isFetching } = useQuery({
    queryKey: ['form-products', search],
    queryFn: () => getProducts({ search, limit: 8 }).then(r => r.data),
    enabled: search.trim().length > 1,
  })
  const results = productData?.products || productData?.data || productData || []

  const addProduct = (p) => {
    setLines(prev => [...prev, {
      key: `${p._id}-${Date.now()}`,
      name: p.name,
      quantity: 1,
      unit_price: p.selling_price ?? '',
    }])
    setSearch('')
  }

  const addBlankLine = () =>
    setLines(prev => [...prev, { key: `manual-${Date.now()}`, name: '', quantity: 1, unit_price: '' }])

  const updateLine = (key, field, value) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, [field]: value } : l)))

  const removeLine = (key) => setLines(prev => prev.filter(l => l.key !== key))

  const subtotal = lines.reduce(
    (s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0
  )
  const total = Math.max(0, subtotal - (parseFloat(discount) || 0))
  const hasLines = lines.some(l => l.name.trim())

  const print = async () => {
    setBusy(true)
    try {
      // Must stay inside the click: openPdfInNewTab opens the tab before the
      // request so the browser does not treat it as an unsolicited popup.
      if (hasLines) {
        await openPdfInNewTab(() => getFilledReceiptForm({
          rows: Number(rows),
          copies: 1,
          discount: parseFloat(discount) || 0,
          receiptNo: receiptNo.trim() || undefined,
          date: new Date().toLocaleDateString('en-GB'),
          customer: {
            name: customer.name.trim() || undefined,
            phone: customer.phone.trim() || undefined,
            address: customer.address.trim() || undefined,
          },
          items: lines
            .filter(l => l.name.trim())
            .map(l => ({
              name: l.name.trim(),
              quantity: parseFloat(l.quantity) || 0,
              unit_price: parseFloat(l.unit_price) || 0,
            })),
        }), 'receipt.pdf')
      } else {
        await openPdfInNewTab(
          () => getBlankReceiptForm({ rows, copies }),
          'receipt-form.pdf'
        )
      }
    } catch (err) {
      toast.error(err.message || 'Could not generate the form.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Receipt Forms"
        subtitle="Print a blank receipt to fill in by hand, or add products first"
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        <div className="flex gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
          <FiFileText className="text-orange-500 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-orange-800">
            A4 sheets with the company letterhead and logo watermark. Leave the products
            empty to print blank forms for the counter, or add products below to print one
            already filled in. <span className="font-bold">Nothing here records a sale or
            changes stock</span> — ring it up on the POS if it needs to count.
          </p>
        </div>

        {/* ── Products ──────────────────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Products <span className="text-gray-400 font-normal">(optional)</span>
          </label>

          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search a product to add…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {search.trim().length > 1 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                {isFetching ? (
                  <p className="px-3 py-3 text-xs text-gray-400">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-400">No products found</p>
                ) : results.map(p => (
                  <button
                    key={p._id}
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-orange-50"
                  >
                    <span className="text-sm text-gray-800 truncate">{p.name}</span>
                    <span className="text-xs font-bold text-gray-500 flex-shrink-0">
                      {p.selling_price != null ? formatCurrency(p.selling_price) : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="mt-3 space-y-2">
              {lines.map(l => (
                <div key={l.key} className="flex gap-2 items-center">
                  <input
                    value={l.name}
                    onChange={e => updateLine(l.key, 'name', e.target.value)}
                    placeholder="Description"
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="number"
                    min="0"
                    value={l.quantity}
                    onChange={e => updateLine(l.key, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.unit_price}
                    onChange={e => updateLine(l.key, 'unit_price', e.target.value)}
                    placeholder="Price"
                    className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => removeLine(l.key)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <FiX size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addBlankLine}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
          >
            <FiPlus size={14} /> Add a line manually
          </button>
        </div>

        {/* ── Customer + totals, only useful once there are lines ───────── */}
        {hasLines && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={customer.name}
                onChange={e => setCustomer({ ...customer, name: e.target.value })}
                placeholder="Customer name"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <input
                value={customer.phone}
                onChange={e => setCustomer({ ...customer, phone: e.target.value })}
                placeholder="Telephone"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <input
                value={customer.address}
                onChange={e => setCustomer({ ...customer, address: e.target.value })}
                placeholder="Address"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <input
                value={receiptNo}
                onChange={e => setReceiptNo(e.target.value)}
                placeholder="Receipt number"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  placeholder="0.00"
                  className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-lg font-black text-orange-600">{formatCurrency(total)}</p>
              </div>
            </div>
          </>
        )}

        {/* ── Sheet settings ────────────────────────────────────────────── */}
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
              disabled={hasLines}
              onChange={e => setCopies(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              {hasLines
                ? 'One sheet when products are filled in.'
                : 'One per page, up to 50 at a time.'}
            </p>
          </div>
        </div>

        <button
          onClick={print}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
        >
          <FiPrinter size={16} />
          {busy ? 'Preparing…' : hasLines ? 'Print this receipt' : 'Print blank receipt forms'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Opens in a new tab — print it from there on your A4 printer.
        </p>
      </div>
    </div>
  )
}
