import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { FiTrendingUp, FiTrendingDown, FiDollarSign, FiActivity } from 'react-icons/fi'
import { getFinancialOverview, getCashFlow } from '../api/reports'
import { formatCurrency } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import DateRangePicker from '../components/DateRangePicker'
import StatCard from '../components/StatCard'
import { format, startOfMonth } from 'date-fns'

const TABS = ['Overview', 'P&L Statement', 'Cash Flow']

function OverviewTab({ data, loading }) {
  if (loading) return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {Array(6).fill(0).map((_, i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-xl" />)}
    </div>
  )
  const d = data || {}
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={FiTrendingUp} value={formatCurrency(d.totalRevenue || 0)} label="Total Revenue" color="green" />
        <StatCard icon={FiDollarSign} value={formatCurrency(d.grossProfit || 0)} label="Gross Profit" color="blue" />
        <StatCard icon={FiActivity} value={formatCurrency(d.netProfit || 0)} label="Net Profit" color={d.netProfit >= 0 ? 'green' : 'red'} />
        <StatCard icon={FiTrendingDown} value={formatCurrency(d.totalExpenses || 0)} label="Total Expenses" color="red" />
        <StatCard icon={FiDollarSign} value={formatCurrency(d.cogs || 0)} label="Cost of Goods Sold" color="orange" />
        <StatCard icon={FiActivity} value={`${(d.profitMargin || 0).toFixed(1)}%`} label="Profit Margin" color="purple" />
      </div>
    </div>
  )
}

function PLTab({ data, loading }) {
  if (loading) return <div className="h-64 bg-gray-100 animate-pulse rounded-xl" />
  const d = data || {}
  const rows = [
    { label: 'REVENUE', isHeader: true },
    { label: 'Gross Sales', value: d.grossRevenue || 0, positive: true },
    { label: 'Less: Discounts', value: -(d.discounts || 0), positive: false },
    { label: 'Net Revenue', value: d.totalRevenue || 0, positive: true, bold: true },
    { label: '', divider: true },
    { label: 'COST OF GOODS SOLD', isHeader: true },
    { label: 'Opening Stock Value', value: d.openingStock || 0, positive: false },
    { label: 'Add: Purchases', value: d.purchases || 0, positive: false },
    { label: 'Less: Closing Stock Value', value: -(d.closingStock || 0), positive: true },
    { label: 'COGS', value: d.cogs || 0, positive: false, bold: true },
    { label: '', divider: true },
    { label: 'GROSS PROFIT', value: d.grossProfit || 0, positive: (d.grossProfit || 0) >= 0, bold: true, highlight: true },
    { label: '', divider: true },
    { label: 'OPERATING EXPENSES', isHeader: true },
    ...(d.expensesByCategory || []).map(e => ({ label: e.category, value: e.total, positive: false })),
    { label: 'Total Operating Expenses', value: d.totalExpenses || 0, positive: false, bold: true },
    { label: '', divider: true },
    { label: 'WORKER PAYMENTS', value: d.workerPayments || 0, positive: false },
    { label: '', divider: true },
    { label: 'NET PROFIT / (LOSS)', value: d.netProfit || 0, positive: (d.netProfit || 0) >= 0, bold: true, highlight: true },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-orange-500">
        <h3 className="text-white font-black text-lg">Profit & Loss Statement</h3>
      </div>
      <div>
        {rows.map((row, i) => {
          if (row.divider) return <div key={i} className="h-px bg-gray-200" />
          if (row.isHeader) return (
            <div key={i} className="px-6 py-2 bg-gray-100 text-xs font-black text-gray-600 uppercase tracking-wider">
              {row.label}
            </div>
          )
          return (
            <div key={i} className={`flex justify-between px-6 py-3 text-sm ${row.highlight ? 'bg-orange-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
              <span className={`${row.bold ? 'font-black text-gray-900' : 'text-gray-700'}`}>{row.label}</span>
              <span className={`font-semibold ${row.bold ? 'font-black text-base' : ''} ${row.positive ? 'text-green-700' : 'text-red-600'}`}>
                {row.value < 0 ? `(${formatCurrency(Math.abs(row.value))})` : formatCurrency(Math.abs(row.value || 0))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CashFlowTab({ startDate, endDate }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cash-flow', startDate, endDate],
    queryFn: () => getCashFlow({ startDate, endDate }).then(r => r.data),
  })
  if (isLoading) return <div className="h-64 bg-gray-100 animate-pulse rounded-xl" />
  const d = data || {}
  const chartData = d.trend || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm text-green-700">Sales Inflow</p>
          <p className="text-xl font-black text-green-800">{formatCurrency(d.salesInflow || 0)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-700">Debt Collections</p>
          <p className="text-xl font-black text-blue-800">{formatCurrency(d.debtCollections || 0)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">Expenses Outflow</p>
          <p className="text-xl font-black text-red-800">{formatCurrency(d.expenseOutflow || 0)}</p>
        </div>
        <div className={`border rounded-xl p-4 ${(d.netCashFlow || 0) >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-sm ${(d.netCashFlow || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>Net Cash Flow</p>
          <p className={`text-xl font-black ${(d.netCashFlow || 0) >= 0 ? 'text-green-800' : 'text-red-800'}`}>
            {formatCurrency(d.netCashFlow || 0)}
          </p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="font-bold text-gray-800 mb-4">Cash Flow Trend</h4>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Area type="monotone" dataKey="inflow" stackId="1" stroke="#10b981" fill="#d1fae5" name="Inflow" />
              <Area type="monotone" dataKey="outflow" stackId="2" stroke="#ef4444" fill="#fee2e2" name="Outflow" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function Financial() {
  const [activeTab, setActiveTab] = useState(0)
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['financial-overview', startDate, endDate],
    queryFn: () => getFinancialOverview({ startDate, endDate }).then(r => r.data),
  })

  const tabComponents = [
    <OverviewTab key="overview" data={overviewData} loading={overviewLoading} />,
    <PLTab key="pl" data={overviewData} loading={overviewLoading} />,
    <CashFlowTab key="cashflow" startDate={startDate} endDate={endDate} />,
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader title="Financial Management" subtitle="Complete financial overview" />

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors
                ${activeTab === i ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {tabComponents[activeTab]}
    </div>
  )
}
