import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiChevronDown, FiChevronUp, FiX } from 'react-icons/fi'
import { getAuditLogs } from '../api/settings'
import { formatDateTime } from '../utils/helpers'
import { format, startOfMonth } from 'date-fns'

const ACTION_COLORS = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-gray-100 text-gray-600',
  LOGOUT: 'bg-gray-100 text-gray-600',
  APPROVE: 'bg-purple-100 text-purple-700',
  REJECT: 'bg-red-100 text-red-700',
  PROCESS: 'bg-orange-100 text-orange-700',
  SYNC: 'bg-teal-100 text-teal-700',
}

const ROLE_COLORS = {
  'Super Admin': 'bg-purple-100 text-purple-700',
  'CEO': 'bg-blue-100 text-blue-700',
  'COO': 'bg-indigo-100 text-indigo-700',
  'Manager': 'bg-orange-100 text-orange-700',
  'Sales': 'bg-green-100 text-green-700',
}

function DetailsCell({ details }) {
  const [expanded, setExpanded] = useState(false)
  if (!details) return <span className="text-gray-400">—</span>
  const str = typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)
  const short = str.length > 80 ? str.slice(0, 80) + '…' : str
  return (
    <div>
      <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap">{expanded ? str : short}</pre>
      {str.length > 80 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-0.5 mt-1">
          {expanded ? <><FiChevronUp size={11} /> Less</> : <><FiChevronDown size={11} /> More</>}
        </button>
      )}
    </div>
  )
}

export default function AuditLogs() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', startDate, endDate, userFilter, actionFilter, page],
    queryFn: () => getAuditLogs({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      user_id: userFilter || undefined,
      action: actionFilter || undefined,
      page,
      limit: 25,
    }).then(r => r.data),
  })

  const logs = Array.isArray(data) ? data : (data?.logs || [])
  const pagination = data?.pagination || null

  const getActionColor = (action) => {
    const prefix = (action || '').split('_')[0].toUpperCase()
    return ACTION_COLORS[prefix] || 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-black text-gray-900">Audit Logs</h1>
        <p className="text-sm text-gray-500">System activity and security trail</p>
      </div>

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
          placeholder="Filter by username…"
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-44"
        />
        <input
          type="text"
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1) }}
          placeholder="Filter by action…"
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-44"
        />
        {(userFilter || actionFilter) && (
          <button onClick={() => { setUserFilter(''); setActionFilter(''); setPage(1) }}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl">
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
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">Timestamp</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">IP Address</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(5).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No audit logs found for the selected filters
                  </td>
                </tr>
              ) : logs.map((log, i) => (
                <tr key={log._id || i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                    {formatDateTime(log.timestamp || log.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800 text-sm">{log.user_id?.username || log.username || '—'}</p>
                    {(log.user_id?.role || log.role) && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[log.user_id?.role || log.role] || 'bg-gray-100 text-gray-600'}`}>
                        {log.user_id?.role || log.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{log.ip_address || '—'}</td>
                  <td className="px-4 py-3 max-w-xs"><DetailsCell details={log.details} /></td>
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
