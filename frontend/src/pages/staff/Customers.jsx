import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import { format } from 'date-fns'

export default function StaffCustomers() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const PER_PAGE = 20

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: PER_PAGE, ...(search && { search }) })
      const res = await api.get(`/staff/customers?${params}`)
      const data = res.data
      setCustomers(data.customers || data.data?.customers || data.data || [])
      setTotalPages(data.totalPages || Math.ceil((data.total || data.data?.total || 0) / PER_PAGE))
      setTotal(data.total || data.data?.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(), 300)
    return () => clearTimeout(timer)
  }, [fetchCustomers])

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24 pt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">My Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} customers registered by you</p>
        </div>
        <button
          onClick={() => navigate('/staff/customers/add')}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-green-800 text-white font-semibold text-sm rounded-2xl
                     hover:bg-green-900 active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by name or account number..."
          className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-2xl text-sm
                     focus:outline-none focus:border-green-600 bg-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-card">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500 font-medium">
            {search ? 'No customers match your search.' : 'No customers yet.'}
          </p>
          {!search && (
            <button
              onClick={() => navigate('/staff/customers/add')}
              className="mt-3 px-5 py-2.5 bg-green-800 text-white font-semibold text-sm rounded-xl"
            >
              Register First Customer
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-card divide-y divide-gray-50 mb-4">
            {customers.map((c) => (
              <div
                key={c.id || c._id}
                onClick={() => navigate(`/staff/customers/${c.id || c._id}`)}
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <span className="text-green-800 font-bold text-sm">
                      {(c.full_name || c.name || 'C').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.full_name || c.name}</p>
                    <StatusBadge status={c.plan_status || c.status || 'active'} />
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {c.account_number || c.user_id?.account_number} • {c.phone}
                  </p>
                  {(c.device_model || c.device) && (
                    <p className="text-xs text-gray-400">{c.device_model || c.device}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {c.next_due_date && (
                    <p className="text-xs text-gray-500 mb-1">
                      Due: {format(new Date(c.next_due_date), 'dd MMM')}
                    </p>
                  )}
                  <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
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
