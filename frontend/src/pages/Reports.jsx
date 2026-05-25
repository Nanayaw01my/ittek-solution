import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { FiDownload, FiFileText } from 'react-icons/fi'
import {
  getDailySalesReport, getSalesByUserReport, getTopProductsReport,
  getProfitLossReport, getDebtorsReport, getStockValuationReport, exportReport
} from '../api/reports'
import { formatCurrency, formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import DateRangePicker from '../components/DateRangePicker'
import Table from '../components/Table'
import { format, startOfMonth } from 'date-fns'
import toast from 'react-hot-toast'
import { saveAs } from 'file-saver'

const TABS = ['Daily Sales', 'By User', 'Top Products', 'Profit & Loss', 'Debtors', 'Stock Valuation']

function ExportBtn({ type, params, label = 'Export' }) {
  const [loading, setLoading] = useState(false)
  const handleExport = async () => {
    setLoading(true)
    try {
      const res = await exportReport(type, params)
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' })
      saveAs(blob, `${type}-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Export downloaded!')
    } catch {
      toast.error('Export failed')
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
    >
      <FiDownload size={14} /> {loading ? 'Exporting...' : label}
    </button>
  )
}

function DailySalesTab({ startDate, endDate }) {
  const { data, isLoading } = useQuery({
    queryKey: ['daily-sales-report', startDate, endDate],
    queryFn: () => getDailySalesReport({ startDate, endDate }).then(r => r.data),
  })
  const rows = data?.daily || []
  const columns = [
    { header: 'Date', key: 'date', render: v => formatDate(v) },
    { header: 'Transactions', key: 'count' },
    { header: 'Subtotal', key: 'subtotal', render: v => formatCurrency(v) },
    { header: 'Discount', key: 'discount', render: v => formatCurrency(v) },
    { header: 'Total', key: 'total', render: v => <span className="font-bold text-orange-600">{formatCurrency(v)}</span> },
  ]
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Daily Sales Report</h3>
        <ExportBtn type="daily-sales" params={{ startDate, endDate }} />
      </div>
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="total" fill="#F97316" radius={[4, 4, 0, 0]} name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Table columns={columns} data={rows} loading={isLoading} emptyMessage="No sales data" />
      {data?.totals && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm font-semibold text-orange-800">
          TOTAL: {formatCurrency(data.totals.total)} | Transactions: {data.totals.count}
        </div>
      )}
    </div>
  )
}

function ByUserTab({ startDate, endDate }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sales-by-user-report', startDate, endDate],
    queryFn: () => getSalesByUserReport({ startDate, endDate }).then(r => r.data),
  })
  const rows = data?.byUser || []
  const columns = [
    { header: 'User', key: 'username', render: (v, row) => (
      <div>
        <p className="font-semibold">{row.username || row._id?.username}</p>
        <p className="text-xs text-gray-500 capitalize">{row.role || row._id?.role}</p>
      </div>
    )},
    { header: 'Transactions', key: 'count' },
    { header: 'Total Sales', key: 'total', render: v => <span className="font-bold text-orange-600">{formatCurrency(v)}</span> },
  ]
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Sales by User</h3>
        <ExportBtn type="sales-by-user" params={{ startDate, endDate }} />
      </div>
      <Table columns={columns} data={rows} loading={isLoading} emptyMessage="No data" />
    </div>
  )
}

function TopProductsTab({ startDate, endDate }) {
  const { data, isLoading } = useQuery({
    queryKey: ['top-products-report', startDate, endDate],
    queryFn: () => getTopProductsReport({ startDate, endDate, limit: 20 }).then(r => r.data),
  })
  const products = data?.products || []
  const columns = [
    { header: '#', key: '_id', render: (_, __, i) => i + 1 },
    { header: 'Product', key: 'name' },
    { header: 'Units Sold', key: 'totalQuantity', render: v => <span className="font-bold">{v}</span> },
    { header: 'Revenue', key: 'totalRevenue', render: v => <span className="font-bold text-orange-600">{formatCurrency(v)}</span> },
  ]
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Top Products</h3>
        <ExportBtn type="top-products" params={{ startDate, endDate }} />
      </div>
      {products.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={products.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip formatter={v => v} />
              <Bar dataKey="totalQuantity" fill="#F97316" radius={[0, 4, 4, 0]} name="Units Sold" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Table columns={columns} data={products} loading={isLoading} emptyMessage="No data" />
    </div>
  )
}

function ProfitLossTab({ startDate, endDate }) {
  const { data, isLoading } = useQuery({
    queryKey: ['profit-loss-report', startDate, endDate],
    queryFn: () => getProfitLossReport({ startDate, endDate }).then(r => r.data),
  })
  if (isLoading) return <div className="h-40 bg-gray-100 animate-pulse rounded-xl" />
  const pl = data || {}
  const items = [
    { label: 'Gross Revenue', value: pl.grossRevenue, bold: false, positive: true },
    { label: 'Cost of Goods Sold (COGS)', value: pl.cogs, bold: false, positive: false },
    { label: 'Gross Profit', value: pl.grossProfit, bold: true, positive: (pl.grossProfit || 0) >= 0 },
    { label: '', value: null },
    { label: 'Total Expenses', value: pl.totalExpenses, bold: false, positive: false },
    ...(pl.expensesByCategory || []).map(e => ({ label: `  — ${e.category}`, value: e.total, bold: false, positive: false, sub: true })),
    { label: '', value: null },
    { label: 'Net Profit', value: pl.netProfit, bold: true, positive: (pl.netProfit || 0) >= 0, highlight: true },
  ]
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Profit & Loss Statement</h3>
        <ExportBtn type="profit-loss" params={{ startDate, endDate }} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {items.map((item, i) => {
          if (!item.label) return <div key={i} className="h-px bg-gray-100" />
          return (
            <div key={i} className={`flex justify-between px-5 py-3 text-sm
              ${item.highlight ? 'bg-orange-50 border-t border-orange-200' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
              ${item.sub ? 'text-gray-500' : ''}`}>
              <span className={`${item.bold ? 'font-black text-gray-900' : 'text-gray-700'} ${item.sub ? 'pl-4' : ''}`}>
                {item.label}
              </span>
              {item.value !== null && item.value !== undefined && (
                <span className={`font-semibold ${item.bold ? 'font-black text-base' : ''} ${item.positive ? 'text-green-700' : 'text-red-600'}`}>
                  {item.positive ? '' : item.value > 0 ? '(' : ''}{formatCurrency(Math.abs(item.value || 0))}{!item.positive && item.value > 0 ? ')' : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DebtorsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['debtors-report'],
    queryFn: () => getDebtorsReport().then(r => r.data),
  })
  const debtors = data?.debtors || []
  const columns = [
    { header: 'Customer', key: 'customer', render: (v, row) => (
      <div>
        <p className="font-semibold">{row.customer?.name}</p>
        <p className="text-xs text-gray-500">{row.customer?.phone}</p>
      </div>
    )},
    { header: 'Total Owed', key: 'amount', render: v => <span className="font-bold text-red-600">{formatCurrency(v)}</span> },
    { header: 'Paid', key: 'amountPaid', render: v => formatCurrency(v || 0) },
    { header: 'Remaining', key: '_id', render: (_, row) => <span className="font-bold text-orange-600">{formatCurrency(row.amount - (row.amountPaid || 0))}</span> },
    { header: 'Due Date', key: 'dueDate', render: v => formatDate(v) },
  ]
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Debtors Report</h3>
        <ExportBtn type="debtors" params={{}} />
      </div>
      {data?.summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <p className="text-sm text-red-700">Total Outstanding</p>
            <p className="text-2xl font-black text-red-600">{formatCurrency(data.summary.totalOutstanding)}</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <p className="text-sm text-orange-700">Active Debtors</p>
            <p className="text-2xl font-black text-orange-600">{data.summary.count}</p>
          </div>
        </div>
      )}
      <Table columns={columns} data={debtors} loading={isLoading} emptyMessage="No active debts" />
    </div>
  )
}

function StockValuationTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-valuation-report'],
    queryFn: () => getStockValuationReport().then(r => r.data),
  })
  const products = data?.products || []
  const columns = [
    { header: 'Product', key: 'name' },
    { header: 'Category', key: 'category', render: v => v?.name || '—' },
    { header: 'Qty', key: 'quantity' },
    { header: 'Cost Price', key: 'costPrice', render: v => formatCurrency(v) },
    { header: 'Selling Price', key: 'sellingPrice', render: v => formatCurrency(v) },
    { header: 'Cost Value', key: 'costValue', render: (_, row) => formatCurrency((row.quantity || 0) * (row.costPrice || 0)) },
    { header: 'Selling Value', key: 'sellingValue', render: (_, row) => formatCurrency((row.quantity || 0) * (row.sellingPrice || 0)) },
  ]
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Stock Valuation</h3>
        <ExportBtn type="stock-valuation" params={{}} />
      </div>
      {data?.summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <p className="text-sm text-blue-700">Total Cost Value</p>
            <p className="text-xl font-black text-blue-600">{formatCurrency(data.summary.totalCostValue)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <p className="text-sm text-green-700">Total Selling Value</p>
            <p className="text-xl font-black text-green-600">{formatCurrency(data.summary.totalSellingValue)}</p>
          </div>
        </div>
      )}
      <Table columns={columns} data={products} loading={isLoading} emptyMessage="No products" />
    </div>
  )
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState(0)
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const tabComponents = [
    <DailySalesTab key="daily" startDate={startDate} endDate={endDate} />,
    <ByUserTab key="user" startDate={startDate} endDate={endDate} />,
    <TopProductsTab key="products" startDate={startDate} endDate={endDate} />,
    <ProfitLossTab key="pl" startDate={startDate} endDate={endDate} />,
    <DebtorsTab key="debtors" />,
    <StockValuationTab key="stock" />,
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader title="Reports" subtitle="Business performance analysis" />

      {/* Date picker + tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
          <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors
                ${activeTab === i ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-orange-50'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {tabComponents[activeTab]}
      </div>
    </div>
  )
}
