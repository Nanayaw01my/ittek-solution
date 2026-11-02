import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiSearch, FiX } from 'react-icons/fi'
import { getProducts } from '../api/products'

/**
 * Pick a product by typing, asking the server rather than a cached list.
 *
 * The stock request screen used a plain dropdown filled from
 * `getProducts({ limit: 200 })`. The server honours that limit and sorts by
 * name, so a shop with more than two hundred products simply could not see
 * the rest — they were not missing from the catalogue, they were past the
 * end of the page that had been fetched. The symptom is the worst kind:
 * everything looks fine, and the one item somebody wants to reorder is the
 * one that is not there.
 *
 * A bigger limit would only move the cliff. So the box asks the server for
 * what has been typed, which has no cliff, and is also the only sane way to
 * find one product among a thousand.
 */
export default function ProductPicker({ value, onChange, autoFocus = false, placeholder = 'Type to find a product' }) {
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  // Close when the click lands anywhere else, or the list hangs over the
  // row below and swallows its buttons.
  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  // Debounced, so typing a name is one request rather than one per letter.
  const [query, setQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQuery(term.trim()), 250)
    return () => clearTimeout(t)
  }, [term])

  const { data, isFetching } = useQuery({
    queryKey: ['product-search', query],
    queryFn: () => getProducts({ search: query, limit: 25 }).then((r) => r.data),
    // With no search term this is the first 25 by name, which is a useful
    // starting list rather than an empty box.
    enabled: open,
    keepPreviousData: true,
  })

  const results = Array.isArray(data?.products) ? data.products : (Array.isArray(data) ? data : [])

  if (value?._id) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl bg-gray-50">
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">{value.name}</span>
        {/* Detach: puts the line back to an empty search box, so a product
            chosen by mistake does not mean deleting the whole row and
            typing the quantity and the cost again. */}
        <button
          type="button"
          /* Not reopened on detach: the results list hangs over the row and
             covers "Type a new item", which is the button somebody wants at
             precisely the moment the search is not helping them. */
          onClick={() => { onChange(null); setTerm(''); setOpen(false) }}
          className="text-xs font-semibold text-gray-500 hover:text-red-600 shrink-0 inline-flex items-center gap-1"
          title="Detach this product from the line"
        >
          <FiX size={13} /> Detach
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-orange-500">
        <FiSearch size={14} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full text-sm focus:outline-none bg-transparent"
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
          {isFetching && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">Looking…</p>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500">
              Nothing matches “{term}”. Use <span className="font-semibold">Type a new item</span> if
              the shop has never stocked it.
            </p>
          )}
          {results.map((p) => (
            <button
              key={p._id}
              type="button"
              onClick={() => { onChange(p); setOpen(false); setTerm('') }}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-50 last:border-0"
            >
              <span className="block text-sm text-gray-800">{p.name}</span>
              <span className="block text-[11px] text-gray-400">
                {p.quantity ?? 0} in stock{p.category_id?.name ? ` · ${p.category_id.name}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
