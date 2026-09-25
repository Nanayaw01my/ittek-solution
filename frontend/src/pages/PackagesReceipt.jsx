import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiPrinter, FiSearch, FiX, FiPlus, FiFileText } from 'react-icons/fi'
import { getBlankReceiptForm, getFilledReceiptForm } from '../api/forms'
import { getProducts } from '../api/products'
import { openPdfInNewTab } from '../utils/openPdf'
import { formatCurrency } from '../utils/helpers'
import PageHeader from '../components/PageHeader'

/**
 * The packages receipt: a receipt written at the counter, printed on A4, and
 * — unlike everything on the Documents page — recorded.
 *
 * It lives on its own screen because it is not a document. Printing one takes
 * money: what the customer paid goes into the day's sales and any balance goes
 * to Debts. Sitting it beside blank pads and students' certificates made a
 * till look like a printer.
 */
export default function PackagesReceipt() {
  const [rows, setRows] = useState(17)
  const [copies, setCopies] = useState(5)
  const [busy, setBusy] = useState(false)
  const [planBusy, setPlanBusy] = useState('')

  const [lines, setLines] = useState([])
  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' })
  const [receiptNo, setReceiptNo] = useState('')
  const [discount, setDiscount] = useState('')
  // Typed in, not worked out. Leave one empty and it prints as a blank box to
  // fill in by hand.
  const [subtotalInput, setSubtotalInput] = useState('')
  const [grandTotalInput, setGrandTotalInput] = useState('')
  // A receipt written by hand is still a sale, so by default the money goes
  // into the day's takings. Turned off, the sheet prints and nothing is
  // recorded — which is what a quote is.
  const [recordSale, setRecordSale] = useState(true)
  const [payMethod, setPayMethod] = useState('cash')
  // Goods picked from the catalogue come off the shelf. A hand-typed line
  // names nothing the system knows, so there is nothing to take off for it.
  const [takeStock, setTakeStock] = useState(true)
  // What the customer actually handed over. Leave it empty and they paid the
  // lot; type less than the grand total and the rest becomes a debt.
  const [amountPaidInput, setAmountPaidInput] = useState('')
  // Typed like the rest, but filled in for you from grand total less paid
  // until you type in it yourself.
  const [balanceDueInput, setBalanceDueInput] = useState('')
  const [balanceTouched, setBalanceTouched] = useState(false)


  const { data: productData, isFetching } = useQuery({
    queryKey: ['form-products', search],
    queryFn: () => getProducts({ search, limit: 8 }).then(r => r.data),
    enabled: search.trim().length > 1,
  })
  const results = productData?.products || productData?.data || productData || []

  const addProduct = (p) => {
    setLines(prev => {
      // Adding the same product again bumps its quantity rather than putting a
      // second line on the sheet — two lines for one item is how a written
      // total ends up disagreeing with what was actually handed over.
      const existing = prev.find(
        l => l.product_id === p._id || l.name.trim().toLowerCase() === p.name.trim().toLowerCase()
      )
      if (existing) {
        toast.success(`${p.name} is already on the receipt — quantity increased`)
        return prev.map(l => (l.key === existing.key
          ? { ...l, quantity: (parseFloat(l.quantity) || 0) + 1 }
          : l))
      }
      return [...prev, {
        key: `${p._id}-${Date.now()}`,
        product_id: p._id,
        name: p.name,
        quantity: 1,

      }]
    })
    setSearch('')
  }

  const addBlankLine = () =>
    setLines(prev => [...prev, { key: `manual-${Date.now()}`, name: '', quantity: 1 }])

  const updateLine = (key, field, value) =>
    setLines(prev => prev.map(l => (
      l.key === key
        // A hand-typed line stops tracking a catalogue product once its name is
        // edited, or the duplicate check above would match the wrong thing.
        ? { ...l, [field]: value, ...(field === 'name' ? { product_id: undefined } : {}) }
        : l
    )))

  /** Names appearing on more than one line, flagged in the list below. */
  const duplicateNames = lines.reduce((acc, l) => {
    const key = l.name.trim().toLowerCase()
    if (!key) return acc
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const removeLine = (key) => setLines(prev => prev.filter(l => l.key !== key))


  const hasLines = lines.some(l => l.name.trim())

  // How many lines name a real product, and so can leave the shelf.
  const fromCatalogue = lines.filter(l => l.product_id && (parseFloat(l.quantity) || 0) > 0).length

  // Typed money counts as a filled receipt too. Without this, a sheet with the
  // figures entered but no item line printed as a blank form and threw them
  // away.
  const hasMoney = [subtotalInput, discount, grandTotalInput, amountPaidInput, balanceDueInput]
    .some(v => v !== '' && parseFloat(v) > 0)
  const isFilled = hasLines || hasMoney

  // What grand total less paid comes to, used to fill the balance box in.
  const suggestedBalance = (() => {
    const total = parseFloat(grandTotalInput)
    const paid = parseFloat(amountPaidInput)
    if (!Number.isFinite(total) || !Number.isFinite(paid)) return null
    return Math.max(0, +(total - paid).toFixed(2))
  })()

  // Keep the balance box in step until someone types their own figure in it.
  useEffect(() => {
    if (balanceTouched) return
    setBalanceDueInput(suggestedBalance == null ? '' : String(suggestedBalance))
  }, [suggestedBalance, balanceTouched])

  // What actually goes to Debts: whatever is in the balance box.
  const owing = Math.max(0, parseFloat(balanceDueInput) || 0)

  const print = async () => {
    setBusy(true)
    try {
      // Must stay inside the click: openPdfInNewTab opens the tab before the
      // request so the browser does not treat it as an unsolicited popup.
      if (isFilled) {
        await openPdfInNewTab(() => getFilledReceiptForm({
          rows: Number(rows),
          copies: 1,
          discount: discount === '' ? undefined : parseFloat(discount),
          subtotal: subtotalInput === '' ? undefined : parseFloat(subtotalInput),
          grandTotal: grandTotalInput === '' ? undefined : parseFloat(grandTotalInput),
          record: recordSale,
          deductStock: takeStock,
          payment_method: payMethod,
          amountPaid: amountPaidInput === '' ? undefined : parseFloat(amountPaidInput),
          balanceDue: balanceDueInput === '' ? undefined : parseFloat(balanceDueInput),
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
              product_id: l.product_id,
              name: l.name.trim(),
              quantity: parseFloat(l.quantity) || 0,
            })),
        }), 'receipt.pdf')

        // Printing a second copy must not book the money twice. The switch
        // turns itself off once the sale is in, so another print is just
        // paper.
        if (recordSale && grandTotalInput !== '' && parseFloat(grandTotalInput) > 0) {
          setRecordSale(false)
          // Stock comes off with the sale, so it must not come off again on a
          // reprint either.
          setTakeStock(false)
          const paidNow = amountPaidInput === ''
            ? parseFloat(grandTotalInput)
            : parseFloat(amountPaidInput)
          toast.success(
            owing > 0
              ? `${formatCurrency(paidNow)} added to today's sales. `
                + `${formatCurrency(owing)} is now in Debts and will count when it is paid.`
              : `${formatCurrency(paidNow)} added to today's sales. `
                + 'Printing again will not record it twice.',
            { duration: 8000 }
          )
        }
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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-1">
      <PageHeader
        title="Packages Receipt"
        subtitle="Write a receipt at the counter. What the customer pays goes into today's sales; any balance goes to Debts."
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        <div className="flex gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
          <FiFileText className="text-orange-500 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-orange-800">
            An A4 receipt on the company letterhead. Leave everything empty to print
            blank pads for the counter, or fill it in to print one made out.
            <span className="font-bold"> The money is recorded</span> — what the customer
            pays goes into today's sales, and any balance goes to Debts under their name.
            Goods picked from the catalogue<span className="font-bold"> come off the
            shelf</span> too; lines typed by hand do not, because they name nothing the
            system knows.
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
                ) : results.map(p => {
                  const added = lines.some(
                    l => l.product_id === p._id || l.name.trim().toLowerCase() === p.name.trim().toLowerCase()
                  )
                  return (
                    <button
                      key={p._id}
                      onClick={() => addProduct(p)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-orange-50"
                    >
                      <span className="text-sm text-gray-800 truncate">
                        {p.name}
                        {added && (
                          <span className="ml-2 text-[10px] font-bold text-amber-600 uppercase">
                            already added
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-bold text-gray-500 flex-shrink-0">
                        {p.selling_price != null ? formatCurrency(p.selling_price) : ''}
                      </span>
                    </button>
                  )
                })}
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
                    title={duplicateNames[l.name.trim().toLowerCase()] > 1
                      ? 'This item is on the receipt more than once'
                      : undefined}
                    className={`flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                      duplicateNames[l.name.trim().toLowerCase()] > 1
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-200'
                    }`}
                  />
                  <input
                    type="number"
                    min="0"
                    value={l.quantity}
                    onChange={e => updateLine(l.key, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
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

          {Object.values(duplicateNames).some(n => n > 1) && (
            <p className="mt-2 text-xs text-amber-700">
              An item appears on more than one line. Merge them so the printed total
              matches what the customer takes home.
            </p>
          )}

          <button
            onClick={addBlankLine}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
          >
            <FiPlus size={14} /> Add a line manually
          </button>
        </div>

        {/* ── Customer and the money ─────────────────────────────────────
            Always on show. These used to appear only once an item line had
            been typed, so opening the page and pressing print gave a blank
            sheet and the boxes were never seen at all. */}
        {true && (
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

            <div className="p-3 bg-gray-50 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                The money — type each figure
              </p>

              {[
                ['Subtotal', subtotalInput, setSubtotalInput, false],
                ['Discount', discount, setDiscount, false],
                ['Grand total', grandTotalInput, setGrandTotalInput, true],
                ['Paid', amountPaidInput, setAmountPaidInput, false],
              ].map(([label, value, setter, bold]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className={`text-sm ${bold ? 'font-bold text-gray-800' : 'text-gray-600'}`}>
                    {label}
                  </span>
                  <input
                    type="number" min="0" step="0.01"
                    value={value}
                    onChange={e => setter(e.target.value)}
                    placeholder="0.00"
                    className={`w-44 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                      bold ? 'font-bold text-orange-700' : ''
                    }`}
                  />
                </div>
              ))}

              {/* Filled in from grand total less paid, and overwritable. */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-red-700">Balance due</span>
                <input
                  type="number" min="0" step="0.01"
                  value={balanceDueInput}
                  onChange={e => { setBalanceTouched(true); setBalanceDueInput(e.target.value) }}
                  placeholder="0.00"
                  className="w-44 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right font-bold text-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              {balanceTouched && suggestedBalance != null && (
                <button
                  type="button"
                  onClick={() => { setBalanceTouched(false); setBalanceDueInput(String(suggestedBalance)) }}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                >
                  Work it out again ({formatCurrency(suggestedBalance)})
                </button>
              )}

              <div className="pt-2 mt-1 border-t border-gray-200 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recordSale}
                    onChange={e => setRecordSale(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-orange-500"
                  />
                  <span className="text-sm text-gray-700">
                    Add this to today's sales
                    <span className="block text-xs text-gray-500">
                      Records what the customer actually paid. Any balance goes
                      to Debts and counts on the day it is settled. Stock is not
                      touched. Turn this off for a quote.
                    </span>
                  </span>
                </label>

                {/* Only worth asking about when something on the sheet came
                    from the catalogue — there is nothing to take off the shelf
                    for a line typed by hand. */}
                {fromCatalogue > 0 && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={takeStock}
                      onChange={e => setTakeStock(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-orange-500"
                    />
                    <span className="text-sm text-gray-700">
                      Take these off stock
                      <span className="block text-xs text-gray-500">
                        {fromCatalogue} line{fromCatalogue === 1 ? '' : 's'} from the catalogue
                        will come off the shelf. Hand-typed lines are left alone.
                      </span>
                    </span>
                  </label>
                )}

                {recordSale && (
                  <>
                    {owing > 0 && (
                      <p className="text-xs font-bold text-red-700 text-right">
                        {formatCurrency(owing)} goes to Debts under {customer.name.trim() || 'the customer'}
                      </p>
                    )}
                    {owing > 0 && !customer.name.trim() && (
                      <p className="text-xs text-red-600 text-right">
                        Enter the customer's name — a balance has to be owed by somebody.
                      </p>
                    )}
                    <div className="flex gap-2">
                      {[['cash', 'Cash'], ['mobile_money', 'Mobile Money'], ['card', 'Card']].map(([v, label]) => (
                        <button
                          key={v} type="button" onClick={() => setPayMethod(v)}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg border ${
                            payMethod === v
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-white text-gray-600 border-gray-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
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
              disabled={isFilled}
              onChange={e => setCopies(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              {isFilled
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
          {busy ? 'Preparing…' : isFilled ? 'Print this receipt' : 'Print blank receipt forms'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Opens in a new tab — print it from there on your A4 printer.
        </p>
      </div>
    </div>
  )
}
