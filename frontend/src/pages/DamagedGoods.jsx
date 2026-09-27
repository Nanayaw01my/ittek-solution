import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiAlertTriangle, FiPlus, FiTrash2, FiSearch, FiX, FiRotateCcw,
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
  getDamagedGoods, createDamagedGood, updateDamagedGood, deleteDamagedGood,
} from '../api/damagedGoods'
import useAuthStore from '../store/authStore'

const FAULTS = [
  ['damaged', 'Damaged'],
  ['faulty', 'Faulty'],
  ['expired', 'Expired'],
  ['missing', 'Missing'],
  ['other', 'Other'],
]

const OUTCOMES = [
  ['pending', 'Not decided'],
  ['returned', 'Returned to supplier'],
  ['replaced', 'Supplier replaced it'],
  ['written_off', 'Written off'],
]

const OUTCOME_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  returned: 'bg-blue-100 text-blue-700',
  replaced: 'bg-green-100 text-green-700',
  written_off: 'bg-gray-200 text-gray-700',
}

const label = (pairs, v) => (pairs.find(([k]) => k === v) || [, v])[1]

/** Writing a broken thing down, and taking it off the shelf. */
function ReportModal({ onClose }) {
  const queryClient = useQueryClient()
  const isOnline = useOnlineStatus()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  const [form, setForm] = useState({
    product_name: '', quantity: '1', fault: 'damaged',
    description: '', unit_cost: '', outcome: 'pending',
  })

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const cached = useMemo(() => getCachedProducts() || [], [])
  const { data: productData, isFetching } = useQuery({
    queryKey: ['damage-products', search],
    queryFn: () => getProducts({ search, limit: 8 }).then((r) => r.data),
    enabled: isOnline && search.trim().length > 1,
  })
  const offline = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return cached
      .filter((p) => `${p.name || ''} ${p.barcode || ''}`.toLowerCase().includes(q))
      .slice(0, 8)
  }, [cached, search])
  const online = productData?.products || productData?.data || productData || []
  const results = isOnline ? online : offline

  const choose = (p) => {
    setPicked(p)
    setForm((f) => ({
      ...f,
      product_name: p.name,
      // The cost price is what the loss is worth. Not every role is shown one,
      // so it stays typeable.
      unit_cost: f.unit_cost || (p.cost_price != null ? String(p.cost_price) : ''),
    }))
    setSearch('')
  }

  const qty = Number(form.quantity) || 0
  const cost = Number(form.unit_cost) || 0
  const onHand = picked?.quantity

  const save = useMutation({
    mutationFn: () => createDamagedGood({
      product_id: picked?._id,
      product_name: form.product_name.trim(),
      quantity: qty,
      fault: form.fault,
      description: form.description.trim(),
      unit_cost: form.unit_cost === '' ? undefined : cost,
      outcome: form.outcome,
    }),
    onSuccess: (res) => {
      const rec = res.data
      toast.success(
        `${rec?.reference || 'Recorded'} — ${qty} × ${form.product_name}`
        + (picked ? ' taken off stock' : ''),
        { duration: 7000 }
      )
      queryClient.invalidateQueries({ queryKey: ['damaged-goods'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not record it'),
  })

  const tooMany = picked && onHand != null && qty > onHand
  const ready = form.product_name.trim() && qty >= 1 && !tooMany

  return (
    <Modal isOpen onClose={onClose} title="Report damaged or faulty goods" size="md">
      <div className="p-5 space-y-4">
        {/* ── Which product ───────────────────────────────────────────── */}
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Product</label>
          {picked ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{picked.name}</p>
                <p className="text-[11px] text-gray-500">
                  {onHand != null ? `${onHand} on hand` : 'from the catalogue'} — comes off stock
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setPicked(null); setForm((f) => ({ ...f, product_name: '' })) }}
                className="p-1.5 text-gray-400 hover:text-red-600"
              >
                <FiX />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search the catalogue…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              {!isOnline && cached.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-700">
                  Offline — searching the {cached.length} products saved on this device.
                </p>
              )}
              {search.trim().length > 1 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {isFetching ? (
                    <p className="px-3 py-3 text-xs text-gray-400">Searching…</p>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-gray-400">No products found</p>
                  ) : results.map((p) => (
                    <button
                      key={p._id} type="button" onClick={() => choose(p)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    >
                      <span className="font-semibold text-gray-900">{p.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{p.quantity} on hand</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-gray-500">
                Not in the catalogue? Type the name below and nothing comes off stock.
              </p>
            </>
          )}
        </div>

        {!picked && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Name it</label>
            <input
              value={form.product_name} onChange={set('product_name')}
              placeholder="What is broken?"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
        )}

        {/* ── How many, and what is wrong ─────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">How many</label>
            <input
              type="number" min="1" value={form.quantity} onChange={set('quantity')}
              className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 ${
                tooMany ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-red-400'
              }`}
            />
            {tooMany && (
              <p className="mt-1 text-[11px] text-red-600 font-semibold">
                Only {onHand} on hand.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">What is wrong</label>
            <select
              value={form.fault} onChange={set('fault')}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              {FAULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            What happened
          </label>
          <input
            value={form.description} onChange={set('description')}
            placeholder="Screen cracked in the van"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Cost each
            </label>
            <input
              type="number" step="0.01" min="0" value={form.unit_cost} onChange={set('unit_cost')}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">And then?</label>
            <select
              value={form.outcome} onChange={set('outcome')}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-900">
          <p className="font-bold">
            This writes off {formatCurrency(cost * qty)}
          </p>
          <p className="text-xs mt-0.5">
            {picked
              ? `${qty} × ${form.product_name || 'it'} comes off stock straight away.`
              : 'Nothing comes off stock — this item is not in the catalogue.'}
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()} disabled={!ready || save.isPending}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm disabled:opacity-50"
          >
            {save.isPending ? 'Recording…' : 'Record it'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Saying what became of one. */
function OutcomeModal({ record, onClose }) {
  const queryClient = useQueryClient()
  const [outcome, setOutcome] = useState(record.outcome)
  const [note, setNote] = useState(record.outcome_note || '')

  const save = useMutation({
    mutationFn: () => updateDamagedGood(record._id, { outcome, outcome_note: note }),
    onSuccess: () => {
      const back = outcome === 'replaced' && record.outcome !== 'replaced' && record.stock_deducted
      toast.success(
        `${record.reference} — ${label(OUTCOMES, outcome).toLowerCase()}`
        + (back ? `. ${record.quantity} × ${record.product_name} back on stock.` : '.'),
        { duration: 7000 }
      )
      queryClient.invalidateQueries({ queryKey: ['damaged-goods'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not update it'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`${record.reference} — ${record.product_name}`} size="sm">
      <div className="p-5 space-y-4">
        <div className="text-sm text-gray-600">
          {record.quantity} × {label(FAULTS, record.fault).toLowerCase()}
          {record.description ? ` — ${record.description}` : ''}
          {' · '}{formatCurrency(record.total_cost)}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">What became of it</label>
          <select
            value={outcome} onChange={(e) => setOutcome(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {outcome === 'replaced' && record.stock_deducted && (
          <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-xl p-2.5">
            {record.quantity} × {record.product_name} goes back on stock — a replaced item is one
            the shop has again.
          </p>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Note</label>
          <input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Sent back with the Tarkwa delivery"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()} disabled={save.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function DamagedGoods() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [reporting, setReporting] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [outcomeFilter, setOutcomeFilter] = useState('')

  // Putting goods back on the shelf is a manager's call.
  const canDecide = getRoleLevel(user?.role) >= 2

  const { data, isLoading } = useQuery({
    queryKey: ['damaged-goods', outcomeFilter],
    queryFn: () => getDamagedGoods({ outcome: outcomeFilter || undefined }).then((r) => r.data),
  })

  const records = data?.records || []
  const summary = data?.summary || {}

  const remove = useMutation({
    mutationFn: (id) => deleteDamagedGood(id),
    onSuccess: (_res, id) => {
      const rec = records.find((r) => r._id === id)
      toast.success(
        `${rec?.reference || 'Record'} deleted`
        + (rec?.stock_deducted ? ` — ${rec.quantity} × ${rec.product_name} back on stock.` : '.'),
        { duration: 7000 }
      )
      queryClient.invalidateQueries({ queryKey: ['damaged-goods'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not delete it'),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Damaged & Faulty"
        subtitle="Broken stock, written down and taken off the shelf"
        action={
          <div className="flex items-center gap-2">
            <RefreshButton keys={['damaged-goods']} />
            <button
              onClick={() => setReporting(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm"
            >
              <FiPlus /> Report
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Items lost</p>
          <p className="text-xl font-black text-gray-900">{summary.units || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">What it cost</p>
          <p className="text-xl font-black text-red-600">{formatCurrency(summary.total_cost || 0)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Not made good</p>
          <p className="text-xl font-black text-orange-600">{formatCurrency(summary.unrecovered || 0)}</p>
        </div>
      </div>

      <select
        value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
      >
        <option value="">All records</option>
        {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      {isLoading ? <LoadingSpinner /> : records.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiAlertTriangle className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">Nothing written down yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r._id} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900">
                      {r.quantity} × {r.product_name}
                    </p>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${OUTCOME_STYLES[r.outcome]}`}>
                      {label(OUTCOMES, r.outcome)}
                    </span>
                    {!r.stock_deducted && r.outcome === 'replaced' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700">
                        <FiRotateCcw size={11} /> back on stock
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.reference} · {label(FAULTS, r.fault)} ·{' '}
                    {format(new Date(r.reported_at), 'dd MMM yyyy')}
                    {r.reported_by?.username ? ` · by ${r.reported_by.username}` : ''}
                  </p>
                  {r.description && (
                    <p className="text-xs text-gray-600 mt-1">{r.description}</p>
                  )}
                  {r.outcome_note && (
                    <p className="text-xs text-gray-500 mt-0.5 italic">{r.outcome_note}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="font-black text-red-600">{formatCurrency(r.total_cost)}</p>
                  {canDecide && (
                    <>
                      <button
                        onClick={() => setEditing(r)}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-gray-800 rounded-lg hover:bg-gray-900"
                      >
                        Outcome
                      </button>
                      <button
                        onClick={() => setDeleting(r)}
                        title="Written down by mistake"
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <FiTrash2 />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reporting && <ReportModal onClose={() => setReporting(false)} />}
      {editing && <OutcomeModal record={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting._id)}
        title="Delete this record?"
        message={
          deleting?.stock_deducted
            ? `${deleting.quantity} × ${deleting.product_name} goes back on stock — delete this only if it was written down by mistake.`
            : `Delete ${deleting?.reference}?`
        }
        confirmText="Delete"
        loading={remove.isPending}
      />
    </div>
  )
}
