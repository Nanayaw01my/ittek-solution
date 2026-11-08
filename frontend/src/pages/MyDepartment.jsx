import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiGrid, FiSearch, FiAlertTriangle, FiCheck } from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { getMyDepartments, claimProduct } from '../api/departments'

/**
 * A head of department's own stock.
 *
 * The shop was already sorted into solar, IT and electricals — Business
 * Lines counts the money that way — but nobody owned a side of it. This is
 * that: what my department holds, what is running out, and the goods
 * nobody has placed yet, which are mine to claim or leave.
 *
 * It shows quantities and not prices. A head's job here is stock, and the
 * shop keeps cost prices to the owners; if a head needs to see what their
 * goods sell for, that is a decision to take deliberately rather than one
 * that arrives as a side effect of a new screen.
 */

const LABELS = { solar: 'Solar', networking: 'IT', electrical: 'Electricals', other: 'Unsorted' }
const COLOURS = { solar: '#F97316', networking: '#2563eb', electrical: '#16a34a', other: '#94a3b8' }

export default function MyDepartment() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('stock')

  const { data, isLoading } = useQuery({
    queryKey: ['my-departments'],
    queryFn: () => getMyDepartments().then((r) => r.data),
  })

  const claim = useMutation({
    mutationFn: ({ id, aspect }) => claimProduct(id, aspect),
    onSuccess: (d) => {
      // The sentence rides inside `data`: the axios layer keeps only that
      // and drops every sibling field, `message` included.
      toast.success(d?.message || 'Sorted')
      queryClient.invalidateQueries({ queryKey: ['my-departments'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not sort that'),
  })

  if (isLoading) return <LoadingSpinner />

  const mine = data?.mine || []
  const departments = data?.departments || []
  const products = data?.products || []
  const unsorted = data?.unsorted || []

  if (mine.length === 0) {
    // Not an error: a head who has not been given a department yet. Saying
    // which screen fixes it is more use than an empty table.
    return (
      <div>
        <PageHeader title="My Department" subtitle="Your side of the shop" />
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <FiGrid size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-700 font-semibold">No department has been given to you yet.</p>
          <p className="text-xs text-gray-500 mt-1">
            An owner sets this on your account in User Management — solar, IT or electricals.
          </p>
        </div>
      </div>
    )
  }

  const shown = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
  const lowCount = products.filter((p) => p.low).length

  return (
    <div>
      <PageHeader
        title="My Department"
        subtitle={mine.map((k) => LABELS[k] || k).join(' · ')}
        action={<RefreshButton keys={[['my-departments']]} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {departments.map((d) => (
          <div key={d.key} className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOURS[d.key] }} />
              <p className="text-[10px] font-extrabold tracking-wider uppercase text-gray-400">{d.label}</p>
            </div>
            <p className="text-2xl font-black mt-1">{d.products}</p>
            <p className="text-[11px] text-gray-500">
              {d.pieces} in stock{d.low > 0 ? ` · ${d.low} running out` : ''}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setTab('stock')}
          className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${
            tab === 'stock' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          My stock ({products.length})
        </button>
        <button
          onClick={() => setTab('unsorted')}
          className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${
            tab === 'unsorted' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          Not sorted yet ({unsorted.length})
        </button>
        {tab === 'stock' && (
          <div className="flex items-center gap-2 ml-auto px-3 py-1.5 bg-white border border-gray-200 rounded-xl">
            <FiSearch size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a product"
              aria-label="Find a product"
              className="text-sm focus:outline-none w-44"
            />
          </div>
        )}
      </div>

      {tab === 'stock' ? (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {lowCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
              <FiAlertTriangle size={14} />
              {lowCount} product{lowCount === 1 ? ' is' : 's are'} at or below their reorder level.
            </div>
          )}
          {shown.length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-400">
              {search ? `Nothing in your department matches “${search}”.` : 'Nothing in your department yet.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {shown.map((p) => (
                <div key={p._id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOURS[p.aspect] }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{p.name}</span>
                    <span className="block text-[11px] text-gray-400">
                      {LABELS[p.aspect] || p.aspect}
                      {p.category ? ` · ${p.category}` : ''}
                      {p.source === 'guess' ? ' · sorted by name, not confirmed' : ''}
                    </span>
                  </span>
                  <span className={`text-sm font-bold ${p.low ? 'text-red-600' : 'text-gray-800'}`}>
                    {p.quantity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <p className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs text-gray-600">
            Goods the system could not place. Claim the ones that belong to you — anything already in
            another department is not offered here.
          </p>
          {unsorted.length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-400">Everything is sorted.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {unsorted.map((p) => (
                <div key={p._id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{p.name}</span>
                    <span className="block text-[11px] text-gray-400">
                      {p.quantity} in stock{p.category ? ` · ${p.category}` : ''}
                    </span>
                  </span>
                  <span className="flex gap-1.5 shrink-0">
                    {mine.map((key) => (
                      <button
                        key={key}
                        disabled={claim.isPending}
                        onClick={() => claim.mutate({ id: p._id, aspect: key })}
                        className="px-2.5 py-1.5 rounded-lg border text-[11px] font-bold
                                   hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
                        style={{ borderColor: COLOURS[key], color: COLOURS[key] }}
                      >
                        <FiCheck size={11} /> {LABELS[key] || key}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
