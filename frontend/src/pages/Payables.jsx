import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiTruck, FiAlertTriangle, FiPhone, FiChevronDown, FiChevronUp, FiCalendar,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency } from '../utils/helpers'
import { getPayables, payPurchase, setPurchaseTerms } from '../api/purchases'

const METHODS = [
  ['cash', 'Cash'], ['bank', 'Bank'], ['mobile_money', 'Mobile Money'],
  ['cheque', 'Cheque'], ['other', 'Other'],
]

function PayModal({ delivery, supplier, onClose }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState(String(delivery.owed))
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')

  const pay = useMutation({
    mutationFn: () => payPurchase(delivery._id, {
      amount: Number(amount), method, reference: reference.trim() || undefined,
    }),
    onSuccess: (res) => {
      // The interceptor keeps only `data`, so the balance is read off that.
      const left = Math.max(0, (res.data?.total_amount || 0) - (res.data?.amount_paid || 0))
      toast.success(left > 0
        ? `Paid. ${formatCurrency(left)} still owed on this delivery.`
        : 'Paid in full.')
      queryClient.invalidateQueries({ queryKey: ['payables'] })
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not record it'),
  })

  const value = Number(amount)
  const ready = Number.isFinite(value) && value > 0 && value <= delivery.owed + 0.004
  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <Modal isOpen onClose={onClose} title={`Pay ${supplier}`} size="sm">
      <div className="p-5 space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">Delivery of {format(new Date(delivery.purchase_date), 'd MMM yyyy')}</p>
          <p className="text-sm text-gray-700">
            {formatCurrency(delivery.total_amount)} total
            {delivery.amount_paid > 0 && <> · {formatCurrency(delivery.amount_paid)} already paid</>}
          </p>
          <p className="text-lg font-black text-orange-600">{formatCurrency(delivery.owed)} owed</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">How much *</label>
          <input type="number" step="0.01" min="0" max={delivery.owed} value={amount}
            onChange={(e) => setAmount(e.target.value)} autoFocus className={`${field} font-bold`} />
          {value > delivery.owed + 0.004 && (
            <p className="mt-1 text-[11px] text-red-600 font-semibold">
              Only {formatCurrency(delivery.owed)} is owed on this one.
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

        <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
          This settles what you owe. It is not recorded as an expense — the goods
          already cost what they cost, and that reaches your profit when they sell.
        </p>

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

function SupplierCard({ row, onPay }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const setDue = useMutation({
    mutationFn: ({ id, due_date }) => setPurchaseTerms(id, { due_date }),
    onSuccess: () => {
      toast.success('Saved.')
      queryClient.invalidateQueries({ queryKey: ['payables'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save'),
  })

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden ${row.overdue > 0 ? 'border-red-200' : 'border-gray-100'}`}>
      <button onClick={() => setOpen(!open)} className="w-full text-left p-4 hover:bg-gray-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-gray-900">{row.supplier_name}</p>
            <p className="text-xs text-gray-500">
              {row.deliveries.length} deliver{row.deliveries.length === 1 ? 'y' : 'ies'} unpaid
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
              {open ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />} deliveries
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
          {row.deliveries.map((d) => (
            <div key={d._id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {format(new Date(d.purchase_date), 'd MMM yyyy')} · {d.item_count} item{d.item_count === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-gray-500">
                  {formatCurrency(d.total_amount)} total
                  {d.amount_paid > 0 && <> · {formatCurrency(d.amount_paid)} paid</>}
                </p>
                <label className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
                  <FiCalendar size={11} className={d.overdue ? 'text-red-500' : 'text-gray-400'} />
                  <span>Due</span>
                  <input type="date"
                    value={d.due_date ? String(d.due_date).slice(0, 10) : ''}
                    onChange={(e) => setDue.mutate({ id: d._id, due_date: e.target.value || null })}
                    className={`px-1.5 py-0.5 border rounded-lg text-[11px] ${
                      d.overdue ? 'border-red-300 text-red-600 font-bold' : 'border-gray-200'
                    }`} />
                </label>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <p className="font-black text-orange-600">{formatCurrency(d.owed)}</p>
                <button onClick={() => onPay(d, row.supplier_name)}
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold">
                  Pay
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
  const [paying, setPaying] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['payables'],
    queryFn: () => getPayables().then((r) => r.data),
  })

  const suppliers = data?.suppliers || []
  const summary = data?.summary || {}

  return (
    <div className="space-y-5">
      <PageHeader
        title="What we owe"
        subtitle="Suppliers waiting to be paid"
        action={<RefreshButton keys={['payables']} />}
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
          <p className="text-[11px] text-gray-500">Suppliers</p>
          <p className="text-xl font-black text-gray-900">{summary.suppliers || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Deliveries</p>
          <p className="text-xl font-black text-gray-900">{summary.deliveries || 0}</p>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : suppliers.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiTruck className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">You owe nobody. Every delivery is settled.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suppliers.map((row) => (
            <SupplierCard key={row.supplier_id || row.supplier_name} row={row}
              onPay={(d, name) => setPaying({ delivery: d, supplier: name })} />
          ))}
        </div>
      )}

      {paying && (
        <PayModal delivery={paying.delivery} supplier={paying.supplier}
          onClose={() => setPaying(null)} />
      )}
    </div>
  )
}
