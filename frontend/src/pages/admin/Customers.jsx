import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import { format } from 'date-fns'

export default function AdminCustomers() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const PER_PAGE = 20

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page,
        limit: PER_PAGE,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      })
      const res = await api.get(`/admin/customers?${params}`)
      const data = res.data
      setCustomers(data.customers || data.data || [])
      setTotalPages(data.totalPages || Math.ceil((data.total || 0) / PER_PAGE))
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const handleSearch = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const handleStatusFilter = (e) => {
    setStatusFilter(e.target.value)
    setPage(1)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-24 pt-4">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-gray-900">Customers</h1>
        <p className="text-sm text-gray-500 mt-0.5">{total} total customers</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={handleSearch}
            placeholder="Search by name, email, account..."
            className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-2xl text-sm
                       focus:outline-none focus:border-green-600 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={handleStatusFilter}
          className="px-3 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600 bg-white"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="overdue">Overdue</option>
          <option value="locked">Locked</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-card">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500 font-medium">No customers found</p>
          {search && <p className="text-sm text-gray-400 mt-1">Try a different search term</p>}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-4">
            {/* Desktop table header */}
            <div className="hidden sm:grid sm:grid-cols-6 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <div className="col-span-2">Customer</div>
              <div>Account</div>
              <div>Device</div>
              <div>Status</div>
              <div>Next Due</div>
            </div>

            <div className="divide-y divide-gray-50">
              {customers.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/admin/customers/${c.id}`)}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors active:bg-gray-100"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    {c.photo_url ? (
                      <img src={c.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <span className="text-green-800 font-bold text-sm">
                        {(c.full_name || c.name || 'C').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {c.full_name || c.name}
                      </p>
                      <StatusBadge status={c.plan_status || c.status || 'active'} />
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {c.account_number} • {c.phone}
                    </p>
                    {c.device_model && (
                      <p className="text-xs text-gray-400 truncate">{c.device_model}</p>
                    )}
                  </div>

                  {/* Right: due date */}
                  <div className="text-right flex-shrink-0 hidden sm:block">
                    {c.next_due_date && (
                      <p className="text-xs text-gray-500">
                        {format(new Date(c.next_due_date), 'dd MMM')}
                      </p>
                    )}
                    <svg className="w-4 h-4 text-gray-300 ml-auto mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium
                           disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium
                           disabled:opacity-40 hover:bg-gray-50 transition-colors"
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
