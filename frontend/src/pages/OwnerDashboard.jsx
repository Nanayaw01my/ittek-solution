import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  FiShoppingBag, FiBarChart2, FiDollarSign, FiUsers, FiCreditCard,
  FiAlertTriangle, FiArrowRight, FiSun, FiWifi, FiZap, FiGrid,
  FiSmartphone, FiRotateCcw,
} from 'react-icons/fi'
import HeadlineCard from '../components/HeadlineCard'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { getDashboardOverview } from '../api/reports'
import { formatCurrency } from '../utils/helpers'

/**
 * The owner's dashboard: the whole shop on one screen.
 *
 * Six figures across the top with how they compare with the period
 * before, then the panels an owner actually opens the app to check —
 * what the fortnight looks like, which side of the business the stock is
 * in, how today's money arrived, what is selling, what is running out,
 * where the months are going, what just happened at the till, and who
 * sold it.
 *
 * Every figure comes from one request. Fourteen panels fetched one at a
 * time is fourteen round trips on a Ghanaian mobile connection before
 * anything appears.
 */

const DEPT = {
  solar: { colour: '#F97316', Icon: FiSun },
  networking: { colour: '#2563eb', Icon: FiWifi },
  electrical: { colour: '#16a34a', Icon: FiZap },
  other: { colour: '#94a3b8', Icon: FiGrid },
}

const METHOD = {
  cash: { label: 'Cash', colour: '#16a34a', Icon: FiDollarSign },
  mobile_money: { label: 'Mobile Money', colour: '#F97316', Icon: FiSmartphone },
  card: { label: 'Card', colour: '#2563eb', Icon: FiCreditCard },
  split: { label: 'Split', colour: '#7c3aed', Icon: FiCreditCard },
}

/**
 * Money on the six headline cards, without the pesewas.
 *
 * formatCurrency gives GH₵184,350.00, and the ".00" is three characters
 * the card does not have: six cards across a laptop leaves about 230px
 * each, and the figures were coming out as "GH₵ 184…". Nobody reads a
 * month's takings to the pesewa from across a desk, so the headline
 * rounds and the panels below keep the exact figures.
 */
const cash = (n) => `GH₵ ${Math.round(Number(n) || 0).toLocaleString('en-GH')}`

/** Axis labels: GH₵12,400 is unreadable on a tick, 12k is not. */
const compact = (n) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}m`
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)}k`
  return String(Math.round(v))
}

const Panel = ({ title, note, action, children, className = '' }) => (
  <div className={`bg-white border border-gray-200 rounded-2xl p-4 flex flex-col ${className}`}>
    <div className="flex items-baseline justify-between gap-2 mb-3">
      <h2 className="text-[15px] font-black text-gray-900">
        {title}{note && <span className="text-xs font-bold text-gray-400 ml-1.5">{note}</span>}
      </h2>
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
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function OwnerDashboard({ username }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => getDashboardOverview().then((r) => r.data),
    refetchInterval: 60000,
  })

  if (isLoading) return <div className="p-6"><LoadingSpinner text="Working out the figures…" /></div>

  /**
   * A failed request must not look like a quiet day.
   *
   * Every panel falling back to zero reads as "no sales", not as "the
   * figures did not load" — on the one screen an owner opens to check
   * whether the shop took any money.
   */
  if (isError || !data?.headline) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex items-start gap-3 bg-red-50 border-2 border-red-300 rounded-2xl p-5">
          <FiAlertTriangle className="text-red-600 shrink-0 mt-0.5" size={22} />
          <div>
            <p className="font-black text-red-800">The figures did not load — these are not real zeros.</p>
            <p className="text-sm text-gray-700 mt-1">
              {error?.response?.data?.message || error?.message || 'The server could not be reached.'}
            </p>
            <div className="mt-3"><RefreshButton keys={[['dashboard-overview']]} /></div>
          </div>
        </div>
      </div>
    )
  }

  const h = data.headline
  const days = data.days || []
  const salesSeries = days.map((d) => d.sales)
  const profitSeries = days.map((d) => d.profit)
  const departments = data.departments || []
  const deptTotal = departments.reduce((s, d) => s + d.value, 0) || 1

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-gray-900 leading-none">
            Dashboard
          </h1>
          <p className="text-[13px] text-gray-600 font-semibold mt-1">
            Hello, {username}. Here is the shop today.
          </p>
        </div>
        <RefreshButton keys={[['dashboard-overview']]} />
      </div>

      {/* The six figures. */}
      {/* Six across only once there is room for six: at 1280 the cards
          come to about 200px each and a month's takings does not fit in
          one. Three across below that, two on a phone. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
        {/*
          Net of refunds, and says so when there were any. The figure a
          shop wants under "Today's Sales" is what it actually holds,
          but a number that silently shrank by GH₵3,400 when somebody
          returned a battery would read as a fault in the till.
        */}
        <HeadlineCard tone="indigo" icon={FiShoppingBag} label="Today's Sales"
          value={cash(h.today_sales.value)} delta={h.today_sales.delta}
          note="vs yesterday" series={salesSeries}
          footnote={h.today_sales.refunded > 0
            ? `${cash(h.today_sales.gross)} sold, ${cash(h.today_sales.refunded)} refunded`
            : null} />
        <HeadlineCard tone="green" icon={FiBarChart2} label="This Month"
          value={cash(h.month_sales.value)} delta={h.month_sales.delta}
          note="vs last month" series={days.map((d) => d.sales)}
          footnote={h.month_sales.refunded > 0
            ? `${cash(h.month_sales.refunded)} refunded` : null} />
        <HeadlineCard tone="amber" icon={FiDollarSign} label="Today's Profit"
          value={cash(h.today_profit.value)} delta={h.today_profit.delta}
          note="vs yesterday" series={profitSeries} />
        {/*
          Refunds, where the stock value used to be. The shelves are still
          valued below, department by department; what was not anywhere was
          money going back out of the till, which is a thing an owner wants
          to see the moment it happens rather than at the month's end.

          A rise here is not good news, so the card says what it is
          counting rather than leaving an upward arrow to be read as
          growth: how many today, and how many are still waiting on a
          decision — a queue nobody has looked at is its own problem.
        */}
        <HeadlineCard tone="blue" icon={FiRotateCcw} label="Refunds today"
          value={cash(h.refunds.value)} delta={h.refunds.delta} note="vs yesterday"
          footnote={h.refunds.pending
            ? `${h.refunds.count} today · ${h.refunds.pending} awaiting approval`
            : `${h.refunds.count} today · ${cash(h.refunds.month)} this month`} />
        <HeadlineCard tone="pink" icon={FiUsers} label="Customers"
          value={String(h.customers.value)} delta={h.customers.delta}
          note="new vs last month" />
        <HeadlineCard tone="teal" icon={FiCreditCard} label="Owed to us"
          value={cash(h.outstanding.value)} delta={h.outstanding.delta}
          note={`${h.outstanding.count} debts`} />
      </div>

      {/* Overview · departments · how the money came in */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Sales Overview" note="(last 14 days)" className="lg:col-span-2">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                       axisLine={false} tickLine={false} interval={2} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                       axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke="#2563eb" strokeWidth={2.5}
                      fill="url(#gSales)" />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="#16a34a" strokeWidth={2.5}
                      fill="url(#gProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-1 text-[11px] font-black">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-3 h-[3px] rounded bg-blue-600" /> SALES
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-3 h-[3px] rounded bg-green-600" /> PROFIT
            </span>
          </div>
        </Panel>

        <Panel title="Stock by Department">
          {departments.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No stock to split yet.</p>
          ) : (
            <>
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={departments} dataKey="value" nameKey="label"
                         innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
                      {departments.map((d) => (
                        <Cell key={d.key} fill={(DEPT[d.key] || DEPT.other).colour} />
                      ))}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {departments.map((d) => {
                  const { colour, Icon } = DEPT[d.key] || DEPT.other
                  return (
                    <div key={d.key} className="flex items-center gap-2.5">
                      <Icon size={14} style={{ color: colour }} className="shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-bold text-gray-800 truncate">{d.label}</span>
                        <span className="block text-[11px] text-gray-500">{formatCurrency(d.value)}</span>
                      </span>
                      <span className="text-[13px] font-black text-gray-900 tabular-nums">
                        {Math.round((d.value / deptTotal) * 100)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="How today's money came in">
          {(data.collections || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Nothing taken yet today.</p>
          ) : (
            <>
              <div className="space-y-2">
                {data.collections.map((c) => {
                  const m = METHOD[c.method] || { label: c.method, colour: '#64748b', Icon: FiDollarSign }
                  const pct = data.collected ? Math.round((c.total / data.collected) * 100) : 0
                  return (
                    <div key={c.method} className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
                            style={{ background: `${m.colour}1a`, color: m.colour }}>
                        <m.Icon size={16} />
                      </span>
                      <span className="flex-1 text-[13px] font-bold text-gray-800">{m.label}</span>
                      <span className="text-[13px] font-black tabular-nums">{formatCurrency(c.total)}</span>
                      <span className="w-10 text-right text-[12px] font-bold text-gray-400 tabular-nums">{pct}%</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 mt-3 pt-3">
                <span className="text-[13px] font-black text-gray-700">Total today</span>
                <span className="text-[15px] font-black text-green-600 tabular-nums">
                  {formatCurrency(data.collected)}
                </span>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Top 5 this month"
               action={<Link to="/reports" className="text-[11px] font-black text-orange-600 inline-flex items-center gap-1">
                 ALL <FiArrowRight size={11} /></Link>}>
          {(data.top_products || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Nothing sold this month yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.top_products.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 py-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-100 grid place-items-center text-[11px] font-black text-gray-500 shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold text-gray-800 truncate">{p.name}</span>
                    <span className="block text-[11px] text-gray-500">{p.qty} sold</span>
                  </span>
                  <span className="text-[13px] font-black tabular-nums">{formatCurrency(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Running out"
               note={`(${(data.low_stock || []).length})`}
               action={<Link to="/products" className="text-[11px] font-black text-orange-600 inline-flex items-center gap-1">
                 ALL <FiArrowRight size={11} /></Link>}>
          {(data.low_stock || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Nothing is running low.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.low_stock.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold text-gray-800 truncate">{p.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {p.quantity} left · reorder at {p.low_stock_level}
                    </span>
                  </span>
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg shrink-0 ${
                    p.status === 'out' ? 'bg-red-600 text-white'
                      : p.status === 'critical' ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'}`}>
                    {p.status === 'out' ? 'Out' : p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Profit by month" note="(last 7)">
          <div className="h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.months || []} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                       axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                       axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<Tip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="profit" name="Profit" fill="#16a34a" radius={[6, 6, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Just now"
               action={<Link to="/sales-history" className="text-[11px] font-black text-orange-600 inline-flex items-center gap-1">
                 ALL <FiArrowRight size={11} /></Link>}>
          {(data.recent || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No sales yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.recent.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2">
                  <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${
                    s.kind === 'collection' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                    {s.kind === 'collection' ? <FiRotateCcw size={15} /> : <FiShoppingBag size={15} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-black text-gray-800 truncate">{s.invoice_no}</span>
                    <span className="block text-[11px] text-gray-500 truncate">
                      {s.customer_name || (s.kind === 'collection' ? 'Collection' : 'Walk-in')}
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
          )}
        </Panel>

        {/*
          The reference this was built from had "Branch Wise Sales". There
          is one shop, so the question underneath it — where is the money
          coming from — is answered here by who took it.
        */}
        <Panel title="Who sold it" note="(this month)">
          {(data.staff || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No sales this month yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.staff.map((s, i) => {
                const top = data.staff[0]?.total || 1
                const colour = ['#2563eb', '#16a34a', '#F97316', '#7c3aed', '#ec4899'][i % 5]
                return (
                  <div key={s.name}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-bold text-gray-700 truncate">{s.name}</span>
                      <span className="text-[12px] font-black tabular-nums shrink-0">{formatCurrency(s.total)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                      <div className="h-full rounded-full"
                           style={{ width: `${Math.max(4, (s.total / top) * 100)}%`, background: colour }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
