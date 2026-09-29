import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiShield, FiPlus, FiSearch, FiCheckCircle, FiXCircle, FiTrash2, FiX,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, getRoleLevel } from '../utils/helpers'
import { getProducts } from '../api/products'
import {
  getWarranties, checkWarranty, linesFromSale, createWarranty, claimWarranty, deleteWarranty,
} from '../api/warranties'
import useAuthStore from '../store/authStore'
import useBarcodeScanner from '../hooks/useBarcodeScanner'

const OUTCOMES = [
  ['repaired', 'Repaired it'],
  ['replaced', 'Replaced it'],
  ['refunded', 'Refunded them'],
  ['sent_to_supplier', 'Sent to the supplier'],
  ['refused', 'Not covered — refused'],
]

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  claimed: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  void: 'bg-gray-200 text-gray-700',
}

const when = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—')

/** Covered or not, said the way the person at the counter needs to hear it. */
function Cover({ w, big = false }) {
  const size = big ? 'text-base' : 'text-[11px]'
  if (w.covered) {
    return (
      <span className={`inline-flex items-center gap-1 font-bold text-green-700 ${size}`}>
        <FiCheckCircle size={big ? 16 : 12} />
        Covered — {w.days_left} day{w.days_left === 1 ? '' : 's'} left
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-red-600 ${size}`}>
      <FiXCircle size={big ? 16 : 12} />
      {w.status === 'rejected' ? 'Claim refused'
        : w.status === 'void' ? 'Void'
          : `Expired ${when(w.expires_on)}`}
    </span>
  )
}

/** Registering one, either from an invoice or from scratch. */
function RegisterModal({ onClose }) {
  const queryClient = useQueryClient()
  const [invoice, setInvoice] = useState('')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  const [form, setForm] = useState({
    product_name: '', serial_number: '', customer_name: '', customer_phone: '',
    months: '12', starts_on: format(new Date(), 'yyyy-MM-dd'), notes: '',
  })
  const [fromSale, setFromSale] = useState(null)

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const { data: productData } = useQuery({
    queryKey: ['warranty-products', search],
    queryFn: () => getProducts({ search, limit: 8 }).then((r) => r.data),
    enabled: search.trim().length > 1,
  })
  const results = productData?.products || productData?.data || productData || []

  // Pulling the sale saves retyping it, and brings the product's own term.
  const pull = useMutation({
    mutationFn: () => linesFromSale(invoice.trim()),
    onSuccess: (res) => {
      const sale = res.data
      setFromSale(sale)
      setForm((f) => ({
        ...f,
        customer_name: sale.customer_name || f.customer_name,
        customer_phone: sale.customer_phone || f.customer_phone,
        starts_on: sale.sale_date
          ? format(new Date(sale.sale_date), 'yyyy-MM-dd') : f.starts_on,
      }))
      toast.success(`${sale.invoice_no} — pick the item it covers`)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'No sale with that invoice'),
  })

  const takeLine = (line) => {
    setPicked({ _id: line.product_id, name: line.product_name })
    setForm((f) => ({
      ...f,
      product_name: line.product_name,
      months: line.warranty_months > 0 ? String(line.warranty_months) : f.months,
    }))
  }

  const save = useMutation({
    mutationFn: () => createWarranty({
      product_id: picked?._id,
      product_name: form.product_name.trim(),
      serial_number: form.serial_number.trim(),
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      sale_id: fromSale?.sale_id,
      invoice_no: fromSale?.invoice_no,
      starts_on: form.starts_on,
      months: Number(form.months),
      notes: form.notes.trim(),
    }),
    onSuccess: (res) => {
      toast.success(`${res.data.reference} — covered until ${when(res.data.expires_on)}`,
        { duration: 8000 })
      queryClient.invalidateQueries({ queryKey: ['warranties'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not register it'),
  })

  // A serial is usually printed as a barcode on the unit, so it can be
  // scanned straight into the field rather than read off and typed.
  useBarcodeScanner((code) => setForm((f) => ({ ...f, serial_number: code })))

  const ready = form.product_name.trim() && form.customer_name.trim() && Number(form.months) >= 1
  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <Modal isOpen onClose={onClose} title="Register a warranty" size="md">
      <div className="p-5 space-y-4">
        {/* ── From an invoice ─────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            From an invoice <span className="font-normal text-gray-400">— optional</span>
          </label>
          <div className="flex gap-2">
            <input
              value={invoice} onChange={(e) => setInvoice(e.target.value)}
              placeholder="INV-0088" className={field}
            />
            <button
              type="button" onClick={() => pull.mutate()}
              disabled={!invoice.trim() || pull.isPending}
              className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 whitespace-nowrap disabled:opacity-50"
            >
              {pull.isPending ? 'Looking…' : 'Pull it up'}
            </button>
          </div>
          {fromSale && (
            <div className="mt-2 border border-gray-200 rounded-xl divide-y">
              {fromSale.items.map((l, i) => (
                <button
                  key={i} type="button" onClick={() => takeLine(l)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    form.product_name === l.product_name ? 'bg-orange-50' : ''
                  }`}
                >
                  <span className="font-semibold text-gray-900">{l.product_name}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {l.warranty_months > 0 ? `${l.warranty_months} months` : 'no term set'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Or straight from the catalogue ──────────────────────────── */}
        {!fromSale && (
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Product</label>
            {picked ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="font-bold text-gray-900 text-sm truncate">{picked.name}</p>
                <button type="button"
                  onClick={() => { setPicked(null); setForm((f) => ({ ...f, product_name: '' })) }}
                  className="p-1 text-gray-400 hover:text-red-600"><FiX /></button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search the catalogue…" className={`${field} pl-9`}
                  />
                </div>
                {search.trim().length > 1 && results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {results.map((p) => (
                      <button
                        key={p._id} type="button"
                        onClick={() => {
                          setPicked(p); setSearch('')
                          setForm((f) => ({
                            ...f, product_name: p.name,
                            months: p.warranty_months > 0 ? String(p.warranty_months) : f.months,
                          }))
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                      >
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        {p.warranty_months > 0 && (
                          <span className="text-xs text-gray-500 ml-2">{p.warranty_months} months</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={form.product_name} onChange={set('product_name')}
                  placeholder="…or type the name" className={`${field} mt-2`}
                />
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Serial number <span className="font-normal text-gray-400">— how a claim is found</span>
          </label>
          <input value={form.serial_number} onChange={set('serial_number')}
            autoFocus data-scan-input=""
            placeholder="Scan it, or type what is on the unit" className={field} />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Starts</label>
            <input type="date" value={form.starts_on} onChange={set('starts_on')} className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Months covered *</label>
            <input type="number" min="1" value={form.months} onChange={set('months')} className={field} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()} disabled={!ready || save.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
          >
            {save.isPending ? 'Registering…' : 'Register'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Somebody brought it back. */
function ClaimModal({ warranty, onClose }) {
  const queryClient = useQueryClient()
  const [fault, setFault] = useState('')
  const [outcome, setOutcome] = useState('repaired')
  const [note, setNote] = useState('')

  const save = useMutation({
    mutationFn: () => claimWarranty(warranty._id, { fault, outcome, note }),
    onSuccess: () => {
      toast.success(`${warranty.reference} — ${outcome.replace(/_/g, ' ')}.`)
      queryClient.invalidateQueries({ queryKey: ['warranties'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not record the claim'),
  })

  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <Modal isOpen onClose={onClose} title={`${warranty.reference} — ${warranty.product_name}`} size="sm">
      <div className="p-5 space-y-4">
        <div className={`rounded-xl p-3 border ${
          warranty.covered ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <Cover w={warranty} big />
          <p className="text-xs text-gray-600 mt-1">
            {warranty.customer_name}
            {warranty.serial_number ? ` · serial ${warranty.serial_number}` : ''}
            {' · '}bought {when(warranty.starts_on)}
          </p>
          {!warranty.covered && (
            <p className="text-xs text-red-800 font-semibold mt-1">
              Out of cover — anything done here is a goodwill decision.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">What is wrong</label>
          <input value={fault} onChange={(e) => setFault(e.target.value)}
            placeholder="Will not charge" className={field} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">What was done</label>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={field}>
            {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering" className={field} />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {save.isPending ? 'Saving…' : 'Record claim'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Warranties() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [expiring, setExpiring] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [claiming, setClaiming] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const canDelete = getRoleLevel(user?.role) >= 2

  const { data, isLoading } = useQuery({
    queryKey: ['warranties', q, expiring],
    queryFn: () => getWarranties({
      q: q.trim().length > 1 ? q.trim() : undefined,
      expiring: expiring ? 'true' : undefined,
    }).then((r) => r.data),
  })

  const warranties = data?.warranties || []
  const summary = data?.summary || {}

  // Somebody walks up with a unit: scan it and its warranty is found.
  useBarcodeScanner((code) => setQ(code), { enabled: !registering && !claiming && !deleting })

  const remove = useMutation({
    mutationFn: (id) => deleteWarranty(id),
    onSuccess: () => {
      toast.success('Warranty deleted.')
      queryClient.invalidateQueries({ queryKey: ['warranties'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not delete it'),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Warranties"
        subtitle="Is it still covered, and whose problem is it"
        action={
          <div className="flex items-center gap-2">
            <RefreshButton keys={['warranties']} />
            <button
              onClick={() => setRegistering(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm"
            >
              <FiPlus /> Register
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Serial number, customer, product or invoice…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <button
          onClick={() => setExpiring((v) => !v)}
          className={`px-3 py-2.5 rounded-xl text-sm font-bold border ${
            expiring ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          Running out soon
        </button>
      </div>

      <p className="text-xs text-gray-500">
        <span className="font-bold text-gray-900">{summary.in_force || 0}</span> warranties in force.
      </p>

      {isLoading ? <LoadingSpinner /> : warranties.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiShield className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">
            {q.trim().length > 1 ? 'Nothing matches that.' : 'No warranties registered yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {warranties.map((w) => (
            <div key={w._id} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900">{w.product_name}</p>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${STATUS_STYLES[w.status]}`}>
                      {w.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {w.reference}
                    {w.serial_number ? ` · serial ${w.serial_number}` : ''}
                    {w.invoice_no ? ` · ${w.invoice_no}` : ''}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {w.customer_name}{w.customer_phone ? ` · ${w.customer_phone}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {w.months} months from {when(w.starts_on)} — until {when(w.expires_on)}
                  </p>
                  {(w.claims || []).length > 0 && (
                    <p className="text-[11px] text-blue-700 font-semibold mt-1">
                      {w.claims.length} claim{w.claims.length === 1 ? '' : 's'} —
                      {' '}{w.claims[w.claims.length - 1].outcome?.replace(/_/g, ' ')}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <Cover w={w} />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setClaiming(w)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-gray-800 rounded-lg hover:bg-gray-900"
                    >
                      Claim
                    </button>
                    {canDelete && (
                      <button onClick={() => setDeleting(w)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                        <FiTrash2 />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {registering && <RegisterModal onClose={() => setRegistering(false)} />}
      {claiming && <ClaimModal warranty={claiming} onClose={() => setClaiming(null)} />}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting._id)}
        title="Delete this warranty?"
        message={`${deleting?.reference} is the proof ${deleting?.customer_name} is covered.`}
        confirmText="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  )
}
