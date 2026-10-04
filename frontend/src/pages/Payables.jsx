import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiTruck, FiAlertTriangle, FiPhone, FiChevronDown, FiChevronUp,
  FiPlus, FiTrash2, FiCalendar,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency } from '../utils/helpers'
import {
  getPayables, createPayable, payPayable, updatePayable, deletePayable,
} from '../api/payables'

const METHODS = [
  ['cash', 'Cash'], ['bank', 'Bank'], ['mobile_money', 'Mobile Money'],
  ['cheque', 'Cheque'], ['other', 'Other'],
]

const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

/** Writing one down. Nothing in the system needs to know about it first. */
function NewPayableModal({ onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    supplier_name: '', supplier_phone: '', about: '',
    amount_owed: '', amount_paid: '', due_date: '', notes: '',
  })
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: () => createPayable({
      ...form,
      amount_owed: Number(form.amount_owed),
      amount_paid: form.amount_paid === '' ? 0 : Number(form.amount_paid),
      due_date: form.due_date || undefined,
    }),
    onSuccess: () => {
      toast.success('Written down.')
      queryClient.invalidateQueries({ queryKey: ['payables'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save it'),
  })

  const owed = Number(form.amount_owed)
  const paid = form.amount_paid === '' ? 0 : Number(form.amount_paid)
  const overpaid = Number.isFinite(paid) && Number.isFinite(owed) && paid > owed
  const ready = form.supplier_name.trim() && form.about.trim()
    && Number.isFinite(owed) && owed > 0 && !overpaid

  return (
    <Modal isOpen onClose={onClose} title="Write down what we owe" size="md">
      <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Who is owed *</label>
            <input value={form.supplier_name} onChange={set('supplier_name')} autoFocus
              placeholder="e.g. Kofi Trading" className={field} />
            <p className="mt-1 text-[11px] text-gray-400">
              Anybody at all — a supplier, a transporter, a fitter. They do not
              need to be on the system.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
            <input value={form.supplier_phone} onChange={set('supplier_phone')}
              placeholder="0244…" className={field} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">What for *</label>
          <input value={form.about} onChange={set('about')}
            placeholder="e.g. 20 panels delivered on Tuesday" className={field} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">How much is owed *</label>
            <input type="number" step="0.01" min="0" value={form.amount_owed}
              onChange={set('amount_owed')} placeholder="0.00" className={`${field} font-bold`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Already paid <span className="font-normal text-gray-400">— if any</span>
            </label>
            <input type="number" step="0.01" min="0" value={form.amount_paid}
              onChange={set('amount_paid')} placeholder="0.00" className={field} />
            {overpaid && (
              <p className="mt-1 text-[11px] text-red-600 font-semibold">
                That is more than the amount owed.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            When it is due <span className="font-normal text-gray-400">— optional</span>
          </label>
          <input type="date" value={form.due_date} onChange={set('due_date')} className={field} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2}
            placeholder="Anything worth remembering about this one"
            className={`${field} resize-none`} />
        </div>

        <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
          This records a debt, not a spend. It is never counted as an expense —
          the goods already cost what they cost, and that reaches your profit
          when they sell.
        </p>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => save.mutate()} disabled={!ready || save.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {save.isPending ? 'Saving…' : 'Write it down'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function PayModal({ entry, supplier, onClose }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState(String(entry.owed))
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')

  const pay = useMutation({
    mutationFn: () => payPayable(entry._id, {
      amount: Number(amount), method, reference: reference.trim() || undefined,
    }),
    onSuccess: (res) => {
      const left = Math.max(0, (res.data?.amount_owed || 0) - (res.data?.amount_paid || 0))
      toast.success(left > 0 ? `Paid. ${formatCurrency(left)} still owed.` : 'Paid in full.')
      queryClient.invalidateQueries({ queryKey: ['payables'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not record it'),
  })

  const value = Number(amount)
  const ready = Number.isFinite(value) && value > 0 && value <= entry.owed + 0.004

  return (
    <Modal isOpen onClose={onClose} title={`Pay ${supplier}`} size="sm">
      <div className="p-5 space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">{entry.about}</p>
          <p className="text-sm text-gray-700">
            {formatCurrency(entry.amount_owed)} owed
            {entry.amount_paid > 0 && <> · {formatCurrency(entry.amount_paid)} already paid</>}
          </p>
          <p className="text-lg font-black text-orange-600">{formatCurrency(entry.owed)} outstanding</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">How much *</label>
          <input type="number" step="0.01" min="0" max={entry.owed} value={amount}
            onChange={(e) => setAmount(e.target.value)} autoFocus className={`${field} font-bold`} />
          {value > entry.owed + 0.004 && (
            <p className="mt-1 text-[11px] text-red-600 font-semibold">
              Only {formatCurrency(entry.owed)} is outstanding.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">How</label>
          <div className="grid grid-cols-3 gap-1.5">
            {METHODS.map(([k, label]) => (
              <button key={k} onClick={() => setMethod(k)}
                className={`py-2 rounded-lg text-[11px] font-bold transition-colors ${
                  method === k ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-orange-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Reference <span className="font-normal text-gray-400">— optional</span>
          </label>
          <input value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="Transfer or cheque number" className={field} />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => pay.mutate()} disabled={!ready || pay.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {pay.isPending ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SupplierCard({ row, onPay, onDelete }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const setDue = useMutation({
    mutationFn: ({ id, due_date }) => updatePayable(id, { due_date }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payables'] }),
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save'),
  })

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden ${row.overdue > 0 ? 'border-red-200' : 'border-gray-100'}`}>
      <button onClick={() => setOpen(!open)} className="w-full text-left p-4 hover:bg-gray-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-gray-900">{row.supplier_name}</p>
            <p className="text-xs text-gray-500">
              {row.entries.length} {row.entries.length === 1 ? 'thing' : 'things'} outstanding
              {row.supplier_phone && <> · {row.supplier_phone}</>}
            </p>
            {row.overdue > 0 && (
              <p className="text-xs font-bold text-red-600 mt-0.5 inline-flex items-center gap-1">
                <FiAlertTriangle size={11} /> {formatCurrency(row.overdue)} past its date
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xl font-black text-orange-600">{formatCurrency(row.owed)}</p>
            <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
              {open ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />} details
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {row.supplier_phone && (
            <a href={`tel:${row.supplier_phone}`}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-orange-600 hover:bg-orange-50">
              <FiPhone size={12} /> Call {row.supplier_name}
            </a>
          )}
          {row.entries.map((e) => (
            <div key={e._id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{e.about}</p>
                <p className="text-xs text-gray-500">
                  {formatCurrency(e.amount_owed)}
                  {e.amount_paid > 0 && <> · {formatCurrency(e.amount_paid)} paid</>}
                  {e.incurred_on && <> · from {format(new Date(e.incurred_on), 'd MMM yyyy')}</>}
                </p>
                {e.notes && <p className="text-xs text-gray-400 italic">{e.notes}</p>}
                <label className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
                  <FiCalendar size={11} className={e.overdue ? 'text-red-500' : 'text-gray-400'} />
                  <span>Due</span>
                  <input type="date"
                    value={e.due_date ? String(e.due_date).slice(0, 10) : ''}
                    onChange={(ev) => setDue.mutate({ id: e._id, due_date: ev.target.value || '' })}
                    className={`px-1.5 py-0.5 border rounded-lg text-[11px] ${
                      e.overdue ? 'border-red-300 text-red-600 font-bold' : 'border-gray-200'
                    }`} />
                </label>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <p className="font-black text-orange-600">{formatCurrency(e.owed)}</p>
                <button onClick={() => onPay(e, row.supplier_name)}
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold">
                  Pay
                </button>
                <button onClick={() => onDelete({ ...e, supplier_name: row.supplier_name })}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                  <FiTrash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Payables() {
  const queryClient = useQueryClient()
  const [paying, setPaying] = useState(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['payables'],
    queryFn: () => getPayables().then((r) => r.data),
  })

  const remove = useMutation({
    mutationFn: (id) => deletePayable(id),
    onSuccess: () => {
      toast.success('Removed.')
      queryClient.invalidateQueries({ queryKey: ['payables'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not remove it'),
  })

  const suppliers = data?.suppliers || []
  const summary = data?.summary || {}

  return (
    <div className="space-y-5">
      <PageHeader
        title="What we owe"
        subtitle="Written down by you, and settled by you"
        action={
          <div className="flex items-center gap-2">
            <RefreshButton keys={['payables']} />
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm">
              <FiPlus /> Write one down
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Owed in total</p>
          <p className="text-xl font-black text-orange-600">{formatCurrency(summary.owed || 0)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Past its date</p>
          <p className="text-xl font-black text-red-600">{formatCurrency(summary.overdue || 0)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">People owed</p>
          <p className="text-xl font-black text-gray-900">{summary.suppliers || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Entries</p>
          <p className="text-xl font-black text-gray-900">{summary.entries || 0}</p>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : suppliers.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiTruck className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">Nothing written down yet.</p>
          <button onClick={() => setAdding(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50">
            <FiPlus size={14} /> Write down what we owe
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {suppliers.map((row) => (
            <SupplierCard key={row.supplier_name} row={row}
              onPay={(e, name) => setPaying({ entry: e, supplier: name })}
              onDelete={setDeleting} />
          ))}
        </div>
      )}

      {adding && <NewPayableModal onClose={() => setAdding(false)} />}
      {paying && (
        <PayModal entry={paying.entry} supplier={paying.supplier}
          onClose={() => setPaying(null)} />
      )}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting._id)}
        title="Remove this"
        message={`${deleting?.supplier_name} — ${deleting?.about}. Any payments recorded against it go too.`}
        confirmText="Remove"
        danger
        loading={remove.isPending}
      />
    </div>
  )
}
