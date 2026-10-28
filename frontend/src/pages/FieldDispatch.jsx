import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiTruck, FiPlus, FiPrinter, FiSearch, FiTrash2, FiCornerUpLeft, FiCheckCircle,
  FiDollarSign,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency, getRoleLevel } from '../utils/helpers'
import { openPdfInNewTab } from '../utils/openPdf'
import { getProducts } from '../api/products'
import {
  getDispatches, getFieldAgents, createDispatch, returnDispatchItems, payDispatchItems,
  closeDispatch, deleteDispatch, getDispatchSheet, getDispatchesByAgent,
} from '../api/dispatches'
import useAuthStore from '../store/authStore'
import { isOwner } from '../config/pageAccess'

const STATUS_STYLES = {
  issued: 'bg-blue-100 text-blue-700',
  partly_returned: 'bg-amber-100 text-amber-700',
  closed: 'bg-green-100 text-green-700',
}

const STATUS_LABELS = {
  issued: 'Out on field',
  partly_returned: 'Part returned',
  closed: 'Closed',
}

// A piece leaves the sheet either by being paid for or by coming back.
const stillOut = (item) =>
  item.quantity_issued - (item.quantity_returned || 0) - (item.quantity_sold || 0)

/** Pick products and quantities, then issue the sheet. */
function NewDispatchModal({ onClose }) {
  const queryClient = useQueryClient()
  const [agentId, setAgentId] = useState('')
  const [agentPhone, setAgentPhone] = useState('')
  const [destination, setDestination] = useState('')
  // Stock for an agent already out joins the sheet they have. Ticked only
  // when it really is a separate trip.
  const [newSheet, setNewSheet] = useState(false)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState([])

  // Who the goods can be handed to. A sheet must be tied to a real login, or
  // it would never appear in that rep's portal.
  const { data: agentData } = useQuery({
    queryKey: ['field-agents'],
    queryFn: () => getFieldAgents().then((r) => r.data),
  })
  const agents = agentData || []

  const { data, isLoading } = useQuery({
    queryKey: ['dispatch-products', search],
    queryFn: () => getProducts({ search: search || undefined, limit: 50 }).then((r) => r.data),
    keepPreviousData: true,
  })
  // The response interceptor has already unwrapped { success, data }.
  const products = data?.products || data || []

  const addLine = (product) => {
    if (lines.some((l) => l.product_id === product._id)) {
      toast('Already on the sheet')
      return
    }
    setLines((prev) => [...prev, {
      product_id: product._id,
      name: product.name,
      available: product.quantity,
      unit_price: product.selling_price,
      quantity: 1,
    }])
  }

  const setQty = (id, qty) =>
    setLines((prev) => prev.map((l) => (l.product_id === id ? { ...l, quantity: qty } : l)))

  const removeLine = (id) => setLines((prev) => prev.filter((l) => l.product_id !== id))

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * l.unit_price, 0),
    [lines]
  )

  const overStocked = lines.filter((l) => Number(l.quantity) > l.available)

  const mutation = useMutation({
    mutationFn: () => createDispatch({
      agent_user_id: agentId,
      agent_phone: agentPhone || undefined,
      destination: destination || undefined,
      notes: notes || undefined,
      new_sheet: newSheet || undefined,
      items: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
    }),
    onSuccess: (res) => {
      // The interceptor unwraps { success, data }, so res.data is the dispatch.
      const dispatch = res.data
      // The interceptor keeps only `data`, so the top-up is flagged inside it.
      toast.success(
        dispatch?.added_to_existing
          ? `${dispatch.added_quantity} more added to ${dispatch.dispatch_no} — stock deducted`
          : `Dispatch ${dispatch?.dispatch_no || ''} issued — stock deducted`,
        { duration: 6000 }
      )
      queryClient.invalidateQueries({ queryKey: ['dispatches'] })
      queryClient.invalidateQueries({ queryKey: ['dispatches-by-agent'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onClose()
      // Straight to the sheet — it is the point of the exercise.
      if (dispatch?._id) {
        openPdfInNewTab(() => getDispatchSheet(dispatch._id), `${dispatch.dispatch_no}.pdf`)
      }
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not issue the dispatch'),
  })

  const canSubmit = agentId && lines.length > 0 && overStocked.length === 0
    && lines.every((l) => Number(l.quantity) > 0)

  return (
    <Modal isOpen onClose={onClose} title="Issue goods to a field agent" size="lg">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Field agent *</label>
            <select
              value={agentId} onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Who is taking the goods?</option>
              {agents.map((a) => (
                <option key={a._id} value={a._id}>{a.username}</option>
              ))}
            </select>
            {agents.length === 0 && (
              <p className="text-xs text-red-600 mt-1">
                No field agents yet. Ask the CEO to create one in User Management.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
            <input
              value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Area / destination</label>
            <input
              value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Tarkwa"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 cursor-pointer">
          <input type="checkbox" checked={newSheet} onChange={(e) => setNewSheet(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-orange-500" />
          <span>
            <span className="font-bold">Start a separate sheet</span>
            <span className="block text-gray-500">
              Normally goods for an agent who is still out are added to the sheet
              they already have, so everything of theirs is reconciled in one
              place. Tick this only when it is genuinely a different trip.
            </span>
          </span>
        </label>

        <div>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products to add…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="mt-2 max-h-44 overflow-y-auto border border-gray-100 rounded-xl divide-y">
            {isLoading && <div className="p-4"><LoadingSpinner /></div>}
            {!isLoading && products.length === 0 && (
              <p className="p-3 text-sm text-gray-500">No products found.</p>
            )}
            {products.map((p) => (
              <button
                key={p._id} type="button" onClick={() => addLine(p)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-orange-50"
              >
                <span className="text-sm text-gray-800">{p.name}</span>
                <span className="text-xs text-gray-500">
                  {p.quantity} in stock · {formatCurrency(p.selling_price)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl">
          <div className="px-3 py-2 bg-gray-50 text-xs font-bold text-gray-600 rounded-t-xl">
            ON THIS SHEET ({lines.length})
          </div>
          {lines.length === 0 && (
            <p className="p-3 text-sm text-gray-500">Nothing added yet.</p>
          )}
          {lines.map((l) => (
            <div key={l.product_id} className="flex items-center gap-2 px-3 py-2 border-t">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{l.name}</p>
                <p className="text-xs text-gray-500">{l.available} in stock</p>
              </div>
              <input
                type="number" min="1" max={l.available} value={l.quantity}
                onChange={(e) => setQty(l.product_id, e.target.value)}
                className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-center"
              />
              <button
                type="button" onClick={() => removeLine(l.product_id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
              >
                <FiTrash2 />
              </button>
            </div>
          ))}
        </div>

        {overStocked.length > 0 && (
          <p className="text-xs text-red-600">
            Not enough stock for: {overStocked.map((l) => l.name).join(', ')}
          </p>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-sm text-gray-600">
            Stock value going out: <span className="font-black text-gray-900">{formatCurrency(total)}</span>
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!canSubmit || mutation.isPending}
              className="px-5 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl disabled:opacity-50 hover:bg-orange-700"
            >
              {mutation.isPending ? 'Issuing…' : 'Issue & print'}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Stock is deducted when the sheet is issued. Nothing is recorded as a sale —
          what the agent sells on the field is rung up at the till as normal.
        </p>
      </div>
    </Modal>
  )
}

/** Take back what the agent did not sell. */
function ReturnModal({ dispatch, onClose }) {
  const queryClient = useQueryClient()
  const outstanding = dispatch.items.filter((i) => stillOut(i) > 0)
  const [qtys, setQtys] = useState(() =>
    Object.fromEntries(outstanding.map((i) => [i.product_id, ''])))

  const mutation = useMutation({
    mutationFn: (items) => returnDispatchItems(dispatch._id, { items }),
    onSuccess: (res) => {
      toast.success('Returned items have been added back to stock')
      queryClient.invalidateQueries({ queryKey: ['dispatches'] })
      queryClient.invalidateQueries({ queryKey: ['dispatches-by-agent'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not record the return'),
  })

  const submit = () => {
    const items = outstanding
      .map((i) => ({
        product_id: i.product_id,
        variant_sku: i.variant_sku,
        quantity: Number(qtys[i.product_id]) || 0,
      }))
      .filter((i) => i.quantity > 0)
    if (items.length === 0) {
      toast.error('Enter how many came back')
      return
    }
    mutation.mutate(items)
  }

  const returnAll = () =>
    setQtys(Object.fromEntries(outstanding.map((i) => [i.product_id, String(stillOut(i))])))

  return (
    <Modal isOpen onClose={onClose} title={`Returns — ${dispatch.dispatch_no}`} size="md">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">{dispatch.agent_name}</p>
          <button onClick={returnAll} className="text-xs font-bold text-orange-600 hover:underline">
            Everything came back
          </button>
        </div>

        <div className="border border-gray-100 rounded-xl divide-y">
          {outstanding.map((i) => (
            <div key={String(i.product_id) + (i.variant_sku || '')} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">
                  {i.variant_name ? `${i.product_name} (${i.variant_name})` : i.product_name}
                </p>
                <p className="text-xs text-gray-500">{stillOut(i)} still out</p>
              </div>
              <input
                type="number" min="0" max={stillOut(i)} placeholder="0"
                value={qtys[i.product_id] ?? ''}
                onChange={(e) => setQtys((prev) => ({ ...prev, [i.product_id]: e.target.value }))}
                className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-center"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500">
          What you enter here goes straight back on the shelf. Anything left out is
          what the agent sold on the field.
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">
            Cancel
          </button>
          <button
            onClick={submit} disabled={mutation.isPending}
            className="px-5 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl disabled:opacity-50 hover:bg-orange-700"
          >
            {mutation.isPending ? 'Saving…' : 'Add back to stock'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Take the money for what the agent sold on the field.
 *
 * This is the one action on this page that touches the books — it writes a
 * real sale, so it shows in the day's takings and on every sales report.
 */
function PayModal({ dispatch, onClose }) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  // An agent sells at the shop price. Letting them type the price in would
  // undo the point of the sheet: sell at 900, enter 750, keep the difference,
  // and the stock still balances. A manager at the counter can still adjust.
  const priceLocked = user?.role === 'Field Agent'
  const outstanding = dispatch.items.filter((i) => stillOut(i) > 0)

  const [qtys, setQtys] = useState(() =>
    Object.fromEntries(outstanding.map((i) => [i.product_id, ''])))
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(outstanding.map((i) => [i.product_id, String(i.unit_price)])))
  const [method, setMethod] = useState('cash')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const total = useMemo(
    () => outstanding.reduce(
      (s, i) => s + (Number(qtys[i.product_id]) || 0) * (Number(prices[i.product_id]) || 0),
      0
    ),
    [outstanding, qtys, prices]
  )

  const mutation = useMutation({
    mutationFn: (items) => payDispatchItems(dispatch._id, {
      items,
      payment_method: method,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
    }),
    onSuccess: (res) => {
      const sale = res.data
      toast.success(`Sale ${sale?.invoice_no || ''} recorded`)
      queryClient.invalidateQueries({ queryKey: ['dispatches'] })
      queryClient.invalidateQueries({ queryKey: ['dispatches-by-agent'] })
      // The dashboard cards and the sales screens must pick this up.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not take the payment'),
  })

  const submit = () => {
    const items = outstanding
      .map((i) => ({
        product_id: i.product_id,
        variant_sku: i.variant_sku,
        quantity: Number(qtys[i.product_id]) || 0,
        unit_price: Number(prices[i.product_id]) || undefined,
      }))
      .filter((i) => i.quantity > 0)
    if (items.length === 0) {
      toast.error('Enter how many were sold')
      return
    }
    mutation.mutate(items)
  }

  const sellAll = () =>
    setQtys(Object.fromEntries(outstanding.map((i) => [i.product_id, String(stillOut(i))])))

  return (
    <Modal isOpen onClose={onClose} title={`Payment — ${dispatch.dispatch_no}`} size="md">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {priceLocked ? 'What you sold on the field' : `${dispatch.agent_name} sold on the field`}
          </p>
          <button onClick={sellAll} className="text-xs font-bold text-orange-600 hover:underline">
            Sold everything
          </button>
        </div>

        <div className="border border-gray-100 rounded-xl divide-y">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 text-[11px] font-bold text-gray-500">
            <span className="flex-1">PRODUCT</span>
            <span className="w-20 text-center">QTY SOLD</span>
            <span className="w-24 text-center">PRICE EACH</span>
          </div>
          {outstanding.map((i) => (
            <div key={String(i.product_id) + (i.variant_sku || '')} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">
                  {i.variant_name ? `${i.product_name} (${i.variant_name})` : i.product_name}
                </p>
                <p className="text-xs text-gray-500">{stillOut(i)} still out</p>
              </div>
              <input
                type="number" min="0" max={stillOut(i)} placeholder="0"
                value={qtys[i.product_id] ?? ''}
                onChange={(e) => setQtys((prev) => ({ ...prev, [i.product_id]: e.target.value }))}
                className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-center"
              />
              <input
                type="number" min="0" step="0.01"
                value={prices[i.product_id] ?? ''}
                readOnly={priceLocked}
                onChange={(e) => setPrices((prev) => ({ ...prev, [i.product_id]: e.target.value }))}
                className={`w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-center ${
                  priceLocked ? 'bg-gray-100 text-gray-600' : ''
                }`}
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500">
          {priceLocked
            ? 'Prices are set by the shop and cannot be changed here.'
            : 'The price is the shop price — change it if the agent sold at a different figure.'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <input
            value={customerName} onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer name (optional)"
            className="px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="flex gap-1">
          {[['cash', 'Cash'], ['mobile_money', 'Mobile Money'], ['card', 'Card']].map(([m, label]) => (
            <button
              key={m} onClick={() => setMethod(m)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border ${
                method === m ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-orange-800">Amount paid in</span>
          <span className="text-2xl font-black text-orange-900">{formatCurrency(total)}</span>
        </div>

        <p className="text-xs text-gray-500">
          This is recorded as a sale and goes into today's takings. Stock is not
          touched — it already came off the shelf when the sheet was issued.
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">
            Cancel
          </button>
          <button
            onClick={submit} disabled={mutation.isPending || total <= 0}
            className="px-5 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl disabled:opacity-50 hover:bg-orange-700"
          >
            {mutation.isPending ? 'Recording…' : `Take ${formatCurrency(total)}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Everything one agent is holding, in one card.
 *
 * The screen used to list sheets, newest first, so an agent with three
 * sheets appeared three times with other people's in between — some of
 * their goods up the page and some of it down. And the number anybody
 * actually wants was never on it: how much is this person carrying, and how
 * much have they paid in. You worked it out by scrolling and adding.
 */
function AgentCard({
  agent, staleAfter, showMoney, canTakeMoney, isAgent, owner,
  onPay, onReturn, onClose, onDelete, closing,
}) {
  // The newest sheet open to begin with: it is the one being discussed when
  // somebody walks in. The rest are a line each until they are wanted.
  const [open, setOpen] = useState(() => agent.sheets[0]?._id || null)
  const [showClosed, setShowClosed] = useState(false)

  const { data: closedData, isFetching: loadingClosed } = useQuery({
    queryKey: ['dispatches-closed', agent.agent_key],
    queryFn: () => getDispatches({
      status: 'closed', agent: agent.agent_name, limit: 50,
    }).then((r) => r.data),
    enabled: showClosed && agent.closed_count > 0,
  })
  const closedSheets = closedData?.dispatches || []

  const stale = agent.days_open >= staleAfter && agent.pieces_out > 0
  const initial = (agent.agent_name || '?').charAt(0).toUpperCase()
  const carrying = agent.pieces_out > 0

  const sheetRow = (d, isClosed) => {
    const isOpen = open === d._id
    const out = d.pieces_out ?? d.items.reduce((n, i) => n + stillOut(i), 0)
    return (
      <div key={d._id} className={isOpen ? 'bg-gray-50/70' : ''}>
        <button
          onClick={() => setOpen(isOpen ? null : d._id)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-t border-gray-50 hover:bg-gray-50"
        >
          <span className={`text-gray-300 text-[10px] flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-bold text-gray-700">{d.dispatch_no}</span>
            <span className="block text-[10.5px] text-gray-400 truncate">
              {format(new Date(d.issued_at), 'dd MMM')}
              {d.destination ? ` · ${d.destination}` : ''}
              {` · ${d.items.length} item${d.items.length === 1 ? '' : 's'}`}
              {out > 0 ? ` · ${out} out` : ''}
              {d.top_ups?.length > 0 ? ` · topped up ${d.top_ups.length}×` : ''}
            </span>
          </span>
          <span className={`px-2 py-0.5 text-[9.5px] font-black rounded-full flex-shrink-0 ${STATUS_STYLES[d.status]}`}>
            {STATUS_LABELS[d.status]}
          </span>
        </button>

        {isOpen && (
          <>
            <div className="px-4 pb-2 space-y-0.5">
              {d.items.map((i) => (
                <div key={String(i.product_id) + (i.variant_sku || '')} className="flex justify-between gap-2 text-[11.5px]">
                  <span className="text-gray-700 truncate">
                    {i.variant_name ? `${i.product_name} (${i.variant_name})` : i.product_name}
                  </span>
                  <span className="text-gray-400 flex-shrink-0 tabular-nums">
                    out {i.quantity_issued} · sold {i.quantity_sold || 0} ·
                    {' '}back {i.quantity_returned || 0} · with them {stillOut(i)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 px-4 pb-3">
              <button
                onClick={() => openPdfInNewTab(() => getDispatchSheet(d._id), `${d.dispatch_no}.pdf`)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-bold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <FiPrinter /> Sheet
              </button>
              {!isClosed && canTakeMoney && (
                <button onClick={() => onPay(d)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700">
                  <FiDollarSign /> Pay
                </button>
              )}
              {!isClosed && !isAgent && (
                <button onClick={() => onReturn(d)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-bold text-white bg-green-600 rounded-lg hover:bg-green-700">
                  <FiCornerUpLeft /> Returns
                </button>
              )}
              {!isClosed && !isAgent && (
                <button onClick={() => onClose(d)} disabled={closing}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-bold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  <FiCheckCircle /> Close
                </button>
              )}
              {owner && (
                <button onClick={() => onDelete(d)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-[11.5px] font-bold text-red-600 border border-red-100 rounded-lg hover:bg-red-50">
                  <FiTrash2 />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden ${carrying ? 'border-gray-100' : 'border-gray-100 opacity-75'}`}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0
          ${carrying ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
          {initial}
        </div>
        <div className="min-w-0">
          <p className={`font-black ${carrying ? 'text-gray-900' : 'text-gray-500'}`}>{agent.agent_name}</p>
          <p className="text-[11px] text-gray-500">
            {agent.sheets.length > 0
              ? `${agent.sheets.length} sheet${agent.sheets.length === 1 ? '' : 's'} open`
              : 'Carrying nothing · all settled'}
            {agent.closed_count > 0 ? ` · ${agent.closed_count} closed` : ''}
            {agent.sheets[0] ? ` · last issued ${format(new Date(agent.sheets[0].issued_at), 'dd MMM')}` : ''}
          </p>
        </div>
      </div>

      {/* The figures somebody settles against. Added across every open sheet
          this agent holds, which is the thing the old screen could not do. */}
      {agent.sheets.length > 0 && (
        <div className="flex border-t border-orange-100 bg-orange-50/70 text-center">
          <div className="flex-1 py-2">
            <span className="block text-[9.5px] font-black uppercase tracking-wide text-orange-900/60">With them</span>
            <span className="block text-[15px] font-black text-orange-900 tabular-nums">{agent.pieces_out}</span>
          </div>
          {showMoney && (
            <>
              <div className="flex-1 py-2 border-l border-orange-100">
                <span className="block text-[9.5px] font-black uppercase tracking-wide text-orange-900/60">Value out</span>
                <span className="block text-[15px] font-black text-orange-900 tabular-nums">
                  {formatCurrency(agent.value_out)}
                </span>
              </div>
              <div className="flex-1 py-2 border-l border-orange-100">
                <span className="block text-[9.5px] font-black uppercase tracking-wide text-orange-900/60">Paid in</span>
                <span className="block text-[15px] font-black text-green-700 tabular-nums">
                  {formatCurrency(agent.paid_in)}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {stale && (
        <p className="bg-red-50 border-t border-red-100 text-red-800 text-[11px] font-bold px-4 py-2">
          ⚠ Oldest sheet open {agent.days_open} days — {agent.pieces_out} piece
          {agent.pieces_out === 1 ? '' : 's'} still out
        </p>
      )}

      {agent.sheets.map((d) => sheetRow(d, false))}

      {agent.closed_count > 0 && (
        <>
          {showClosed && closedSheets.map((d) => sheetRow(d, true))}
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="w-full text-left px-4 py-2.5 border-t border-gray-50 text-[11px] font-bold text-gray-400 hover:text-gray-600"
          >
            {loadingClosed ? 'loading…'
              : showClosed ? '▾ hide closed sheets'
                : `▸ show ${agent.closed_count} closed sheet${agent.closed_count === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </div>
  )
}

export default function FieldDispatch() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const owner = isOwner(user?.role)
  // Only the shop takes money. A rep on the field carries goods and comes in
  // to account; the server refuses the payment either way.
  // The agent settles their own sheet from the field; a manager can settle
  // anyone's. A Sales hand at the counter cannot.
  const canTakeMoney = ['Field Agent', 'Manager'].includes(user?.role) || isOwner(user?.role)
  // A rep is handed goods at the counter; they never issue their own sheet,
  // and they cannot see the shop's stock to build one from.
  const isAgent = user?.role === 'Field Agent'

  const [showNew, setShowNew] = useState(false)
  const [returning, setReturning] = useState(null)
  const [paying, setPaying] = useState(null)
  // Which agents to show, rather than which sheets — the question is
  // always about a person.
  const [view, setView] = useState('')

  /**
   * Who is holding what, rather than a list of sheets.
   *
   * Totalled on the server across every open sheet — the sheet list is
   * paginated, and an agent whose fourth sheet fell onto page two would read
   * as carrying less than they are.
   */
  const { data, isLoading } = useQuery({
    queryKey: ['dispatches-by-agent'],
    queryFn: () => getDispatchesByAgent().then((r) => r.data),
  })
  const allAgents = data?.agents || []
  const staleAfter = data?.stale_after_days ?? 14

  /**
   * Money is kept to the people the rest of the system keeps it to.
   *
   * A Sales hand at the counter does not see what the shop is owed, and a
   * field agent sees their own card only — which is already their own sheet
   * in their own hands.
   */
  const showMoney = getRoleLevel(user?.role) >= 2 || isAgent

  const agents = allAgents.filter((a) => {
    if (view === 'carrying') return a.pieces_out > 0
    if (view === 'owing') return a.value_out > a.paid_in && a.pieces_out > 0
    if (view === 'settled') return a.pieces_out === 0
    return true
  })

  const closeMutation = useMutation({
    mutationFn: (id) => closeDispatch(id),
    onSuccess: () => {
      toast.success('Dispatch closed')
      queryClient.invalidateQueries({ queryKey: ['dispatches'] })
      queryClient.invalidateQueries({ queryKey: ['dispatches-by-agent'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not close it'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteDispatch(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Dispatch cancelled — stock put back')
      queryClient.invalidateQueries({ queryKey: ['dispatches'] })
      queryClient.invalidateQueries({ queryKey: ['dispatches-by-agent'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not cancel it'),
  })

  return (
    // Same gutter as every other screen. Without it the heading and
    // the cards sit flush against the edge of a phone.
    <div className="p-4 sm:p-6 space-y-1">
      <PageHeader
        title={isAgent ? 'My Goods' : 'Field Dispatch (DSR)'}
        subtitle={isAgent
          ? 'What you are carrying. Goods are added here by the shop when you collect them.'
          : 'Goods taken out by an agent — stock comes off the shelf, nothing is counted as a sale.'}
        action={!isAgent && (
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700"
          >
            <FiPlus /> New dispatch
          </button>
        )}
      >
        <RefreshButton keys={['dispatches', 'products']} />
      </PageHeader>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {[['', 'All agents'], ['carrying', 'Carrying goods'],
          ...(showMoney ? [['owing', 'Owing money']] : []), ['settled', 'Settled']]
          .map(([value, label]) => (
            <button
              key={value || 'all'} onClick={() => setView(value)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg ${
                view === value ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
      </div>

      {isLoading && <LoadingSpinner />}

      {!isLoading && agents.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiTruck className="mx-auto text-3xl text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            {isAgent
              ? 'You are not carrying anything. The shop adds goods here when you collect them.'
              : view ? 'No agent matches that.' : 'No dispatches yet.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {agents.map((a) => (
          <AgentCard
            key={a.agent_key}
            agent={a}
            staleAfter={staleAfter}
            showMoney={showMoney}
            canTakeMoney={canTakeMoney}
            isAgent={isAgent}
            owner={owner}
            closing={closeMutation.isPending}
            onPay={setPaying}
            onReturn={setReturning}
            onClose={(d) => {
              if (window.confirm('Close this sheet? Anything still out stays off the shelf as sold on the field.')) {
                closeMutation.mutate(d._id)
              }
            }}
            onDelete={(d) => {
              if (window.confirm('Cancel this sheet and put everything still out back into stock?')) {
                deleteMutation.mutate(d._id)
              }
            }}
          />
        ))}
      </div>

      {showNew && <NewDispatchModal onClose={() => setShowNew(false)} />}
      {returning && <ReturnModal dispatch={returning} onClose={() => setReturning(null)} />}
      {paying && <PayModal dispatch={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}
