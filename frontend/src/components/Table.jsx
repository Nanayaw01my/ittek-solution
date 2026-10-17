import React, { useState } from 'react'
import { FiSearch, FiChevronLeft, FiChevronRight } from 'react-icons/fi'

export default function Table({
  columns,
  data: rows = [],
  loading = false,
  emptyMessage = 'No data found',
  searchable = false,
  searchPlaceholder = 'Search...',
  onSearch,
  searchValue,
  pagination,
  onPageChange,
  rowKey = 'id',
  onRowClick,
  striped = true,
}) {
  /**
   * Anything that is not a list is treated as an empty one.
   *
   * This is shared by most screens in the system, and it used to call .map
   * on whatever it was handed. One page passing an object — an endpoint that
   * changed shape, a server older than the app answering a path it does not
   * know — took down the whole application with "p.map is not a function"
   * and a Reload button that reloaded straight back into the same crash.
   *
   * A table that cannot read its rows should show no rows. It should not be
   * able to stop somebody selling.
   */
  const data = Array.isArray(rows) ? rows : []
  if (!Array.isArray(rows) && rows != null && import.meta.env.DEV) {
    console.warn('Table was given something that is not a list:', rows)
  }

  const [localSearch, setLocalSearch] = useState('')

  const handleSearch = (v) => {
    setLocalSearch(v)
    if (onSearch) onSearch(v)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {searchable && (
          <div className="p-4 border-b border-gray-100">
            <div className="h-9 bg-gray-100 rounded-lg animate-pulse w-64" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {columns.map((col, i) => (
                  <th key={i} className="px-4 py-3 text-left">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array(5).fill(0).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {columns.map((col, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-xs">
            <FiSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue !== undefined ? searchValue : localSearch}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap ${col.className || ''}`}
                  style={col.width ? { width: col.width } : {}}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <FiSearch size={20} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-medium">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr
                  key={row[rowKey] || rowIdx}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`border-b border-gray-100 last:border-0 transition-colors
                    ${striped && rowIdx % 2 === 1 ? 'bg-gray-50/50' : ''}
                    ${onRowClick ? 'cursor-pointer hover:bg-orange-50' : 'hover:bg-gray-50/70'}
                  `}
                >
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={`px-4 py-3 ${col.cellClassName || ''}`}>
                      {col.render
                        ? col.render(row[col.key], row, rowIdx)
                        : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
            {pagination.total && ` · ${pagination.total} total`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FiChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
              const page = i + 1
              return (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                    ${pagination.page === page
                      ? 'bg-orange-500 text-white'
                      : 'border border-gray-200 text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                    }`}
                >
                  {page}
                </button>
              )
            })}
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FiChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
