import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  FiShoppingBag, FiFileText, FiPackage, FiTrendingUp, FiArrowUp, FiArrowDown,
  FiDollarSign, FiSmartphone, FiCreditCard, FiAlertTriangle, FiArrowRight, FiLock,
} from 'react-icons/fi'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { getMyToday } from '../api/myWeek'
import { formatCurrency } from '../utils/helpers'

/**
 * A sales attendant's own day.
 *
 * Everything here is theirs and only theirs — their takings, their
 * sales, what they sold, how their customers paid. The shop's figures
 * are not on it, and neither is anything worked out from cost price:
 * an attendant stands in front of this screen all day with customers
 * on the other side of the counter.
 *
 * Which is also why there are no stock counts. The shop decided those
 * are the CEO's alone, and a dashboard is exactly where such a rule
 * gets quietly undone by somebody adding a helpful panel.
 */

/**
 * The shop's own colours.
 *
 * Built first in the greens of the reference layout, which made the one
 * screen an attendant lives on look like it belonged to a different
 * business from the till beside it. The layout was what the shop liked;
 * the palette was never part of the ask.
 */
const BRAND = {
  deep: '#9A3412',   // orange-800 — the filled card
  mid: '#F97316',    // orange-500 — the brand itself
  light: '#FB923C',  // orange-400
  pale: '#FED7AA',   // orange-200
  faint: '#FFEDD5',  // orange-100
}

/** Five shades of the one colour, dark to pale, for the pie. */
const SLICES = [BRAND.deep, '#C2410C', BRAND.mid, BRAND.light, BRAND.pale]

const METHODS = {
  cash: { label: 'Cash', Icon: FiDollarSign, colour: BRAND.deep },
  mobile_money: { label: 'Mobile Money', Icon: FiSmartphone, colour: BRAND.mid },
  card: { label: 'Card', Icon: FiCreditCard, colour: BRAND.light },
  split: { label: 'Split', Icon: FiCreditCard, colour: '#94a3b8' },
}

const compact = (n) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}m`
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)}k`
  return String(Math.round(v))
}

/** One of the four figures at the top. The first one is filled. */
const Figure = ({ label, value, sub, delta, icon: Icon, filled }) => (
  <div className={`relative overflow-hidden rounded-2xl p-4 ${
    filled ? 'text-white' : 'bg-white border border-gray-200'}`}
       style={filled ? { background: BRAND.deep } : undefined}>
    <div className="flex items-start justify-between gap-2">
      <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
        filled ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>
        <Icon size={18} />
      </span>
      {delta !== undefined && delta !== null && (
        <span className={`text-[11px] font-black px-2 py-1 rounded-full ${
          Number(delta) >= 0 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'}`}>
          {Number(delta) >= 0 ? '+' : ''}{Number(delta).toFixed(1)}%
        </span>
      )}
    </div>
    <p className={`text-[12px] font-bold mt-3 ${filled ? 'text-white/75' : 'text-gray-500'}`}>{label}</p>
    <div className="flex items-end justify-between gap-2 mt-0.5">
      <p className={`text-[24px] font-black leading-none tabular-nums ${filled ? '' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-[10.5px] font-bold leading-tight text-right ${
          filled ? 'text-white/60' : 'text-gray-400'}`}>{sub}</p>
      )}
    </div>
  </div>
)

const Panel = ({ title, note, action, children, className = '' }) => (
  <div className={`bg-white border border-gray-200 rounded-2xl p-4 ${className}`}>
    <div className="flex items-start justify-between gap-2 mb-3">
      <div>
        <h2 className="text-[15px] font-black text-gray-900">{title}</h2>
        {note && <p className="text-[11.5px] text-gray-500 font-semibold">{note}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
)

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border-2 border-gray-900 rounded-xl px-3 py-2 shadow-lg">
      <p className="text-[11px] font-black text-gray-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-black" style={{ color: p.color || p.fill }}>
          {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function AttendantDashboard({ username }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['my-today'],
    queryFn: () => getMyToday().then((r) => r.data),
    refetchInterval: 60000,
  })

  if (isLoading) return <div className="p-6"><LoadingSpinner text="Working out your day…" /></div>

  if (isError || !data?.today) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="flex items-start gap-3 bg-red-50 border-2 border-red-300 rounded-2xl p-5">
          <FiAlertTriangle className="text-red-600 shrink-0 mt-0.5" size={22} />
          <div>
            {/* Zeros everywhere would read as "you sold nothing today",
                which is a cruel thing for a screen to say wrongly. */}
            <p className="font-black text-red-800">Your figures did not load — these are not real zeros.</p>
            <p className="text-sm text-gray-700 mt-1">
              {error?.response?.data?.message || error?.message || 'The server could not be reached.'}
            </p>
            <div className="mt-3"><RefreshButton keys={[['my-today']]} /></div>
          </div>
        </div>
      </div>
    )
  }

  const t = data.today
  const days = (data.week?.days || []).map((d) => ({ ...d, takings: d.future ? 0 : d.takings }))
  const methods = data.methods || []
  const methodTotal = methods.reduce((s, m) => s + m.total, 0) || 1
  const products = data.top_products || []
  const productTotal = products.reduce((s, p) => s + p.value, 0) || 1

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-none">My day</h1>
          <p className="text-[13px] text-gray-600 font-semibold mt-1">
            {new Date().toLocaleDateString('en-GH', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton keys={[['my-today']]} />
          <Link to="/pos"
                className="px-4 py-2.5 rounded-xl text-white font-black text-sm"
                style={{ background: BRAND.deep }}>
            Sell
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Figure filled icon={FiShoppingBag} label="My takings today"
                    value={formatCurrency(t.takings)} delta={t.delta} sub="vs yesterday" />
            <Figure icon={FiFileText} label="Sales rung up" value={String(t.sales)}
                    sub={t.sales === 1 ? 'sale' : 'sales'} />
            <Figure icon={FiPackage} label="Items sold" value={String(t.pieces)} sub="pieces" />
            <Figure icon={FiTrendingUp} label="Average sale"
                    value={formatCurrency(t.average)} sub="per customer" />
          </div>

          <Panel title="My week" note="What I have taken each day">
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fontWeight: 800, fill: '#94a3b8' }}
                         axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                         axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<Tip />} cursor={{ fill: '#fff7ed' }} />
                  <Bar dataKey="takings" radius={[8, 8, 0, 0]} maxBarSize={38}>
                    {days.map((d, i) => (
                      // Today stands out; the days still to come are left
                      // pale rather than drawn as a day that took nothing.
                      <Cell key={d.day}
                            fill={d.future ? '#e5e7eb'
                              : (i === days.findIndex((x) => x.future) - 1 ? BRAND.deep : BRAND.mid)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 mt-2 pt-3">
              <span className="text-[13px] font-bold text-gray-600">This week so far</span>
              <span className="text-[16px] font-black tabular-nums">{formatCurrency(data.week?.takings)}</span>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="What I sold" note="Today, by value"
                 className="bg-gradient-to-b from-orange-50 to-white">
            {products.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">Nothing sold yet today.</p>
            ) : (
              <>
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={products} dataKey="value" nameKey="name"
                           outerRadius="92%" stroke="#fff" strokeWidth={2}>
                        {products.map((p, i) => (
                          <Cell key={p.name}
                                fill={SLICES[i % 5]} />
                        ))}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-3">
                  {products.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: SLICES[i % 5] }} />
                      <span className="flex-1 min-w-0 text-[12.5px] font-bold text-gray-700 truncate">{p.name}</span>
                      <span className="text-[12px] font-black tabular-nums text-gray-500">{p.pieces}</span>
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 tabular-nums">
                        {Math.round((p.value / productTotal) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel title="How they paid" note="Today">
            {methods.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Nothing taken yet.</p>
            ) : (
              <div className="space-y-3">
                {methods.map((m) => {
                  const spec = METHODS[m.method] || { label: m.method, Icon: FiDollarSign, colour: '#94a3b8' }
                  const pct = Math.round((m.total / methodTotal) * 100)
                  return (
                    <div key={m.method}>
                      <div className="flex items-center gap-2">
                        <spec.Icon size={14} style={{ color: spec.colour }} className="shrink-0" />
                        <span className="flex-1 text-[12.5px] font-bold text-gray-700">{spec.label}</span>
                        <span className="text-[12.5px] font-black tabular-nums">{formatCurrency(m.total)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full"
                             style={{ width: `${Math.max(4, pct)}%`, background: spec.colour }} />
                      </div>
                    </div>
                  )
                })}
                {/* Cash-up counts the drawer against the cash line, so the
                    split is worth an attendant's eye before somebody else
                    counts it at the end of the day. */}
                <Link to="/cash-up"
                      className="flex items-center justify-between border-t border-gray-100 pt-3 mt-1 group">
                  <span className="flex items-center gap-2 text-[12.5px] font-black text-gray-700">
                    <FiLock size={13} /> Cash up
                  </span>
                  <FiArrowRight size={14} className="text-gray-300 group-hover:text-orange-600" />
                </Link>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {data.recent?.length > 0 && (
        <Panel title="My last few sales"
               action={<Link to="/my-week"
                             className="text-[11px] font-black text-orange-600 inline-flex items-center gap-1">
                 MY WEEK <FiArrowRight size={11} /></Link>}>
          <div className="divide-y divide-gray-50">
            {data.recent.map((s) => (
              <div key={s.invoice_no} className="flex items-center gap-3 py-2.5">
                <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-orange-50"
                      style={{ color: BRAND.deep }}>
                  <FiShoppingBag size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-black text-gray-800 truncate">{s.invoice_no}</span>
                  <span className="block text-[11px] text-gray-500 truncate">
                    {s.customer_name || 'Walk-in customer'}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[13px] font-black tabular-nums">{formatCurrency(s.total)}</span>
                  <span className="block text-[10px] font-bold text-gray-400">
                    {new Date(s.at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {data.collections?.count > 0 && (
        <p className="text-[12px] text-gray-500 font-semibold">
          You also collected {formatCurrency(data.collections.amount)} on {data.collections.count}{' '}
          {data.collections.count === 1 ? 'debt' : 'debts'} today. That is money paid in, not sold,
          so it is counted apart from your takings above.
        </p>
      )}
    </div>
  )
}
