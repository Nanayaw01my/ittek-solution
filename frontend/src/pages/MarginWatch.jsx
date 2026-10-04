import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  FiTrendingDown, FiAlertTriangle, FiUsers, FiAward, FiTruck,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency } from '../utils/helpers'
import { getMargins, getStaffPerformance } from '../api/reports'

const STATE = {
  losing: { label: 'Selling at a loss', style: 'bg-red-100 text-red-700' },
  thin: { label: 'Thin', style: 'bg-amber-100 text-amber-700' },
  stale_cost: { label: 'Cost has risen', style: 'bg-sky-100 text-sky-700' },
}

function Margins() {
  const [thin, setThin] = useState(15)
  const { data, isLoading } = useQuery({
    queryKey: ['margins', thin],
    queryFn: () => getMargins({ thin }).then((r) => r.data),
  })

  const rows = data?.products || []
  const s = data?.summary || {}

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Selling at a loss</p>
          <p className="text-xl font-black text-red-600">{s.losing || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Thin margin</p>
          <p className="text-xl font-black text-amber-600">{s.thin || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Cost record out of date</p>
          <p className="text-xl font-black text-sky-600">{s.stale_cost || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Loss sitting on the shelf</p>
          <p className="text-xl font-black text-red-600">{formatCurrency(s.at_risk || 0)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-semibold text-gray-600">Call a margin thin below</span>
        <select value={thin} onChange={(e) => setThin(Number(e.target.value))}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
          {[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}%</option>)}
        </select>
        <span className="text-xs text-gray-400">of {s.checked || 0} products checked</span>
      </div>

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiTrendingDown className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">
            Nothing is selling too cheaply. Every margin is above {thin}%.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={`${p.product_id}-${p.name}`}
              className={`bg-white border rounded-2xl p-4 ${p.state === 'losing' ? 'border-red-200' : 'border-gray-100'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900">{p.name}</p>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${STATE[p.state].style}`}>
                      {STATE[p.state].label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.category || 'No category'} · {p.quantity} in stock
                  </p>

                  <p className="text-sm text-gray-700 mt-1.5">
                    Sells at <span className="font-bold">{formatCurrency(p.selling_price)}</span>
                    {' · costs '}<span className="font-bold">{formatCurrency(Math.max(p.recorded_cost, p.last_paid ?? 0))}</span>
                  </p>

                  {/* The gap between the record and reality is the whole point
                      of this screen, so it is spelled out rather than implied. */}
                  {p.stale_cost && (
                    <p className="text-xs text-sky-700 mt-1">
                      Your record says {formatCurrency(p.recorded_cost)}, but you last paid{' '}
                      <span className="font-bold">{formatCurrency(p.last_paid)}</span>
                      {p.last_paid_on && ` on ${format(new Date(p.last_paid_on), 'd MMM yyyy')}`}.
                      {' '}On the record it looks like {p.recorded_margin_pct}%.
                    </p>
                  )}

                  {p.state === 'losing' && p.at_risk > 0 && (
                    <p className="text-xs text-red-600 font-semibold mt-1 inline-flex items-center gap-1">
                      <FiAlertTriangle size={11} />
                      {formatCurrency(p.at_risk)} lost if the {p.quantity} in stock all sell at this price
                    </p>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className={`text-xl font-black ${p.margin <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {p.margin_pct}%
                  </p>
                  <p className="text-xs text-gray-500">{formatCurrency(p.margin)} each</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Staff() {
  const now = new Date()
  const [from, setFrom] = useState(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(now, 'yyyy-MM-dd'))

  const { data, isLoading } = useQuery({
    queryKey: ['staff-report', from, to],
    queryFn: () => getStaffPerformance({ from, to }).then((r) => r.data),
  })

  const rows = data?.staff || []
  const totals = data?.totals || {}
  const field = 'px-3 py-2 border border-gray-200 rounded-xl text-sm'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Sold</p>
          <p className="text-xl font-black text-gray-900">{formatCurrency(totals.revenue || 0)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Profit</p>
          <p className="text-xl font-black text-green-600">{formatCurrency(totals.profit || 0)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Sales made</p>
          <p className="text-xl font-black text-gray-900">{totals.sales || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Old debts collected</p>
          <p className="text-xl font-black text-orange-600">{formatCurrency(totals.collected || 0)}</p>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {rows.map((p, i) => (
            <div key={p.user_id} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {i === 0 && p.sales > 0 && <FiAward size={15} className="text-amber-500 flex-shrink-0" />}
                    <p className="font-black text-gray-900">{p.username}</p>
                    <span className="text-[11px] text-gray-400">{p.role}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {p.sales} sale{p.sales === 1 ? '' : 's'} · {p.items} item{p.items === 1 ? '' : 's'}
                    {p.sales > 0 && <> · {formatCurrency(p.average)} average · biggest {formatCurrency(p.biggest)}</>}
                  </p>
                  {p.collected > 0 && (
                    <p className="text-xs text-orange-600 mt-0.5">
                      Collected {formatCurrency(p.collected)} on old debts
                      {' '}({p.debt_payments} payment{p.debt_payments === 1 ? '' : 's'})
                    </p>
                  )}
                  {p.field && (
                    <p className="text-xs text-gray-600 mt-0.5 inline-flex items-center gap-1">
                      <FiTruck size={11} className="text-gray-400" />
                      {p.field.dispatches} trip{p.field.dispatches === 1 ? '' : 's'} ·
                      {' '}{p.field.sold} of {p.field.issued} sold ·
                      {' '}{formatCurrency(p.field.paid_in)} paid in
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl font-black text-gray-900">{formatCurrency(p.revenue)}</p>
                  <p className="text-xs text-green-700 font-semibold">
                    {formatCurrency(p.profit)} profit{p.revenue > 0 && ` · ${p.margin_pct}%`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MarginWatch() {
  const [tab, setTab] = useState('margins')

  return (
    <div className="space-y-5">
      <PageHeader
        title={tab === 'margins' ? 'Margin watch' : 'Who sold what'}
        subtitle={tab === 'margins'
          ? 'Products being sold too cheaply, judged on what you actually paid'
          : 'What each person sold, and what it earned'}
        action={<RefreshButton keys={['margins', 'staff-report']} />}
      />

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit max-w-full overflow-x-auto">
        {[
          { key: 'margins', label: 'Margins', icon: FiTrendingDown },
          { key: 'staff', label: 'Who sold what', icon: FiUsers },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-colors
              ${tab === t.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'margins' ? <Margins /> : <Staff />}
    </div>
  )
}
