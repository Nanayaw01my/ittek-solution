import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiTrash2, FiAlertTriangle, FiSearch } from 'react-icons/fi'
import { getDeletableTypes, getDeletableRecords, deleteRecords } from '../api/dataAdmin'
import { formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'

/**
 * One screen for clearing out records: pick a kind of record from the
 * dropdown, find the ones you want, tick them, delete.
 *
 * Nothing here deletes by filter or by "all" — only the rows actually ticked
 * are removed, and the server caps how many can go in one call. Records whose
 * removal changes what the reports say carry a warning, and confirmation means
 * typing DELETE rather than clicking through a dialog on autopilot.
 */
export default function DeleteRecords() {
  const queryClient = useQueryClient()
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState([])
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const { data: typesData, isLoading: typesLoading } = useQuery({
    queryKey: ['deletable-types'],
    queryFn: () => getDeletableTypes().then(r => r.data),
  })
  const types = typesData?.data || typesData || []
  const activeType = types.find(t => t.key === type)

  const { data, isLoading } = useQuery({
    queryKey: ['deletable-records', type, search, page],
    queryFn: () => getDeletableRecords(type, { search, page, limit: 25 }).then(r => r.data),
    enabled: !!type,
  })
  const records = data?.data || []
  const pagination = data?.pagination

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecords(type, selected),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Deleted.')
      setSelected([])
      setConfirming(false)
      setConfirmText('')
      queryClient.invalidateQueries(['deletable-records'])
      queryClient.invalidateQueries(['deletable-types'])
    },
    onError: err => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const changeType = (value) => {
    setType(value)
    setSelected([])
    setSearch('')
    setPage(1)
  }

  const toggle = (id) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const allOnPageSelected = records.length > 0 && records.every(r => selected.includes(r.id))
  const toggleAllOnPage = () =>
    setSelected(prev =>
      allOnPageSelected
        ? prev.filter(id => !records.some(r => r.id === id))
        : [...new Set([...prev, ...records.map(r => r.id)])]
    )

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Delete Records"
        subtitle="Choose what to delete, pick the records, then confirm"
      />

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">What do you want to delete?</label>
          <select
            value={type}
            onChange={e => changeType(e.target.value)}
            disabled={typesLoading}
            className="w-full sm:w-96 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Select a record type…</option>
            {types.map(t => (
              <option key={t.key} value={t.key}>
                {t.label} ({t.count})
              </option>
            ))}
          </select>
        </div>

        {activeType?.warning && (
          <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <FiAlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-xs text-amber-800">{activeType.warning}</p>
          </div>
        )}

        {type && (
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={`Search ${activeType?.label?.toLowerCase() || 'records'}…`}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        )}
      </div>

      {type && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleAllOnPage}
                disabled={records.length === 0}
                className="accent-orange-500"
              />
              Select all on this page
            </label>
            <span className="text-xs text-gray-500">
              {selected.length} selected
            </span>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Nothing found</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {records.map(r => (
                <label
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-orange-50/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => toggle(r.id)}
                    className="accent-orange-500 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-800 truncate">{r.primary || '—'}</p>
                    {r.secondary && <p className="text-xs text-gray-500 truncate">{r.secondary}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {r.detail && <p className="text-sm font-bold text-gray-700">{r.detail}</p>}
                    {r.date && <p className="text-xs text-gray-400">{formatDate(r.date)}</p>}
                  </div>
                </label>
              ))}
            </div>
          )}

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">Page {page} of {pagination.pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky bottom-4 mt-4">
          <button
            onClick={() => setConfirming(true)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm shadow-lg transition-colors"
          >
            <FiTrash2 size={16} />
            Delete {selected.length} selected {activeType?.label?.toLowerCase()}
          </button>
        </div>
      )}

      <Modal
        isOpen={confirming}
        onClose={() => { setConfirming(false); setConfirmText('') }}
        title="Confirm deletion"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700">
            You are about to {activeType?.softDelete ? 'deactivate' : 'permanently delete'}{' '}
            <span className="font-bold">{selected.length}</span>{' '}
            {activeType?.label?.toLowerCase()}.
            {!activeType?.softDelete && ' This cannot be undone.'}
          </p>
          {activeType?.warning && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {activeType.warning}
            </p>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Type DELETE to confirm
            </label>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="DELETE"
            />
          </div>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={confirmText !== 'DELETE' || deleteMutation.isPending}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete now'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
