import React, { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const ACTION_TYPES = [
  'login', 'logout', 'lock_device', 'unlock_device',
  'register_customer', 'payment', 'add_staff', 'delete_staff',
  'add_device', 'update_settings', 'reset_password',
]

const ACTION_COLORS = {
  login: 'text-blue-600 bg-blue-50',
  logout: 'text-gray-600 bg-gray-50',
  lock_device: 'text-red-600 bg-red-50',
  unlock_device: 'text-green-600 bg-green-50',
  register_customer: 'text-purple-600 bg-purple-50',
  payment: 'text-green-600 bg-green-50',
  add_staff: 'text-blue-600 bg-blue-50',
  delete_staff: 'text-red-600 bg-red-50',
  add_device: 'text-purple-600 bg-purple-50',
  update_settings: 'text-orange-600 bg-orange-50',
  reset_password: 'text-orange-600 bg-orange-50',
}

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const PER_PAGE = 30

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page,
        limit: PER_PAGE,
        ...(actionFilter && { action: actionFilter }),
      })
      const res = await api.get(`/admin/audit-logs?${params}`)
      const d = res.data?.data || res.data
      setLogs(Array.isArray(d.logs) ? d.logs : [])
      setTotalPages(d.totalPages || Math.ceil((d.total || 0) / PER_PAGE))
    } catch {
      toast.error('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const getActionLabel = (action) => {
    return action?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 pt-4">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-0.5">System activity history</p>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
          className="w-full sm:w-64 px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600 bg-white"
        >
          <option value="">All Actions</option>
          {ACTION_TYPES.map(a => (
            <option key={a} value={a}>{getActionLabel(a)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-card">
          <svg className="w-14 h-14 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-500 font-medium">No audit logs found</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-card divide-y divide-gray-50 mb-4">
            {logs.map((log) => {
              const colorClass = ACTION_COLORS[log.action] || 'text-gray-600 bg-gray-50'
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div className={`px-2.5 py-1 rounded-xl text-xs font-bold flex-shrink-0 mt-0.5 ${colorClass}`}>
                    {getActionLabel(log.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {log.user_name || log.user?.full_name || 'System'}
                      {log.user_role && (
                        <span className="text-xs text-gray-400 font-normal ml-1.5">({log.user_role})</span>
                      )}
                    </p>
                    {log.description && (
                      <p className="text-xs text-gray-600 mt-0.5">{log.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {log.device_udid && (
                        <span className="text-xs font-mono text-gray-400 truncate max-w-[120px]">{log.device_udid}</span>
                      )}
                      {log.ip_address && (
                        <span className="text-xs text-gray-400">{log.ip_address}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0 text-right">
                    {log.created_at ? format(new Date(log.created_at), 'dd MMM\nHH:mm') : ''}
                  </p>
                </div>
              )
            })}
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
