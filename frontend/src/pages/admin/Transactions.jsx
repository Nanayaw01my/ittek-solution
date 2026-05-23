import React, { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import { format, subDays } from 'date-fns'
import toast from 'react-hot-toast'

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const PER_PAGE = 25

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: PER_PAGE, from: dateFrom, to: dateTo })
      const res = await api.get(`/admin/transactions?${params}`)
      const data = res.data
      setTransactions(data.transactions || data.data || [])
      setTotalPages(data.totalPages || Math.ceil((data.total || 0) / PER_PAGE))
      setTotal(data.total || 0)
      setTotalAmount(data.total_amount || 0)
    } catch {
      toast.error('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [page, dateFrom, dateTo])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const handleExportCSV = async () => {
    try {
      const res = await api.get(`/admin/transactions/export?from=${dateFrom}&to=${dateTo}`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `transactions_${dateFrom}_${dateTo}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      toast.success('Export started!')
    } catch {
      // Fallback: build CSV from current page data
      const csvHeader = 'Date,Customer,Amount,Method,Reference,Status\n'
      const csvRows = transactions.map(tx =>
        `"${tx.created_at ? format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm') : ''}","${tx.customer_name || ''}","${tx.amount}","${tx.payment_method || tx.method || ''}","${tx.reference || ''}","${tx.status || ''}"`
      ).join('\n')
      const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transactions_${dateFrom}_${dateTo}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      toast.success('CSV exported!')
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-24 pt-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} transactions • GHS {Number(totalAmount).toLocaleString()} total
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-green-800 text-green-800 font-semibold text-sm rounded-2xl
                     hover:bg-green-50 active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Date filters */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : transactions.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-card">
          <svg className="w-14 h-14 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p className="text-gray-500 font-medium">No transactions in this period</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-4">
            {/* Desktop header */}
            <div className="hidden sm:grid sm:grid-cols-6 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <div className="col-span-2">Date / Customer</div>
              <div>Amount</div>
              <div>Method</div>
              <div className="col-span-2">Reference</div>
            </div>

            <div className="divide-y divide-gray-50">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{tx.customer_name || 'Customer'}</p>
                      <StatusBadge status={tx.status || 'paid'} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {tx.created_at ? format(new Date(tx.created_at), 'dd MMM yyyy, HH:mm') : ''} •{' '}
                      {tx.payment_method || tx.method || 'Mobile Money'}
                    </p>
                    {tx.reference && (
                      <p className="text-xs font-mono text-gray-400 truncate">{tx.reference}</p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-green-800 flex-shrink-0">
                    GHS {Number(tx.amount || 0).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 font-medium">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
