import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiChevronDown, FiChevronUp } from 'react-icons/fi'
import { getAuditLogs } from '../api/settings'
import { formatDateTime } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import DateRangePicker from '../components/DateRangePicker'
import Table from '../components/Table'
import Badge from '../components/Badge'
import { format, startOfMonth } from 'date-fns'

const ACTION_COLORS = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  login: 'bg-gray-100 text-gray-600',
  logout: 'bg-gray-100 text-gray-600',
  approve: 'bg-purple-100 text-purple-700',
  reject: 'bg-red-100 text-red-700',
}

function DetailsCell({ details }) {
  const [expanded, setExpanded] = useState(false)
  if (!details) return <span className="text-gray-400">—</span>
  const str = typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)
  const short = str.length > 60 ? str.slice(0, 60) + '...' : str
  return (
    <div>
      <p className="text-xs text-gray-600 font-mono">{expanded ? str : short}</p>
      {str.length > 60 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-0.5 mt-1">
          {expanded ? <><FiChevronUp size={11} /> Less</> : <><FiChevronDown size={11} /> More</>}
        </button>
      )}
    </div>
  )
}

export default function AuditLogs() {
  const { user } = useAuthStore()
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', startDate, endDate, userFilter, actionFilter, search, page],
    queryFn: () => getAuditLogs({
      startDate,
      endDate,
      user: userFilter || undefined,
      action: actionFilter || undefined,
      search: search || undefined,
      page,
      limit: 20,
    }).then(r => r.data),
  })

  const logs = data?.logs || data || []

  const columns = [
    { header: 'Timestamp', key: 'createdAt', render: v => <span className="text-xs">{formatDateTime(v)}</span> },
    {
      header: 'User',
      key: 'user',
      render: (v, row) => (
        <div>
          <p className="text-sm font-semibold">{v?.username || '—'}</p>
          <Badge status={v?.role} label={v?.role?.replace('_', ' ')} size="xs" />
        </div>
      ),
    },
    {
      header: 'Action',
      key: 'action',
      render: v => {
        const type = (v || '').split('_')[0].toLowerCase()
        const color = ACTION_COLORS[type] || 'bg-gray-100 text-gray-600'
        return <span className={`text-xs font-bold px-2 py-1 rounded-lg ${color}`}>{v}</span>
      },
    },
    { header: 'Resource', key: 'resource', render: v => <span className="text-xs text-gray-600 capitalize">{v || '—'}</span> },
    { header: 'IP Address', key: 'ipAddress', render: v => <span className="text-xs font-mono text-gray-500">{v || '—'}</span> },
    { header: 'Details', key: 'details', render: v => <DetailsCell details={v} /> },
  ]

  const ACTION_TYPES = ['create', 'update', 'delete', 'login', 'logout', 'approve', 'reject']

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader title="Audit Logs" subtitle="System activity and security logs" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        <input
          type="text"
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
          placeholder="Filter by user..."
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-36"
        />
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        >
          <option value="">All Actions</option>
          {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search details..."
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 flex-1 min-w-32"
        />
      </div>

      <Table
        columns={columns}
        data={logs}
        loading={isLoading}
        emptyMessage="No audit logs found"
        pagination={data?.pagination}
        onPageChange={setPage}
      />
    </div>
  )
}
