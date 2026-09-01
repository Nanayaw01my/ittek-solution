import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiPrinter, FiFileText, FiSearch, FiX, FiPlus, FiThermometer, FiBatteryCharging, FiZap, FiSun, FiAward, FiSmartphone, FiTag } from 'react-icons/fi'
import { getBlankReceiptForm, getFilledReceiptForm, getInstallmentPlanSheet, getPriceSheet, getAcceptanceLetter, getPhonePlanSheet, getIphonePlanSheet } from '../api/forms'
import { getProducts } from '../api/products'
import { openPdfInNewTab } from '../utils/openPdf'
import { formatCurrency, formatDate } from '../utils/helpers'
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
  const [planBusy, setPlanBusy] = useState('')

  const [lines, setLines] = useState([])
  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' })
  const [receiptNo, setReceiptNo] = useState('')
  const [discount, setDiscount] = useState('')

  // Acceptance letter for a student on attachment or internship. Only the name
  // is required — the letter is written from whatever is filled in.
  const [letter, setLetter] = useState({
    name: '', title: '', institution: '', programme: '',
    kind: 'attachment', startDate: '', endDate: '', department: '',
    addressee: '', signatoryName: '',
  })
  const [letterBusy, setLetterBusy] = useState(false)

  // Phone installment sheet. The solar packages are fixed offers held in a
  // config file; phone prices move too often for that, so the models and
  // figures are typed in here and the sheet is printed from them.
  const [phoneTerm, setPhoneTerm] = useState({ months: 3, weeks: 12 })
  const [phones, setPhones] = useState([
    { key: 'p1', name: '', total: '', deposit: '', cashPrice: '', contents: '' },
  ])
  const [phoneBusy, setPhoneBusy] = useState(false)

  const addPhone = () => setPhones(prev => [
    ...prev,
    { key: `p${Date.now()}`, name: '', total: '', deposit: '', cashPrice: '', contents: '' },
  ])
  const updatePhone = (key, field, value) =>
    setPhones(prev => prev.map(p => (p.key === key ? { ...p, [field]: value } : p)))
  const removePhone = (key) => setPhones(prev => prev.filter(p => p.key !== key))

  /**
   * What each row will print. Shown beside the inputs so the schedule can be
   * checked against the balance before the sheet is handed to a customer —
   * the backend does this same sum, this is only the preview of it.
   */
  const phoneSchedule = (p) => {
    const total = parseFloat(p.total) || 0
    const deposit = Math.min(Math.max(0, parseFloat(p.deposit) || 0), total)
    const balance = total - deposit
    const months = Math.max(1, Number(phoneTerm.months) || 3)
    const weeks = Math.max(1, Number(phoneTerm.weeks) || 12)
    return { total, deposit, balance, monthly: balance / months, weekly: balance / weeks }
  }

  const validPhones = phones.filter(p => p.name.trim() && (parseFloat(p.total) || 0) > 0)

  const printPhonePlan = async () => {
    if (validPhones.length === 0) {
      return toast.error('Add at least one phone with a model and a total price.')
    }
    setPhoneBusy(true)
    try {
      await openPdfInNewTab(
        () => getPhonePlanSheet({
          months: Number(phoneTerm.months) || 3,
          weeks: Number(phoneTerm.weeks) || 12,
          items: validPhones.map(p => ({
            name: p.name.trim(),
            total: parseFloat(p.total) || 0,
            deposit: parseFloat(p.deposit) || 0,
            cashPrice: parseFloat(p.cashPrice) || 0,
            contents: p.contents.trim(),
          })),
        }),
        'phone-installment-plan.pdf'
      )
    } catch (err) {
      toast.error(err.message || 'Could not generate the sheet.')
    } finally {
      setPhoneBusy(false)
    }
  }

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
        unit_price: p.selling_price ?? '',
      }]
    })
    setSearch('')
  }

  const addBlankLine = () =>
    setLines(prev => [...prev, { key: `manual-${Date.now()}`, name: '', quantity: 1, unit_price: '' }])

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

  const printLetter = async () => {
    if (!letter.name.trim()) return toast.error("Enter the person's name.")
    setLetterBusy(true)
    try {
      await openPdfInNewTab(
        () => getAcceptanceLetter({
          ...letter,
          name: letter.name.trim(),
          // A blank date would otherwise print as an empty gap mid-sentence.
          startDate: letter.startDate ? formatDate(letter.startDate) : undefined,
          endDate: letter.endDate ? formatDate(letter.endDate) : undefined,
        }),
        'acceptance-letter.pdf'
      )
    } catch (err) {
      toast.error(err.message || 'Could not generate the letter.')
    } finally {
      setLetterBusy(false)
    }
  }

  const printIphonePlan = async () => {
    setPlanBusy('iphone')
    try {
      await openPdfInNewTab(() => getIphonePlanSheet(), 'iphone-installment-plan.pdf')
    } catch (err) {
      toast.error(err.message || 'Could not generate the sheet.')
    } finally {
      setPlanBusy('')
    }
  }

  const printPriceSheet = async (set) => {
    setPlanBusy(set)
    try {
      await openPdfInNewTab(() => getPriceSheet({ set }), `${set}-prices.pdf`)
    } catch (err) {
      toast.error(err.message || 'Could not generate the sheet.')
    } finally {
      setPlanBusy('')
    }
  }

  const printPlan = async (set, layout) => {
    setPlanBusy(set + (layout || ''))
    try {
      await openPdfInNewTab(
        () => getInstallmentPlanSheet({ set, ...(layout ? { layout } : {}) }),
        `${set}-plan.pdf`
      )
    } catch (err) {
      toast.error(err.message || 'Could not generate the sheet.')
    } finally {
      setPlanBusy('')
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

      {/* Fixed offer sheets rather than forms: the installment packages, their
          terms and their cash prices, for handing to a customer. */}
      {[
        {
          set: 'freezer',
          icon: FiThermometer,
          title: 'DC Freezer Installment Plan',
          blurb: 'Three freezer packages — installment terms, ready cash price and what is in the box.',
        },
        {
          set: 'power-station',
          icon: FiBatteryCharging,
          title: 'Power Station Installment Plan',
          blurb: 'Four power station packages — installment terms and what is in the box.',
        },
        {
          set: 'lithium',
          icon: FiZap,
          title: 'Lithium Battery Installment Plan',
          blurb: 'The 2.56KW and 2KW packages — installment terms, ready cash price and what is in the box.',
        },
      ].map(({ set, icon: Icon, title, blurb }) => (
        <div key={set} className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {blurb} A comparison page first, then one A4 sheet per plan. Signed off by
                the manager and the company.
                <button
                  onClick={() => printPlan(set, 'combined')}
                  disabled={!!planBusy}
                  className="ml-1 underline font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-60"
                >
                  Print only the comparison page
                </button>
              </p>
            </div>
            <button
              onClick={() => printPlan(set)}
              disabled={!!planBusy}
              className="flex items-center gap-2 px-4 py-2.5 border border-orange-300 hover:bg-orange-50 disabled:opacity-60 text-orange-700 rounded-xl font-bold text-sm transition-colors flex-shrink-0"
            >
              <Icon size={16} />
              {planBusy === set ? 'Preparing…' : 'Print'}
            </button>
          </div>
        </div>
      ))}

      {/* A straight price list, not an installment sheet — no deposit, no
          schedule, no late-payment term on it. */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Solar Power System Price List</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              The 4KW to 30KW systems and what each costs. Prices only — no installment
              terms on this sheet.
            </p>
          </div>
          <button
            onClick={() => printPriceSheet('solar-systems')}
            disabled={!!planBusy}
            className="flex items-center gap-2 px-4 py-2.5 border border-orange-300 hover:bg-orange-50 disabled:opacity-60 text-orange-700 rounded-xl font-bold text-sm transition-colors flex-shrink-0"
          >
            <FiSun size={16} />
            {planBusy === 'solar-systems' ? 'Preparing…' : 'Print'}
          </button>
        </div>
      </div>

      {/* The standing iPhone offer: priced once in config, printed as a table
          because thirty-three models a page each is nobody's handout. */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">iPhone Installment Plan</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Every model on installment — cash price, total, deposit, and what it costs
              over 3 months or 12 weeks. Half the total is the deposit. Two A4 sheets.
            </p>
          </div>
          <button
            onClick={printIphonePlan}
            disabled={!!planBusy}
            className="flex items-center gap-2 px-4 py-2.5 border border-orange-300 hover:bg-orange-50 disabled:opacity-60 text-orange-700 rounded-xl font-bold text-sm transition-colors flex-shrink-0"
          >
            <FiSmartphone size={16} />
            {planBusy === 'iphone' ? 'Preparing…' : 'Print'}
          </button>
        </div>
      </div>

      {/* Outright prices, the iPhone 7 included — it is cash only. */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">iPhone Price List</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Every model and what it costs paid outright, including the iPhone 7 which is
              not sold on installment. Prices only — no deposit or schedule on this sheet.
            </p>
          </div>
          <button
            onClick={() => printPriceSheet('iphones')}
            disabled={!!planBusy}
            className="flex items-center gap-2 px-4 py-2.5 border border-orange-300 hover:bg-orange-50 disabled:opacity-60 text-orange-700 rounded-xl font-bold text-sm transition-colors flex-shrink-0"
          >
            <FiTag size={16} />
            {planBusy === 'iphones' ? 'Preparing…' : 'Print'}
          </button>
        </div>
      </div>

      {/* A sheet for a phone the standard list does not cover. */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3 mb-4">
          <FiSmartphone className="text-orange-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Custom Phone Installment Sheet</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              For a phone that is not on the standard iPhone sheet above, or a one-off
              deal. Enter the total price and down payment; the weekly and monthly
              payments are worked out from the balance over the term below, so the
              schedule always clears exactly what is owed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Months</label>
            <input
              type="number" min="1"
              value={phoneTerm.months}
              onChange={e => setPhoneTerm(t => ({ ...t, months: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Weeks</label>
            <input
              type="number" min="1"
              value={phoneTerm.weeks}
              onChange={e => setPhoneTerm(t => ({ ...t, weeks: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        <div className="space-y-3">
          {phones.map((p) => {
            const s = phoneSchedule(p)
            return (
              <div key={p.key} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={p.name}
                    onChange={e => updatePhone(p.key, 'name', e.target.value)}
                    placeholder="iPhone 13 Pro Max 256GB"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {phones.length > 1 && (
                    <button
                      onClick={() => removePhone(p.key)}
                      className="px-2 text-gray-400 hover:text-red-500"
                      title="Remove"
                    >
                      <FiX size={16} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number" min="0" value={p.total}
                    onChange={e => updatePhone(p.key, 'total', e.target.value)}
                    placeholder="Total price"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="number" min="0" value={p.deposit}
                    onChange={e => updatePhone(p.key, 'deposit', e.target.value)}
                    placeholder="Down payment"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="number" min="0" value={p.cashPrice}
                    onChange={e => updatePhone(p.key, 'cashPrice', e.target.value)}
                    placeholder="Cash price (optional)"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <input
                  value={p.contents}
                  onChange={e => updatePhone(p.key, 'contents', e.target.value)}
                  placeholder="What is in the box, separated by commas (optional)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />

                {s.total > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs bg-orange-50 rounded-lg px-3 py-2">
                    <span className="text-gray-600">
                      Balance <span className="font-bold text-gray-800">{formatCurrency(s.balance)}</span>
                    </span>
                    <span className="text-gray-600">
                      Monthly × {phoneTerm.months}{' '}
                      <span className="font-bold text-orange-700">{formatCurrency(s.monthly)}</span>
                    </span>
                    <span className="text-gray-600">
                      Weekly × {phoneTerm.weeks}{' '}
                      <span className="font-bold text-orange-700">{formatCurrency(s.weekly)}</span>
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={addPhone}
          className="mt-3 flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          <FiPlus size={16} /> Add another phone
        </button>

        <button
          onClick={printPhonePlan}
          disabled={phoneBusy}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
        >
          <FiPrinter size={16} />
          {phoneBusy ? 'Preparing…' : 'Print phone installment sheet'}
        </button>
      </div>

      {/* Acceptance letter for a student on attachment or internship. */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3 mb-4">
          <FiAward className="text-orange-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Attachment / Internship Acceptance Letter</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Confirms that the person named has been accepted to do their attachment or
              internship here. Only the name is required — the letter is written from
              whatever you fill in.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={letter.title}
            onChange={e => setLetter({ ...letter, title: e.target.value })}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Title (optional)</option>
            <option value="Mr.">Mr.</option>
            <option value="Mrs.">Mrs.</option>
            <option value="Ms.">Ms.</option>
            <option value="Miss">Miss</option>
          </select>
          <input
            value={letter.name}
            onChange={e => setLetter({ ...letter, name: e.target.value })}
            placeholder="Full name *"
            className="sm:col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            value={letter.institution}
            onChange={e => setLetter({ ...letter, institution: e.target.value })}
            placeholder="School or institution"
            className="sm:col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <select
            value={letter.kind}
            onChange={e => setLetter({ ...letter, kind: e.target.value })}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="attachment">Industrial attachment</option>
            <option value="internship">Internship</option>
          </select>
          <input
            value={letter.programme}
            onChange={e => setLetter({ ...letter, programme: e.target.value })}
            placeholder="Programme or course"
            className="sm:col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            value={letter.department}
            onChange={e => setLetter({ ...letter, department: e.target.value })}
            placeholder="Unit they join"
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Start date</label>
            <input
              type="date"
              value={letter.startDate}
              onChange={e => setLetter({ ...letter, startDate: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">End date</label>
            <input
              type="date"
              value={letter.endDate}
              onChange={e => setLetter({ ...letter, endDate: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <input
            value={letter.signatoryName}
            onChange={e => setLetter({ ...letter, signatoryName: e.target.value })}
            placeholder="Who signs it"
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            value={letter.addressee}
            onChange={e => setLetter({ ...letter, addressee: e.target.value })}
            placeholder="Addressed to (default: To Whom It May Concern)"
            className="sm:col-span-3 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <button
          onClick={printLetter}
          disabled={letterBusy}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
        >
          <FiPrinter size={16} />
          {letterBusy ? 'Preparing…' : 'Print acceptance letter'}
        </button>
      </div>
    </div>
  )
}
