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
  // Everything filed under a department that is not mine. Offered so a
  // head can take back stock the sorter put in the wrong place — a solar
  // panel filed under IT by a keyword is exactly the case.
  const elsewhere = data?.elsewhere || []

  if (mine.length === 0) {
    // Not an error: a head who has not been given a department yet. Saying
    // which screen fixes it is more use than an empty table.
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
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

  const match = (p) => p.name.toLowerCase().includes(search.trim().toLowerCase())
  const shown = products.filter(match)
  const claimable = (tab === 'unsorted' ? unsorted : elsewhere).filter(match)
  const lowCount = products.filter((p) => p.low).length

  return (
    // The page had no padding of its own, so on a phone every card sat
    // flush against both edges of the screen with the text touching the
    // glass. Same frame the other screens use.
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
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

      {/*
        The toolbar, rebuilt for a phone.

        It used to be one wrapping row with the search box pushed right by
        `ml-auto` and given a fixed 11rem. On a phone the three tabs took
        the first line, the box dropped to a second one still shoved
        against the right edge, and what you had typed sat in a strip
        about half the width of the screen — so searching for a product
        worked but you could barely read what you had searched for.

        Now the search is its own full-width row above the tabs, where it
        belongs: it is the control a head of department reaches for first.
        The tabs scroll sideways underneath instead of wrapping, so the
        counts stay on one line at any width.
      */}
      <div className="mb-4 space-y-2.5">
        <div className="flex items-center gap-2 px-3.5 py-3 bg-white border-2 border-gray-900 rounded-xl">
          <FiSearch size={17} className="text-gray-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a product"
            aria-label="Find a product"
            className="flex-1 min-w-0 text-base font-semibold focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="shrink-0 text-xs font-black uppercase text-gray-500 hover:text-gray-900"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {[
            { key: 'stock', label: 'My stock', count: products.length },
            { key: 'unsorted', label: 'Not sorted yet', count: unsorted.length },
            { key: 'elsewhere', label: 'Other departments', count: elsewhere.length },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-black uppercase tracking-wide border-2 ${
                tab === t.key
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white border-gray-900 text-gray-700'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
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
                    <span className="block text-[15px] font-black text-gray-900 leading-snug">{p.name}</span>
                    <span className="block text-[11px] font-semibold text-gray-500">
                      {LABELS[p.aspect] || p.aspect}
                      {p.category ? ` · ${p.category}` : ''}
                      {p.source === 'guess' ? ' · sorted by name, not confirmed' : ''}
                    </span>
                  </span>
                  <span className={`text-lg font-black tabular-nums shrink-0 ${p.low ? 'text-red-600' : 'text-gray-900'}`}>
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
            {tab === 'unsorted'
              ? 'Goods the system could not place. Claim the ones that belong to you.'
              : 'Everything filed under another department. Claim anything that is really yours — '
                + 'the move is recorded, and the other head will see it gone.'}
          </p>
          {claimable.length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-400">
              {search ? `Nothing here matches “${search}”.`
                : tab === 'unsorted' ? 'Everything is sorted.' : 'No stock in other departments.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {claimable.map((p) => (
                // Stacked on a phone: the name gets the full width instead
                // of being squeezed into whatever the claim buttons leave.
                <div key={p._id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-black text-gray-900 leading-snug">{p.name}</span>
                    <span className="block text-[11px] font-semibold text-gray-500">
                      {p.quantity} in stock
                      {p.aspect && p.aspect !== 'other' ? ` · now in ${LABELS[p.aspect] || p.aspect}` : ''}
                      {p.category ? ` · ${p.category}` : ''}
                    </span>
                  </span>
                  <span className="flex gap-1.5 shrink-0">
                    {mine.map((key) => (
                      <button
                        key={key}
                        disabled={claim.isPending}
                        onClick={() => claim.mutate({ id: p._id, aspect: key })}
                        className="px-3 py-2 rounded-lg border-2 text-[11px] font-black uppercase tracking-wide
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
