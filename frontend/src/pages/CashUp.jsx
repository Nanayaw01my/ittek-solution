import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { FiLock, FiUnlock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, getRoleLevel } from '../utils/helpers'
import { getDayReckoning, getCashUps, closeDay, reopenDay } from '../api/cashUp'
import useAuthStore from '../store/authStore'

const TENDERS = [
  ['cash', 'Cash'],
  ['mobile_money', 'Mobile Money'],
  ['card', 'Card'],
]

/** Over, short, or right — said plainly, in the colour it deserves. */
function Variance({ amount, className = '' }) {
  const off = Number(amount) || 0
  if (Math.abs(off) < 0.005) {
    return (
      <span className={`inline-flex items-center gap-1 font-bold text-green-700 ${className}`}>
        <FiCheckCircle size={13} /> Balances
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${off > 0 ? 'text-blue-700' : 'text-red-600'} ${className}`}>
      <FiAlertCircle size={13} />
      {off > 0 ? 'Over' : 'Short'} {formatCurrency(Math.abs(off))}
    </span>
  )
}

export default function CashUp() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [counted, setCounted] = useState({ cash: '', mobile_money: '', card: '' })
  const [floatKept, setFloatKept] = useState('')
  const [note, setNote] = useState('')
  const [reopening, setReopening] = useState(null)

  const canReopen = getRoleLevel(user?.role) >= 3

  const { data, isLoading } = useQuery({
    queryKey: ['cash-up-day', date],
    queryFn: () => getDayReckoning(date).then((r) => r.data),
  })
  const { data: history } = useQuery({
    queryKey: ['cash-ups'],
    queryFn: () => getCashUps().then((r) => r.data),
  })

  const expected = data?.expected || {}
  const closed = data?.cash_up || null

  // What the counting says, before the day is closed — so the person counting
  // sees the difference as they type rather than after they commit.
  const num = (v) => Number(v) || 0
  const live = {
    cash: num(counted.cash) - num(floatKept) - (expected.cash_in_hand || 0),
    mobile_money: num(counted.mobile_money) - (expected.mobile_money || 0),
    card: num(counted.card) - (expected.card || 0),
  }
  live.total = live.cash + live.mobile_money + live.card
  const anythingCounted = ['cash', 'mobile_money', 'card'].some((k) => counted[k] !== '')

  const close = useMutation({
    mutationFn: () => closeDay({
      date,
      counted: {
        cash: num(counted.cash),
        mobile_money: num(counted.mobile_money),
        card: num(counted.card),
      },
      float_kept: num(floatKept),
      note,
    }),
    onSuccess: (res) => {
      const off = res.data?.variance?.total ?? 0
      toast.success(
        Math.abs(off) < 0.005
          ? 'Day closed — everything balances.'
          : `Day closed — ${off > 0 ? 'over' : 'short'} by ${formatCurrency(Math.abs(off))}.`,
        { duration: 8000 }
      )
      setCounted({ cash: '', mobile_money: '', card: '' })
      setFloatKept('')
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['cash-up-day'] })
      queryClient.invalidateQueries({ queryKey: ['cash-ups'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not close the day'),
  })

  const reopen = useMutation({
    mutationFn: (id) => reopenDay(id),
    onSuccess: () => {
      toast.success('Day reopened — it can be counted again.')
      queryClient.invalidateQueries({ queryKey: ['cash-up-day'] })
      queryClient.invalidateQueries({ queryKey: ['cash-ups'] })
      setReopening(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not reopen it'),
  })

  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cash Up"
        subtitle="Count the drawer against what the system says came in"
        action={
          <div className="flex items-center gap-2">
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
            />
            <RefreshButton keys={['cash-up-day', 'cash-ups']} />
          </div>
        }
      />

      {isLoading ? <LoadingSpinner /> : (
        <>
          {/* ── What the system says ──────────────────────────────────── */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">
              What the system says — {expected.sales_count || 0} sale
              {expected.sales_count === 1 ? '' : 's'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {TENDERS.map(([k, l]) => (
                <div key={k}>
                  <p className="text-[11px] text-gray-500">{l} in</p>
                  <p className="font-black text-gray-900">{formatCurrency(expected[k] || 0)}</p>
                </div>
              ))}
              <div>
                <p className="text-[11px] text-gray-500">Expenses paid out</p>
                <p className="font-black text-red-600">−{formatCurrency(expected.expenses || 0)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Refunds paid out</p>
                <p className="font-black text-red-600">−{formatCurrency(expected.refunds || 0)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[11px] text-gray-500">Cash should be in hand</p>
                <p className="font-black text-gray-900">{formatCurrency(expected.cash_in_hand || 0)}</p>
              </div>
            </div>
          </div>

          {/* ── Already closed, or the counting form ──────────────────── */}
          {closed ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-black text-gray-900 flex items-center gap-2">
                    <FiLock size={15} /> Closed
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    by {closed.closed_by?.username || '—'} ·{' '}
                    {format(new Date(closed.closed_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
                <Variance amount={closed.variance?.total} className="text-base" />
              </div>

              <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold">Tender</th>
                      <th className="text-right px-3 py-2 font-bold">Expected</th>
                      <th className="text-right px-3 py-2 font-bold">Counted</th>
                      <th className="text-right px-3 py-2 font-bold">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {TENDERS.map(([k, l]) => (
                      <tr key={k}>
                        <td className="px-3 py-2 font-semibold text-gray-900">{l}</td>
                        <td className="px-3 py-2 text-right">
                          {formatCurrency(k === 'cash' ? closed.expected?.cash_in_hand : closed.expected?.[k])}
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(closed.counted?.[k])}</td>
                        <td className="px-3 py-2 text-right">
                          <Variance amount={closed.variance?.[k]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {closed.float_kept > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {formatCurrency(closed.float_kept)} left in the drawer as tomorrow's float.
                </p>
              )}
              {closed.note && <p className="text-sm text-gray-600 mt-2 italic">{closed.note}</p>}

              {canReopen && (
                <button
                  onClick={() => setReopening(closed)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  <FiUnlock size={13} /> Reopen this day
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4">
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-wide">
                What you counted
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TENDERS.map(([k, l]) => (
                  <div key={k}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">{l}</label>
                    <input
                      type="number" step="0.01" min="0" value={counted[k]}
                      onChange={(e) => setCounted((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder="0.00" className={field}
                    />
                    {counted[k] !== '' && (
                      <p className="mt-1 text-[11px]"><Variance amount={live[k]} /></p>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Float left for tomorrow
                  </label>
                  <input
                    type="number" step="0.01" min="0" value={floatKept}
                    onChange={(e) => setFloatKept(e.target.value)}
                    placeholder="0.00" className={field}
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    Cash staying in the drawer — not counted as missing.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Note</label>
                  <input
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything worth explaining" className={field}
                  />
                </div>
              </div>

              {anythingCounted && (
                <div className={`rounded-xl p-3 border ${
                  Math.abs(live.total) < 0.005
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <p className="text-sm font-bold text-gray-900">
                    On the whole day: <Variance amount={live.total} />
                  </p>
                </div>
              )}

              <button
                onClick={() => close.mutate()} disabled={close.isPending || !anythingCounted}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
              >
                <FiLock className="inline mr-1.5" size={14} />
                {close.isPending ? 'Closing…' : `Close ${format(new Date(date + 'T00:00:00'), 'dd MMM')}`}
              </button>
            </div>
          )}

          {/* ── The days already closed ───────────────────────────────── */}
          {(history?.records || []).length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-wide px-4 py-3 border-b">
                Closed days
              </h2>
              <ul className="divide-y">
                {history.records.map((r) => (
                  <li key={r._id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-bold text-gray-900">
                        {format(new Date(r.business_date), 'EEE dd MMM yyyy')}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {formatCurrency(r.counted?.cash)} cash counted · by{' '}
                        {r.closed_by?.username || '—'}
                      </p>
                    </div>
                    <Variance amount={r.variance?.total} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={!!reopening}
        onClose={() => setReopening(null)}
        onConfirm={() => reopen.mutate(reopening._id)}
        title="Reopen this day?"
        message="The count that was signed off is erased and the day can be counted again."
        confirmText="Reopen"
        danger
        loading={reopen.isPending}
      />
    </div>
  )
}
