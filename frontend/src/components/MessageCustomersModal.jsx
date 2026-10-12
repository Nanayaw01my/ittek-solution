import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiSearch, FiSend, FiDownloadCloud, FiAlertTriangle } from 'react-icons/fi'
import { getContacts, backfillContacts } from '../api/contacts'
import { sendReminderSms } from '../api/reminders'
import { formatCurrency } from '../utils/helpers'
import { displayGhanaPhone } from '../utils/phone'
import Modal from './Modal'

/**
 * One message, written once, sent to many customers.
 *
 * Used from both the Contact Book and Reminders. It was written inside
 * Reminders first; a second copy on the Contact Book would be two wordings,
 * two opt-out rules and two batching bugs to keep in step.
 *
 * Two things this has to get right, because getting them wrong costs the
 * shop money and goodwill:
 *
 *  - "Everyone" must mean everyone. The list endpoint pages, so a book of
 *    four hundred would quietly have sent to the first two hundred.
 *  - The gateway takes a hundred at a time, so a larger run goes in batches
 *    and the results are added up.
 */

/** Arkesel counts 160 characters as one credit, 153 per part once it splits. */
const creditsFor = (text) => {
  const n = (text || '').length
  if (n === 0) return 0
  return n <= 160 ? 1 : Math.ceil(n / 153)
}

const BATCH = 100
const PAGE = 200
/** A guard against a runaway loop, not a limit anybody should ever meet. */
const MOST = 5000

export default function MessageCustomersModal({ onClose, onSent, title = 'Message your customers' }) {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('last_seen')
  const [everyone, setEveryone] = useState(true)
  const [picked, setPicked] = useState({})
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', q, sort, 'messageable'],
    queryFn: () => getContacts({ q: q || undefined, sort, contactable: 1, limit: PAGE })
      .then((r) => r.data),
  })
  const contacts = Array.isArray(data?.contacts) ? data.contacts : []
  const total = data?.pagination?.total ?? contacts.length
  // More in the book than this page shows, so "everyone" cannot be read off
  // the rows on screen.
  const moreThanShown = total > contacts.length

  const ticked = contacts.filter((c) => picked[c._id])
  const count = everyone ? total : ticked.length
  const credits = creditsFor(text) * count

  const fill = useMutation({
    mutationFn: backfillContacts,
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Done.', { duration: 7000 })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not do it'),
  })

  /** Everybody who should get this, not merely everybody on screen. */
  const gatherRecipients = async () => {
    if (!everyone) return ticked
    const all = []
    for (let page = 1; all.length < MOST; page += 1) {
      const res = await getContacts({
        q: q || undefined, sort, contactable: 1, page, limit: PAGE,
      })
      const rows = res.data?.contacts || []
      all.push(...rows)
      const pages = res.data?.pagination?.pages ?? 1
      if (page >= pages || rows.length === 0) break
    }
    return all
  }

  const send = async () => {
    const body = text.trim()
    setSending(true)
    setConfirming(false)
    try {
      const people = await gatherRecipients()
      if (people.length === 0) {
        toast.error('There is nobody to send to.')
        return
      }

      let sent = 0
      let failed = 0
      const problems = []

      for (let i = 0; i < people.length; i += BATCH) {
        const slice = people.slice(i, i + BATCH)
        setProgress({ done: i, total: people.length })
        const res = await sendReminderSms({
          messages: slice.map((c) => ({
            customer_name: c.name || 'Customer',
            customer_phone: c.phone,
            about: body.slice(0, 60),
            kind: 'goodwill',
            purpose: 'wish',
            // Greeted by name where the shop knows it, so forty people do not
            // all get the same anonymous block of text.
            message: c.name ? `Good day ${c.name.split(' ')[0]},\n\n${body}` : body,
          })),
        })
        sent += res.data?.sent || 0
        failed += res.data?.failed || 0
        problems.push(...(res.data?.results || []).filter((x) => !x.ok))
      }

      setProgress(null)
      if (sent > 0) toast.success(`Sent to ${sent}${failed ? `, ${failed} did not go` : ''}.`)
      else toast.error('None of them went.')
      problems.slice(0, 4).forEach((x) => {
        toast.error(`${x.customer_name}: ${x.message}`, { duration: 7000 })
      })
      onSent?.()
      if (sent > 0) onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send.', { duration: 8000 })
    } finally {
      setSending(false)
      setProgress(null)
    }
  }

  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">The message *</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. Wishing you and your family a merry Christmas from all of us at DAN & DOR SOLAR."
            className={`${field} resize-none`}
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Each person is greeted by name where we know it.
            {text.length > 0 && ` · ${text.length} characters, ${creditsFor(text)} credit${creditsFor(text) === 1 ? '' : 's'} each`}
          </p>
        </div>

        {/* Who it goes to. Everyone is the common case and so the default,
            but it is stated rather than assumed. */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEveryone(true)}
            className={`px-3 py-2 rounded-xl text-sm font-bold border ${everyone
              ? 'bg-orange-500 border-orange-500 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            Everyone in the book ({total})
          </button>
          <button
            onClick={() => setEveryone(false)}
            className={`px-3 py-2 rounded-xl text-sm font-bold border ${!everyone
              ? 'bg-orange-500 border-orange-500 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            Only the ones I tick
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a name or number"
              className={`${field} pl-9`}
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
          >
            <option value="last_seen">Seen most recently</option>
            <option value="visits">Most visits</option>
            <option value="spent">Biggest spenders</option>
            <option value="name">By name</option>
          </select>
        </div>

        {everyone && q && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Searching narrows who “everyone” means. This will go to the {total} customer
            {total === 1 ? '' : 's'} matching “{q}”.
          </p>
        )}
        {everyone && !q && moreThanShown && (
          <p className="text-[11px] text-gray-500">
            Showing the first {contacts.length}. All {total} will be sent to.
          </p>
        )}

        {!everyone && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              <span className="font-bold text-gray-800">{ticked.length}</span> of {contacts.length} ticked
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPicked(Object.fromEntries(contacts.map((c) => [c._id, true])))}
                className="text-xs font-bold text-orange-600 hover:underline"
              >
                Tick all shown
              </button>
              <button onClick={() => setPicked({})} className="text-xs font-bold text-gray-500 hover:underline">
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {isLoading && <p className="px-3 py-3 text-xs text-gray-400">Loading…</p>}
          {!isLoading && contacts.length === 0 && (
            <div className="px-3 py-5 text-center space-y-2">
              <p className="text-xs text-gray-500">{q ? 'Nobody matches that.' : 'The book is empty.'}</p>
              {!q && (
                <>
                  <p className="text-[11px] text-gray-400">
                    Numbers typed at the till are saved from now on. Past sales can be gathered in too.
                  </p>
                  <button
                    onClick={() => fill.mutate()}
                    disabled={fill.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <FiDownloadCloud size={12} />
                    {fill.isPending ? 'Gathering…' : 'Gather past customers'}
                  </button>
                </>
              )}
            </div>
          )}
          {contacts.map((c) => (
            <label
              key={c._id}
              className={`flex items-center gap-3 px-3 py-2 ${everyone ? '' : 'hover:bg-orange-50 cursor-pointer'}`}
            >
              {!everyone && (
                <input
                  type="checkbox"
                  checked={!!picked[c._id]}
                  onChange={(e) => setPicked((p) => ({ ...p, [c._id]: e.target.checked }))}
                  className="w-4 h-4 accent-orange-500 flex-shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate">{c.name || 'No name'}</p>
                <p className="text-[11px] text-gray-500 font-mono">{displayGhanaPhone(c.phone)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] text-gray-500">{c.visits} visit{c.visits === 1 ? '' : 's'}</p>
                <p className="text-[11px] font-bold text-gray-700">{formatCurrency(c.total_spent || 0)}</p>
              </div>
            </label>
          ))}
        </div>

        {progress && (
          <p className="text-xs font-semibold text-orange-700">
            Sending… {progress.done} of {progress.total} done
          </p>
        )}

        {/* A send cannot be taken back and costs real credits, so the number
            is put in front of the person before it goes. */}
        {confirming ? (
          <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <FiAlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
              <p className="text-sm text-amber-900">
                This sends <span className="font-black">{count}</span> message{count === 1 ? '' : 's'},
                using about <span className="font-black">{credits}</span> credit{credits === 1 ? '' : 's'}.
                It cannot be taken back.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 border border-gray-200 bg-white rounded-xl font-semibold text-sm"
              >
                Go back
              </button>
              <button
                onClick={send}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm inline-flex items-center justify-center gap-1.5"
              >
                <FiSend size={14} /> Yes, send them
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!text.trim()) { toast.error('Write the message first.'); return }
                if (count === 0) { toast.error('There is nobody to send to.'); return }
                setConfirming(true)
              }}
              disabled={sending}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              <FiSend size={14} />
              {sending ? 'Sending…' : `Send to ${count}`}
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-400">
          Anyone who asked not to be messaged is left out entirely.
        </p>
      </div>
    </Modal>
  )
}
