import React, { useEffect, useRef, useState, useCallback } from 'react'
import { FiWifiOff, FiRefreshCw } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { getPendingQueue, removeSaleFromQueue } from '../utils/offlineQueue'
import { syncOfflineSales } from '../api/sync'

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const wasOnlineRef = useRef(isOnline)
  const queryClient = useQueryClient()
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const refreshCount = () => setPendingCount(getPendingQueue().length)

  useEffect(() => {
    refreshCount()
    const t = setInterval(refreshCount, 3000)
    return () => clearInterval(t)
  }, [])

  const handleSync = useCallback(async () => {
    const queue = getPendingQueue()
    if (!queue.length || syncing) return
    setSyncing(true)
    let ok = 0
    let fail = 0
    let lastReason = ''

    for (const entry of queue) {
      try {
        const res = await syncOfflineSales([{ type: entry.type, payload: entry.payload }])

        // The request succeeding is NOT the sale succeeding. The server answers
        // 200 whether it wrote the sale or rejected it, with the real outcome in
        // the per-sale status. This used to treat any 200 as done and delete the
        // sale from the queue — so a rejected sale was erased from the only
        // place it existed, and reported as synced.
        const payload = res?.data
        const results = payload?.results || (Array.isArray(payload) ? payload : [])
        const outcome = results[0]

        if (outcome && outcome.status !== 'synced') {
          fail++
          lastReason = outcome.reason || ''
          continue          // stays queued for the next attempt
        }

        removeSaleFromQueue(entry.id)
        ok++
      } catch (err) {
        // Network or server error — also keeps the sale queued.
        fail++
        lastReason = err?.response?.data?.message || err?.message || ''
      }
    }

    setSyncing(false)
    refreshCount()
    if (ok > 0) {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['recent-sales'] })
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      queryClient.invalidateQueries({ queryKey: ['sales-history'] })
      toast.success(`Synced ${ok} sale${ok > 1 ? 's' : ''} to server`)
    }
    if (fail > 0) {
      toast.error(
        `${fail} sale${fail > 1 ? 's' : ''} could not sync${lastReason ? ` — ${lastReason}` : ''}. `
        + 'Still saved on this device.',
        { duration: 8000 }
      )
    }
  }, [syncing, queryClient])

  // Sync on coming back online, and on opening the app with a queue already
  // waiting. The transition check alone missed the common case: the till is
  // closed while offline and opened later when the connection is back, so no
  // offline→online change is ever observed and the sales sat there.
  useEffect(() => {
    if (isOnline && (!wasOnlineRef.current || getPendingQueue().length > 0)) {
      handleSync()
    }
    wasOnlineRef.current = isOnline
    // Deliberately not depending on handleSync: it changes identity while
    // syncing, which would re-enter this effect mid-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

  if (isOnline && pendingCount === 0) return null

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-sm font-semibold
      ${!isOnline ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
      <div className="flex items-center gap-2">
        <FiWifiOff size={15} />
        <span>
          {!isOnline
            ? `Offline mode${pendingCount > 0 ? ` — ${pendingCount} sale${pendingCount > 1 ? 's' : ''} queued` : ' — no internet'}`
            : `Back online — ${pendingCount} sale${pendingCount > 1 ? 's' : ''} ready to sync`}
        </span>
      </div>
      {isOnline && pendingCount > 0 && (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 bg-white text-amber-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-amber-50 transition-colors disabled:opacity-60"
        >
          <FiRefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      )}
    </div>
  )
}
