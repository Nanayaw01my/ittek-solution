import React, { useEffect, useRef, useState, useCallback } from 'react'
import { FiWifiOff, FiRefreshCw, FiList } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { getPendingQueue, removeSaleFromQueue } from '../utils/offlineQueue'
import { syncOfflineSales } from '../api/sync'
import PendingSalesModal from './PendingSalesModal'
import Modal from './Modal'

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const wasOnlineRef = useRef(isOnline)
  const queryClient = useQueryClient()
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [showPending, setShowPending] = useState(false)
  const [askSync, setAskSync] = useState(false)

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
    // Ask rather than sync behind their back. Staff want to know money made
    // offline is going in, and to choose the moment — mid-queue at the counter
    // is not it. The banner keeps the sales either way; nothing is lost by
    // answering later.
    if (isOnline && getPendingQueue().length > 0) {
      setAskSync(true)
    }
    wasOnlineRef.current = isOnline
    // Deliberately not depending on handleSync: it changes identity while
    // syncing, which would re-enter this effect mid-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

  if (isOnline && pendingCount === 0) return null

  return (
    <>
    <div className={`flex items-center justify-between px-4 py-2 text-sm font-semibold
      ${!isOnline ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <FiWifiOff size={15} className="flex-shrink-0" />
        <span className="truncate">
          {!isOnline
            ? `Offline mode${pendingCount > 0 ? ` — ${pendingCount} sale${pendingCount > 1 ? 's' : ''} queued` : ' — no internet'}`
            : `Back online — ${pendingCount} sale${pendingCount > 1 ? 's' : ''} ready to sync`}
        </span>
        {/* The count alone is not much use when someone is trying to work out
            what was sold while the line was down. */}
        {pendingCount > 0 && (
          <button
            onClick={() => setShowPending(true)}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-lg text-xs font-bold flex-shrink-0 transition-colors"
          >
            <FiList size={12} /> View
          </button>
        )}
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

    <PendingSalesModal isOpen={showPending} onClose={() => setShowPending(false)} />

    {/* Asked on coming back online, so the sales are not left sitting there
        unnoticed and are not pushed up without anyone knowing either. */}
    <Modal
      isOpen={askSync && isOnline && pendingCount > 0}
      onClose={() => setAskSync(false)}
      title="Sync the sales made offline?"
      size="sm"
    >
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-700">
          You are back online with{' '}
          <span className="font-bold text-gray-900">{pendingCount}</span> sale
          {pendingCount === 1 ? '' : 's'} made offline on this device. Send them to
          the server now?
        </p>
        <button
          onClick={() => { setAskSync(false); setShowPending(true) }}
          className="text-xs font-semibold text-orange-600 hover:text-orange-700 underline"
        >
          See what they are first
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => setAskSync(false)}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
          >
            Not now
          </button>
          <button
            onClick={() => { setAskSync(false); handleSync() }}
            disabled={syncing}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl font-bold text-sm"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          Choosing "Not now" keeps them safe on this device — the banner stays until they are sent.
        </p>
      </div>
    </Modal>
    </>
  )
}
