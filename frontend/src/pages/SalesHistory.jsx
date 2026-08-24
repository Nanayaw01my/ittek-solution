import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiChevronDown, FiChevronUp, FiX } from 'react-icons/fi'
import { getSales } from '../api/pos'
import { formatDateTime, formatCurrency } from '../utils/helpers'
import { format, startOfMonth } from 'date-fns'

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700',
  short_payment: 'bg-orange-100 text-orange-700',
  pending: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
}

const METHOD_COLORS = {
  cash: 'bg-gray-100 text-gray-600',
  card: 'bg-blue-100 text-blue-700',
  mobile_money: 'bg-purple-100 text-purple-700',
}

function ItemsCell({ items }) {
  const [expanded, setExpanded] = useState(false)
  if (!items || items.length === 0) return <span className="text-gray-400">—</span>
  return (
    <div>
      <p className="text-xs text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</p>
      {expanded && (
        <ul className="mt-1 space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-gray-600 font-mono">
              {item.product_name || item.name} × {item.quantity} @ {formatCurrency(item.unit_price)}
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-0.5 mt-0.5"
      >
        {expanded ? <><FiChevronUp size={11} /> Hide</> : <><FiChevronDown size={11} /> View</>}
      </button>
    </div>
  )
}

export default function SalesHistory() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [userFilter, setUserFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['sales-history', startDate, endDate, userFilter, statusFilter, page],
    queryFn: () => getSales({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      cashier: userFilter || undefined,
      status: statusFilter || undefined,
      page,
      limit: 25,
    }).then(r => r.data),
  })

  const sales = Array.isArray(data) ? data : (data?.sales || [])
  const pagination = data?.pagination || null

  const totalAmount = sales.reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900">Sales History</h1>
          <p className="text-sm text-gray-500">Complete record of all transactions</p>
        </div>
        <RefreshButton keys={['sales-history']} />
      </div>

      {/* Summary card */}
      {!isLoading && sales.length > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-orange-700 font-medium">
            {pagination ? pagination.total : sales.length} transaction{(pagination?.total ?? sales.length) !== 1 ? 's' : ''} in range
          </p>
          <p className="text-sm font-bold text-orange-700">{formatCurrency(totalAmount)} shown</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <input
          type="text"
          value={userFilter}
          onChange={e => { setUserFilter(e.target.value); setPage(1) }}
          placeholder="Filter by cashier…"
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-44"
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="short_payment">Short Payment</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {(userFilter || statusFilter) && (
          <button
            onClick={() => { setUserFilter(''); setStatusFilter(''); setPage(1) }}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl"
          >
            <FiX size={13} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">Date</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">Invoice #</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Cashier</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Items</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Method</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No sales found for the selected filters
                  </td>
                </tr>
              ) : sales.map((sale, i) => (
                <tr key={sale._id || i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                    {formatDateTime(sale.createdAt || sale.sale_date)}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono font-semibold text-gray-700 whitespace-nowrap">
                    {sale.invoice_no || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                    {sale.user_id?.username || sale.cashier || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {sale.customer_name || <span className="text-gray-400">Walk-in</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ItemsCell items={sale.items} />
                  </td>
                  <td className="px-4 py-3">
                    {sale.payment_method ? (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${METHOD_COLORS[sale.payment_method] || 'bg-gray-100 text-gray-600'}`}>
                        {sale.payment_method.replace('_', ' ')}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${STATUS_COLORS[sale.status] || 'bg-gray-100 text-gray-600'}`}>
                      {(sale.status || '').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                    {formatCurrency(sale.total_amount || sale.totalAmount || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Page {pagination.page} of {pagination.pages} ({pagination.total} entries)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={pagination.page >= pagination.pages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
