import React, { useState } from 'react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { FiRefreshCw } from 'react-icons/fi'

/**
 * Re-read a page's data without reloading the whole app.
 *
 * Figures on screen go stale while a page sits open — someone selling at the
 * till moves stock and takings — and on a shop connection a reload is slow
 * enough that people simply don't do it.
 *
 * Pass the query keys the page owns. The icon spins while any of them is in
 * flight, so a slow connection does not look like a click that did nothing.
 */
export default function RefreshButton({ keys = [], label = 'Refresh', className = '' }) {
  const queryClient = useQueryClient()
  const [spinUntil, setSpinUntil] = useState(0)

  // Counts requests in flight for the given keys. A cached response can come
  // back instantly, which would flash the spinner for a frame and read as a
  // click that failed — hence the short floor below.
  const fetching = useIsFetching({
    predicate: (q) => keys.some((k) => q.queryKey[0] === k),
  })
  const spinning = fetching > 0 || Date.now() < spinUntil

  const refresh = () => {
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))
    setSpinUntil(Date.now() + 500)
    setTimeout(() => setSpinUntil(0), 520)
  }

  return (
    <button
      onClick={refresh}
      disabled={spinning}
      title="Refresh"
      className={`flex items-center gap-2 px-3 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 rounded-xl font-semibold text-sm transition-colors ${className}`}
    >
      <FiRefreshCw size={16} className={spinning ? 'animate-spin' : ''} />
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  )
}
