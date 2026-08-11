import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { FiPackage, FiDollarSign, FiCheckCircle, FiXCircle, FiAlertTriangle } from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import { useTranslation } from '../i18n'
import { formatCurrency } from '../utils/helpers'
import { getLayaways, addLayawayPayment, collectLayaway, cancelLayaway } from '../api/layaways'

const STATUS_STYLES = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  defaulted: 'bg-red-100 text-red-700',
}

function PaymentModal({ layaway, onClose }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => addLayawayPayment(layaway._id, data),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Payment recorded')
      queryClient.invalidateQueries({ queryKey: ['layaways'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Payment failed'),
  })

  const value = parseFloat(amount) || 0
  const tooMuch = value > layaway.balance + 0.05

  return (
    <Modal isOpen onClose={onClose} title={t('layaway.recordPayment')} size="sm">
      <div className="p-5 space-y-4">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
          <p className="text-xs text-orange-700">{layaway.customer_name} · {layaway.reference}</p>
          <p className="text-sm text-orange-800 mt-1">
            {t('layaway.outstanding')}: <span className="text-xl font-black">{formatCurrency(layaway.balance)}</span>
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('common.amount')}</label>
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" min="0" max={layaway.balance} step="0.01"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {tooMuch && (
            <p className="text-xs text-red-600 mt-1">
              More than the {formatCurrency(layaway.balance)} outstanding.
            </p>
          )}
        </div>

        <div className="flex gap-1">
          {['cash', 'card', 'mobile_money'].map((m) => (
            <button
              key={m} onClick={() => setMethod(m)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-colors ${
                method === m ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-orange-50'
              }`}
            >
              {m.replace('_', ' ')}
            </button>
          ))}
        </div>

        {method !== 'cash' && (
          <input
            type="text" value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="Reference (optional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => mutation.mutate({ amount: value, method, reference })}
            disabled={value <= 0 || tooMuch || mutation.isPending}
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm"
          >
            {mutation.isPending ? '…' : t('common.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DetailModal({ layaway, onClose }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [cancelReason, setCancelReason] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const collectMutation = useMutation({
    mutationFn: () => collectLayaway(layaway._id),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Goods released')
      queryClient.invalidateQueries({ queryKey: ['layaways'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not release goods'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelLayaway(layaway._id, { reason: cancelReason }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Cancelled')
      queryClient.invalidateQueries({ queryKey: ['layaways'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not cancel'),
  })

  const paidPct = layaway.total_amount ? (layaway.amount_paid / layaway.total_amount) * 100 : 0

  return (
    <Modal isOpen onClose={onClose} title={`${layaway.reference} — ${layaway.customer_name}`} size="lg">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500">{t('common.total')}</p>
            <p className="font-black text-gray-800">{formatCurrency(layaway.total_amount)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3">
            <p className="text-xs text-green-600">{t('common.paid')}</p>
            <p className="font-black text-green-700">{formatCurrency(layaway.amount_paid)}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-xs text-red-600">{t('layaway.outstanding')}</p>
            <p className="font-black text-red-700">{formatCurrency(layaway.balance)}</p>
          </div>
        </div>

        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, paidPct)}%` }} />
        </div>

        <div>
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Items</p>
          {layaway.items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="text-gray-700">
                {item.product_name}{item.variant_name ? ` — ${item.variant_name}` : ''} × {item.quantity}
              </span>
              <span className="font-semibold">{formatCurrency(item.total)}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">{t('layaway.schedule')}</p>
          <div className="space-y-1">
            {(layaway.schedule || []).map((entry, i) => (
              <div key={i} className={`flex justify-between text-sm px-3 py-1.5 rounded-lg ${entry.paid ? 'bg-green-50' : 'bg-gray-50'}`}>
                <span className={entry.paid ? 'text-green-700 line-through' : 'text-gray-700'}>
                  {format(new Date(entry.due_date), 'dd/MM/yyyy')}
                </span>
                <span className="font-semibold">{formatCurrency(entry.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        {layaway.payments?.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Payments received</p>
            {layaway.payments.map((p, i) => (
              <div key={i} className="flex justify-between text-xs py-1 text-gray-600">
                <span>{format(new Date(p.paid_at), 'dd/MM/yyyy HH:mm')} · {p.method?.replace('_', ' ')}</span>
                <span className="font-semibold">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {confirmingCancel ? (
          <div className="border border-red-200 bg-red-50 rounded-xl p-3 space-y-2">
            <p className="text-sm text-red-700 font-semibold">
              Cancelling returns the goods to stock. {formatCurrency(layaway.amount_paid)} has already been paid — any
              refund is handled separately.
            </p>
            <input
              type="text" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t('common.reason')}
              className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <button onClick={() => setConfirmingCancel(false)} className="flex-1 py-2 border border-gray-200 bg-white rounded-lg text-sm font-semibold">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold disabled:opacity-60"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {layaway.balance <= 0 && !layaway.collected && (
              <button
                onClick={() => collectMutation.mutate()}
                disabled={collectMutation.isPending}
                className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1"
              >
                <FiCheckCircle size={15} /> {t('layaway.collect')}
              </button>
            )}
            {layaway.status === 'active' && !layaway.collected && (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="flex-1 py-2.5 border-2 border-red-300 text-red-500 hover:bg-red-50 rounded-xl font-bold text-sm flex items-center justify-center gap-1"
              >
                <FiXCircle size={15} /> {t('common.cancel')}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function Layaways() {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [payingFor, setPayingFor] = useState(null)
  const [viewing, setViewing] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['layaways', statusFilter, search],
    queryFn: () => getLayaways({ status: statusFilter === 'all' ? undefined : statusFilter, search: search || undefined }),
    keepPreviousData: true,
  })

  const layaways = data?.data?.data || data?.data || []
  const summary = data?.data?.summary || {}

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title={t('layaway.plans')} subtitle="Goods reserved and paid off over time" icon={FiPackage} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">{t('layaway.active')}</p>
          <p className="text-2xl font-black text-blue-600">{summary.active ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">{t('layaway.overdue')}</p>
          <p className="text-2xl font-black text-red-600">{summary.overdue ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">{t('layaway.outstanding')}</p>
          <p className="text-2xl font-black text-orange-600">{formatCurrency(summary.outstanding ?? 0)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {['active', 'completed', 'defaulted', 'cancelled', 'all'].map((s) => (
          <button
            key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
              statusFilter === s ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-orange-50'
            }`}
          >
            {s}
          </button>
        ))}
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')}
          className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : layaways.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FiPackage size={36} className="mx-auto mb-2" />
          <p className="text-sm">No layaway plans here.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50">
              <tr>
                {['Reference', t('common.customer'), t('common.total'), t('common.paid'), t('layaway.outstanding'), t('layaway.nextDue'), t('common.status'), ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {layaways.map((l) => {
                const overdue = l.status === 'active' && l.next_due_date && new Date(l.next_due_date) < new Date()
                return (
                  <tr key={l._id} className="hover:bg-orange-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{l.reference}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800">{l.customer_name}</p>
                      <p className="text-xs text-gray-400">{l.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{formatCurrency(l.total_amount)}</td>
                    <td className="px-4 py-3 text-sm text-green-600">{formatCurrency(l.amount_paid)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-red-600">{formatCurrency(l.balance)}</td>
                    <td className="px-4 py-3 text-xs">
                      {l.next_due_date ? (
                        <span className={overdue ? 'text-red-600 font-bold flex items-center gap-1' : 'text-gray-600'}>
                          {overdue && <FiAlertTriangle size={12} />}
                          {format(new Date(l.next_due_date), 'dd/MM/yyyy')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize ${STATUS_STYLES[l.status] || 'bg-gray-100'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {l.balance > 0 && l.status === 'active' && (
                        <button
                          onClick={() => setPayingFor(l)}
                          className="px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold mr-1"
                        >
                          <FiDollarSign size={11} className="inline" /> Pay
                        </button>
                      )}
                      <button onClick={() => setViewing(l)} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50">
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {payingFor && <PaymentModal layaway={payingFor} onClose={() => setPayingFor(null)} />}
      {viewing && <DetailModal layaway={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
