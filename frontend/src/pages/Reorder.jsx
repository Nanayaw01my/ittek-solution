import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { FiTrendingUp, FiPackage } from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency } from '../utils/helpers'
import { getReorderSuggestions } from '../api/reorder'

const URGENCY = {
  out: ['Out of stock', 'bg-red-100 text-red-700'],
  urgent: ['Order now', 'bg-orange-100 text-orange-700'],
  soon: ['Order soon', 'bg-amber-100 text-amber-700'],
  ok: ['Fine', 'bg-gray-100 text-gray-600'],
}

export default function Reorder() {
  const [windowDays, setWindowDays] = useState(90)
  const [coverDays, setCoverDays] = useState(30)

  const { data, isLoading } = useQuery({
    queryKey: ['reorder', windowDays, coverDays],
    queryFn: () => getReorderSuggestions({ days: windowDays, cover_days: coverDays })
      .then((r) => r.data),
  })

  const rows = data?.suggestions || []
  const dead = data?.dead_stock || []
  const summary = data?.summary || {}

  const select = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white'

  return (
    <div className="space-y-5">
      <PageHeader
        title="What to Order"
        subtitle="Worked out from what actually sells, not a fixed threshold"
        action={<RefreshButton keys={['reorder']} />}
      />

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <label className="text-xs font-semibold text-gray-600">Judging by the last</label>
        <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className={select}>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={180}>6 months</option>
          <option value={365}>a year</option>
        </select>
        <label className="text-xs font-semibold text-gray-600">· enough to cover</label>
        <select value={coverDays} onChange={(e) => setCoverDays(Number(e.target.value))} className={select}>
          <option value={14}>2 weeks</option>
          <option value={30}>a month</option>
          <option value={60}>2 months</option>
          <option value={90}>3 months</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Out of stock</p>
          <p className="text-xl font-black text-red-600">{summary.out_of_stock || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Order now</p>
          <p className="text-xl font-black text-orange-600">{summary.urgent || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Order soon</p>
          <p className="text-xl font-black text-amber-600">{summary.soon || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">The whole order</p>
          <p className="text-xl font-black text-gray-900">{formatCurrency(summary.order_cost || 0)}</p>
          <p className="text-[11px] text-gray-500">at cost</p>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiPackage className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">
            Nothing needs ordering — everything has enough to cover the next{' '}
            {coverDays} days.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-bold">Product</th>
                  <th className="text-right px-3 py-2 font-bold">On hand</th>
                  <th className="text-right px-3 py-2 font-bold">Sells</th>
                  <th className="text-right px-3 py-2 font-bold">Lasts</th>
                  <th className="text-right px-3 py-2 font-bold">Order</th>
                  <th className="text-right px-3 py-2 font-bold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const [label, style] = URGENCY[r.urgency] || URGENCY.ok
                  return (
                    <tr key={r._id}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gray-900">{r.name}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${style}`}>
                            {label}
                          </span>
                          {r.supplier && (
                            <span className="text-[11px] text-gray-500">{r.supplier}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-gray-900">{r.on_hand}</td>
                      <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                        {r.per_week > 0 ? `${r.per_week}/wk` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {r.days_left == null ? (
                          <span className="text-gray-400">not selling</span>
                        ) : (
                          <span className={r.days_left <= 7 ? 'text-red-600 font-bold' : 'text-gray-600'}>
                            {r.days_left} day{r.days_left === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-black text-gray-900">
                        {r.suggested_order > 0 ? r.suggested_order : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {r.order_cost > 0 ? formatCurrency(r.order_cost) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Money sitting still ───────────────────────────────────────── */}
      {dead.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <h2 className="text-xs font-black text-gray-500 uppercase tracking-wide px-4 py-3 border-b flex items-center gap-1.5">
            <FiTrendingUp size={13} /> Not moving —
            {' '}{summary.dead_count} product{summary.dead_count === 1 ? '' : 's'} sold nothing
            in {data?.window_days} days
          </h2>
          <ul className="divide-y max-h-72 overflow-y-auto">
            {dead.map((r) => (
              <li key={r._id} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <p className="font-semibold text-gray-900">{r.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {r.last_sold ? `last sold ${format(new Date(r.last_sold), 'dd MMM yyyy')}`
                      : 'never sold'}
                  </p>
                </div>
                <p className="text-gray-600">{r.on_hand} on the shelf</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
