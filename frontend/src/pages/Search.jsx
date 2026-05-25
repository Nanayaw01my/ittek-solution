import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiSearch, FiPackage, FiShoppingCart, FiAlertCircle, FiDollarSign, FiClock, FiX } from 'react-icons/fi'
import { globalSearch } from '../api/settings'
import { formatCurrency, formatDate } from '../utils/helpers'

const FILTER_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'products', label: 'Products', icon: FiPackage },
  { key: 'sales', label: 'Sales', icon: FiShoppingCart },
  { key: 'debts', label: 'Debts', icon: FiAlertCircle },
  { key: 'expenses', label: 'Expenses', icon: FiDollarSign },
]

const TYPE_ICONS = {
  product: { icon: FiPackage, color: 'text-blue-600', bg: 'bg-blue-100' },
  sale: { icon: FiShoppingCart, color: 'text-green-600', bg: 'bg-green-100' },
  debt: { icon: FiAlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
  expense: { icon: FiDollarSign, color: 'text-orange-600', bg: 'bg-orange-100' },
}

const ROUTE_MAP = {
  product: '/products',
  sale: '/pos',
  debt: '/debts',
  expense: '/expenses',
}

const RECENT_KEY = 'ittek_recent_searches'

function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

function saveRecentSearch(query) {
  const prev = getRecentSearches()
  const updated = [query, ...prev.filter(q => q !== query)].slice(0, 8)
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
}

function transformSearchResults(raw, activeFilter) {
  const results = []
  const { products = [], sales = [], debts = [], expenses = [], creditAgreements = [] } = raw || {}

  if (activeFilter === 'all' || activeFilter === 'products') {
    products.forEach(p => results.push({
      type: 'product',
      title: p.name,
      subtitle: p.category_id?.name || 'Product',
      value: formatCurrency(p.selling_price || 0),
      date: p.createdAt,
    }))
  }
  if (activeFilter === 'all' || activeFilter === 'sales') {
    sales.forEach(s => results.push({
      type: 'sale',
      title: s.customer_name || 'Walk-in Customer',
      subtitle: `Invoice: ${s.invoice_no || '—'}`,
      value: formatCurrency(s.total_amount || s.cart_total || 0),
      date: s.sale_date || s.createdAt,
    }))
  }
  if (activeFilter === 'all' || activeFilter === 'debts') {
    debts.forEach(d => results.push({
      type: 'debt',
      title: d.customer_name,
      subtitle: `Debt — ${d.status || 'active'}`,
      value: formatCurrency(d.amount_owed || 0),
      date: d.due_date,
    }))
  }
  if (activeFilter === 'all' || activeFilter === 'expenses') {
    expenses.forEach(e => results.push({
      type: 'expense',
      title: e.category,
      subtitle: e.description || 'Expense',
      value: formatCurrency(e.amount || 0),
      date: e.expense_date,
    }))
  }
  return results
}

export default function Search() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [recent, setRecent] = useState(getRecentSearches())
  const inputRef = useRef(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(t)
  }, [query])

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: () => globalSearch({ query: debouncedQuery }).then(r => r.data),
    enabled: debouncedQuery.length >= 2,
  })

  const results = rawData ? transformSearchResults(rawData, activeFilter) : []

  const handleSearch = (q) => {
    setQuery(q)
    if (q.trim()) saveRecentSearch(q.trim())
  }

  const handleResultClick = (result) => {
    const route = ROUTE_MAP[result.type]
    if (route) navigate(route)
  }

  const clearRecent = () => {
    localStorage.removeItem(RECENT_KEY)
    setRecent([])
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Search input */}
      <div className="relative mb-5">
        <FiSearch size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search sales, products, debts, customers..."
          className="w-full pl-12 pr-10 py-4 text-base border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-orange-500 bg-white shadow-sm"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <FiX size={18} />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTER_TYPES.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors
              ${activeFilter === f.key
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600'
              }`}
          >
            {f.icon && <f.icon size={13} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {debouncedQuery.length >= 2 ? (
        <div>
          {isLoading ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FiSearch size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No results for "{debouncedQuery}"</p>
              <p className="text-xs mt-1">Try different keywords or filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-3">{results.length} results</p>
              {results.map((result, i) => {
                const typeConfig = TYPE_ICONS[result.type] || TYPE_ICONS.product
                const Icon = typeConfig.icon
                return (
                  <div
                    key={i}
                    onClick={() => handleResultClick(result)}
                    className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:shadow-md cursor-pointer transition-all"
                  >
                    <div className={`w-10 h-10 rounded-xl ${typeConfig.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={18} className={typeConfig.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{result.title}</p>
                      <p className="text-xs text-gray-500 truncate">{result.subtitle}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {result.value && (
                        <p className="text-sm font-bold text-orange-600">{result.value}</p>
                      )}
                      {result.date && (
                        <p className="text-xs text-gray-400">{formatDate(result.date)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Recent searches */
        recent.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                <FiClock size={14} /> Recent Searches
              </div>
              <button onClick={clearRecent} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSearch(q)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-orange-300 hover:text-orange-600 transition-colors"
                >
                  <FiClock size={12} className="text-gray-400" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
