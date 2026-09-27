import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiFileText, FiPlus, FiSearch, FiX, FiTrash2, FiCheckCircle,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, getRoleLevel } from '../utils/helpers'
import { getProducts } from '../api/products'
import { getCachedProducts } from '../utils/offlineQueue'
import useOnlineStatus from '../hooks/useOnlineStatus'
import {
  getQuotations, createQuotation, updateQuotation, acceptQuotation, deleteQuotation,
} from '../api/quotations'
import useAuthStore from '../store/authStore'

const STATUS_STYLES = {
  draft: 'bg-gray-200 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
}

const when = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—')

/** Pricing a job up: the customer, the lines, and what it comes to. */
function QuoteModal({ quote, onClose }) {
  const queryClient = useQueryClient()
  const isOnline = useOnlineStatus()
  const editing = !!quote

  const [form, setForm] = useState({
    customer_name: quote?.customer_name || '',
    customer_phone: quote?.customer_phone || '',
    customer_address: quote?.customer_address || '',
    discount: quote?.discount ? String(quote.discount) : '',
    valid_until: quote?.valid_until ? format(new Date(quote.valid_until), 'yyyy-MM-dd') : '',
    notes: quote?.notes || '',
  })
  const [lines, setLines] = useState(
    quote?.items?.map((i) => ({ ...i, quantity: String(i.quantity), unit_price: String(i.unit_price) }))
    || []
  )
  const [search, setSearch] = useState('')

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const cached = useMemo(() => getCachedProducts() || [], [])
  const { data: productData } = useQuery({
    queryKey: ['quote-products', search],
    queryFn: () => getProducts({ search, limit: 8 }).then((r) => r.data),
    enabled: isOnline && search.trim().length > 1,
  })
  const offline = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return cached.filter((p) => `${p.name || ''}`.toLowerCase().includes(q)).slice(0, 8)
  }, [cached, search])
  const results = isOnline
    ? (productData?.products || productData?.data || productData || [])
    : offline

  const addLine = (p) => {
    setLines((prev) => [...prev, {
      product_id: p?._id,
      product_name: p?.name || '',
      quantity: '1',
      unit_price: p?.selling_price != null ? String(p.selling_price) : '',
    }])
    setSearch('')
  }
  const editLine = (i, k, v) => setLines((prev) =>
    prev.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const dropLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const subtotal = lines.reduce(
    (t, l) => t + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
  const discount = Number(form.discount) || 0
  const total = Math.max(0, subtotal - discount)

  const payload = (status) => ({
    ...form,
    discount,
    valid_until: form.valid_until || undefined,
    status,
    items: lines
      .filter((l) => l.product_name.trim() && Number(l.quantity) > 0)
      .map((l) => ({
        product_id: l.product_id,
        product_name: l.product_name.trim(),
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price) || 0,
      })),
  })

  const save = useMutation({
    mutationFn: (status) => (editing
      ? updateQuotation(quote._id, payload(status))
      : createQuotation(payload(status))),
    onSuccess: (res) => {
      toast.success(`${res.data.reference} — ${formatCurrency(res.data.total_amount)}`,
        { duration: 6000 })
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save the quote'),
  })

  const ready = form.customer_name.trim()
    && lines.some((l) => l.product_name.trim() && Number(l.quantity) > 0)
  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <Modal isOpen onClose={onClose} title={editing ? `${quote.reference}` : 'New quotation'} size="lg">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Customer *</label>
            <input value={form.customer_name} onChange={set('customer_name')}
              placeholder="Name" className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
            <input value={form.customer_phone} onChange={set('customer_phone')}
              placeholder="0244…" className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Where</label>
            <input value={form.customer_address} onChange={set('customer_address')}
              placeholder="Bogoso" className={field} />
          </div>
        </div>

        {/* ── The lines ───────────────────────────────────────────────── */}
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Add items</label>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the catalogue…" className={`${field} pl-9`}
            />
          </div>
          {!isOnline && cached.length > 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              Offline — searching the {cached.length} products saved on this device.
            </p>
          )}
          {search.trim().length > 1 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">No products found</p>
              ) : results.map((p) => (
                <button key={p._id} type="button" onClick={() => addLine(p)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                  <span className="font-semibold text-gray-900">{p.name}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {formatCurrency(p.selling_price)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => addLine(null)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-gray-900">
            <FiPlus size={13} /> add a line by hand
          </button>
        </div>

        {lines.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                <tr>
                  <th className="text-left px-2 py-2 font-bold">Item</th>
                  <th className="px-2 py-2 font-bold w-16">Qty</th>
                  <th className="px-2 py-2 font-bold w-28">Price</th>
                  <th className="text-right px-2 py-2 font-bold w-24">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input value={l.product_name}
                        onChange={(e) => editLine(i, 'product_name', e.target.value)}
                        placeholder="Item"
                        className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="1" value={l.quantity}
                        onChange={(e) => editLine(i, 'quantity', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" step="0.01" min="0" value={l.unit_price}
                        onChange={(e) => editLine(i, 'unit_price', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm" />
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold text-gray-900">
                      {formatCurrency((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))}
                    </td>
                    <td className="px-1">
                      <button type="button" onClick={() => dropLine(i)}
                        className="p-1 text-gray-400 hover:text-red-600"><FiX size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Discount</label>
            <input type="number" step="0.01" min="0" value={form.discount}
              onChange={set('discount')} placeholder="0.00" className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Good until</label>
            <input type="date" value={form.valid_until} onChange={set('valid_until')} className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Note</label>
            <input value={form.notes} onChange={set('notes')}
              placeholder="Anything to add" className={field} />
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
          <div className="text-xs text-gray-600">
            <p>Subtotal {formatCurrency(subtotal)}</p>
            {discount > 0 && <p>Less discount {formatCurrency(discount)}</p>}
          </div>
          <p className="text-xl font-black text-gray-900">{formatCurrency(total)}</p>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => save.mutate('draft')} disabled={!ready || save.isPending}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl font-bold text-sm text-gray-700 disabled:opacity-50">
            Save as draft
          </button>
          <button onClick={() => save.mutate('sent')} disabled={!ready || save.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {save.isPending ? 'Saving…' : 'Given to customer'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** They said yes. */
function AcceptModal({ quote, onClose }) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState('cash')
  const [paid, setPaid] = useState(String(quote.total_amount))

  const taken = Math.min(Number(paid) || 0, quote.total_amount)
  const owing = Number((quote.total_amount - taken).toFixed(2))

  const accept = useMutation({
    mutationFn: () => acceptQuotation(quote._id, { payment_method: method, amount_paid: taken }),
    onSuccess: (res) => {
      toast.success(
        `${res.data.reference} sold as ${res.data.invoice_no}`
        + (owing > 0 ? ` — ${formatCurrency(owing)} owing` : ''),
        { duration: 9000 }
      )
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not turn it into a sale'),
  })

  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400'

  return (
    <Modal isOpen onClose={onClose} title={`${quote.reference} — accepted`} size="sm">
      <div className="p-5 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">This will</p>
          <ul className="text-sm text-amber-900 mt-1 space-y-0.5">
            <li>• write a sale for {formatCurrency(quote.total_amount)} at the quoted prices</li>
            <li>• take {quote.items.filter((i) => i.product_id).length} catalogue line
              {quote.items.filter((i) => i.product_id).length === 1 ? '' : 's'} off stock</li>
            {owing > 0 && <li>• record {formatCurrency(owing)} as owing</li>}
          </ul>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Paying now</label>
          <input type="number" step="0.01" min="0" max={quote.total_amount}
            value={paid} onChange={(e) => setPaid(e.target.value)} className={field} />
          <p className="mt-1 text-[11px] text-gray-500">
            Only what they hand over counts in today's sales.
          </p>
        </div>

        <div className="flex gap-2">
          {[['cash', 'Cash'], ['mobile_money', 'MoMo'], ['card', 'Card']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMethod(v)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg border ${
                method === v ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => accept.mutate()} disabled={accept.isPending}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            <FiCheckCircle className="inline mr-1" />
            {accept.isPending ? 'Selling…' : 'Turn into a sale'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Quotations() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState(null)
  const [accepting, setAccepting] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const canDelete = getRoleLevel(user?.role) >= 2

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', statusFilter],
    queryFn: () => getQuotations({ status: statusFilter || undefined }).then((r) => r.data),
  })
  const quotes = data?.quotations || []
  const summary = data?.summary || {}

  const remove = useMutation({
    mutationFn: (id) => deleteQuotation(id),
    onSuccess: () => {
      toast.success('Quotation deleted.')
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not delete it'),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quotations"
        subtitle="Price a job up, and find out how many turn into sales"
        action={
          <div className="flex items-center gap-2">
            <RefreshButton keys={['quotations']} />
            <button onClick={() => setComposing(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm">
              <FiPlus /> New quote
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Out with customers</p>
          <p className="text-xl font-black text-gray-900">{summary.open || 0}</p>
          <p className="text-[11px] text-gray-500">{formatCurrency(summary.open_value || 0)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Won</p>
          <p className="text-xl font-black text-green-700">{summary.won || 0}</p>
          <p className="text-[11px] text-gray-500">{formatCurrency(summary.won_value || 0)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Of those answered</p>
          <p className="text-xl font-black text-gray-900">
            {summary.win_rate == null ? '—' : `${summary.win_rate}%`}
          </p>
          <p className="text-[11px] text-gray-500">said yes</p>
        </div>
      </div>

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
        <option value="">All quotes</option>
        {['draft', 'sent', 'accepted', 'declined', 'expired'].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {isLoading ? <LoadingSpinner /> : quotes.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiFileText className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">No quotations yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <div key={q._id} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900">{q.customer_name}</p>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${STATUS_STYLES[q.effective_status]}`}>
                      {q.effective_status}
                    </span>
                    {q.invoice_no && (
                      <span className="text-[11px] font-bold text-green-700">→ {q.invoice_no}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {q.reference} · {q.items.length} item{q.items.length === 1 ? '' : 's'} ·{' '}
                    {when(q.createdAt)}
                    {q.prepared_by?.username ? ` · by ${q.prepared_by.username}` : ''}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">
                    {q.items.map((i) => `${i.quantity} × ${i.product_name}`).slice(0, 3).join(', ')}
                    {q.items.length > 3 ? ` +${q.items.length - 3} more` : ''}
                  </p>
                  {q.valid_until && (
                    <p className={`text-[11px] mt-0.5 ${q.lapsed ? 'text-amber-700 font-bold' : 'text-gray-500'}`}>
                      {q.lapsed ? 'Price ran out' : 'Good until'} {when(q.valid_until)}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <p className="text-lg font-black text-gray-900">
                    {formatCurrency(q.total_amount)}
                  </p>
                  <div className="flex items-center gap-2">
                    {q.status !== 'accepted' && (
                      <>
                        <button onClick={() => setEditing(q)}
                          className="px-3 py-1.5 text-xs font-bold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
                          Edit
                        </button>
                        <button onClick={() => setAccepting(q)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700">
                          Accepted
                        </button>
                      </>
                    )}
                    {canDelete && q.status !== 'accepted' && (
                      <button onClick={() => setDeleting(q)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><FiTrash2 /></button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {composing && <QuoteModal onClose={() => setComposing(false)} />}
      {editing && <QuoteModal quote={editing} onClose={() => setEditing(null)} />}
      {accepting && <AcceptModal quote={accepting} onClose={() => setAccepting(null)} />}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting._id)}
        title="Delete this quotation?"
        message={`${deleting?.reference} for ${deleting?.customer_name}.`}
        confirmText="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  )
}
