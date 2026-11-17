import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FiVideo, FiPlus, FiClock, FiUsers, FiMic, FiEdit3, FiXCircle, FiCheckCircle,
} from 'react-icons/fi'
import { getMeetings, createMeeting, updateMeeting, endMeeting } from '../api/meetings'
import { getRecipients } from '../api/notifications'
import PageHeader from '../components/PageHeader'
import useAuthStore from '../store/authStore'
import { isOwner } from '../config/pageAccess'

/**
 * Staff meetings.
 *
 * A list of what is coming, and a way into the room. Calling a meeting
 * is the owners' job — the shop's decision — so everybody else sees this
 * screen without the New Meeting button, which is the whole of the
 * difference.
 */

const when = (d) => new Date(d).toLocaleString('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

/** "In 20 minutes", "Started 5 minutes ago" — the thing people actually read. */
const soon = (d) => {
  const mins = Math.round((new Date(d) - Date.now()) / 60000)
  if (mins > 90) return null
  if (mins > 1) return `in ${mins} minutes`
  if (mins >= -1) return 'now'
  if (mins > -60) return `started ${Math.abs(mins)} minutes ago`
  return null
}

function NewMeetingModal({ onClose }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [agenda, setAgenda] = useState('')
  const [at, setAt] = useState(() => {
    // Default to the next whole hour, which is what a person means by
    // "later today" far more often than this exact minute.
    const d = new Date(Date.now() + 60 * 60 * 1000)
    d.setMinutes(0, 0, 0)
    // The input wants local time, and toISOString would hand it UTC —
    // which in Ghana is the same, and in any other timezone is an hour
    // or more wrong with no visible cause.
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [audience, setAudience] = useState('everyone')
  const [roles, setRoles] = useState([])
  const [userIds, setUserIds] = useState([])

  const { data: recipientData } = useQuery({
    queryKey: ['message-recipients'],
    queryFn: () => getRecipients().then((r) => r.data),
  })
  const recipients = Array.isArray(recipientData) ? recipientData : []
  const allRoles = [...new Set(recipients.map((r) => r.role))].sort()

  const willReach = audience === 'everyone'
    ? recipients.length
    : audience === 'roles'
      ? recipients.filter((r) => roles.includes(r.role)).length
      : userIds.length

  const save = useMutation({
    mutationFn: createMeeting,
    onSuccess: (res) => {
      // The sentence rides inside `data`: the axios layer replaces the
      // response body with the envelope's data and drops every sibling.
      toast.success(res?.data?.message || 'Meeting saved.')
      qc.invalidateQueries({ queryKey: ['meetings'] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not save the meeting.'),
  })

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Give the meeting a title.')
    save.mutate({
      title, agenda, scheduled_for: new Date(at).toISOString(),
      audience, roles, user_ids: userIds,
    })
  }

  const toggle = (list, setList, v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form onSubmit={submit}
            className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="p-5 border-b-2 border-gray-900">
          <h2 className="text-lg font-black uppercase tracking-tight">Call a meeting</h2>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1">What is it about?</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
                   placeholder="Monday staff meeting"
                   className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-xl font-semibold
                              focus:border-orange-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">When</label>
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)}
                   className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-xl font-semibold
                              focus:border-orange-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">
              Agenda <span className="font-semibold text-gray-500">(optional)</span>
            </label>
            <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3}
                      placeholder="What will be discussed"
                      className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-xl font-semibold
                                 focus:border-orange-500 outline-none resize-none" />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Who should come?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'everyone', label: 'All staff' },
                { key: 'roles', label: 'By role' },
                { key: 'people', label: 'Pick people' },
              ].map((o) => (
                <button key={o.key} type="button" onClick={() => setAudience(o.key)}
                        className={`px-2 py-2.5 rounded-xl text-sm font-bold border-2 ${
                          audience === o.key
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-700 border-gray-300'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {audience === 'roles' && (
            <div className="flex flex-wrap gap-2">
              {allRoles.map((r) => (
                <button key={r} type="button" onClick={() => toggle(roles, setRoles, r)}
                        className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 ${
                          roles.includes(r)
                            ? 'bg-orange-100 text-orange-800 border-orange-400'
                            : 'bg-white text-gray-600 border-gray-300'}`}>
                  {r}
                </button>
              ))}
            </div>
          )}

          {audience === 'people' && (
            <div className="border-2 border-gray-200 rounded-xl max-h-52 overflow-y-auto divide-y">
              {recipients.length === 0 ? (
                <p className="p-3 text-sm font-semibold text-gray-500">No other staff accounts.</p>
              ) : recipients.map((u) => (
                <label key={u._id} className="flex items-center gap-3 p-3 cursor-pointer">
                  <input type="checkbox" checked={userIds.includes(u._id)}
                         onChange={() => toggle(userIds, setUserIds, u._id)}
                         className="w-4 h-4 accent-orange-500" />
                  <span className="font-bold text-sm">{u.username}</span>
                  <span className="text-xs font-semibold text-gray-500 ml-auto">{u.role}</span>
                </label>
              ))}
            </div>
          )}

          <p className="text-sm font-semibold text-gray-600">
            {willReach === 0
              ? 'Nobody will be invited yet.'
              : `${willReach} ${willReach === 1 ? 'person' : 'people'} will be told.`}
          </p>
        </div>

        <div className="p-5 border-t-2 border-gray-200 flex gap-3">
          <button type="button" onClick={onClose}
                  className="flex-1 py-3 rounded-xl font-bold border-2 border-gray-300">Cancel</button>
          <button type="submit" disabled={save.isPending}
                  className="flex-1 py-3 rounded-xl font-bold bg-orange-500 text-white disabled:opacity-60">
            {save.isPending ? 'Saving…' : 'Save meeting'}
          </button>
        </div>
      </form>
    </div>
  )
}

function NotesModal({ meeting, onClose }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState(meeting.notes || '')
  const save = useMutation({
    mutationFn: (d) => updateMeeting(meeting._id, d),
    onSuccess: () => {
      toast.success('Saved.')
      qc.invalidateQueries({ queryKey: ['meetings'] })
      onClose()
    },
    onError: () => toast.error('Could not save.'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl">
        <div className="p-5 border-b-2 border-gray-900">
          <h2 className="text-lg font-black uppercase tracking-tight">What was decided</h2>
          <p className="text-sm font-semibold text-gray-600 mt-1">{meeting.title}</p>
        </div>
        <div className="p-5">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={7}
                    placeholder="The decisions, and who is doing what."
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-xl font-semibold
                               focus:border-orange-500 outline-none resize-none" />
        </div>
        <div className="p-5 border-t-2 border-gray-200 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border-2 border-gray-300">
            Cancel
          </button>
          <button onClick={() => save.mutate({ notes })} disabled={save.isPending}
                  className="flex-1 py-3 rounded-xl font-bold bg-orange-500 text-white disabled:opacity-60">
            Save notes
          </button>
        </div>
      </div>
    </div>
  )
}

function MeetingCard({ m, canManage }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [notesFor, setNotesFor] = useState(null)

  const close = useMutation({
    mutationFn: () => endMeeting(m._id),
    onSuccess: () => {
      toast.success('Meeting ended.')
      qc.invalidateQueries({ queryKey: ['meetings'] })
    },
    onError: () => toast.error('Could not end the meeting.'),
  })

  const cancel = useMutation({
    mutationFn: () => updateMeeting(m._id, { status: 'cancelled' }),
    onSuccess: () => {
      toast.success('Meeting cancelled.')
      qc.invalidateQueries({ queryKey: ['meetings'] })
    },
    onError: () => toast.error('Could not cancel.'),
  })

  const live = m.status === 'live'
  const over = m.status === 'ended' || m.status === 'cancelled'
  const nearly = soon(m.scheduled_for)

  return (
    <div className={`rounded-2xl border-2 p-4 ${live ? 'border-orange-500 bg-orange-50' : 'border-gray-900 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-black text-base leading-tight">{m.title}</h3>
            {live && (
              <span className="px-2 py-0.5 rounded-full bg-orange-500 text-white text-[11px] font-black uppercase">
                Live now
              </span>
            )}
            {m.status === 'cancelled' && (
              <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-[11px] font-black uppercase">
                Cancelled
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-600 mt-1 flex items-center gap-1.5">
            <FiClock size={13} /> {when(m.scheduled_for)}
            {nearly && !over && <span className="text-orange-600">· {nearly}</span>}
          </p>
          {m.agenda && <p className="text-sm font-semibold text-gray-600 mt-2">{m.agenda}</p>}

          <p className="text-xs font-bold text-gray-500 mt-2 flex items-center gap-1.5">
            <FiUsers size={12} />
            {m.audience === 'everyone' ? 'All staff'
              : m.audience === 'roles' ? m.roles.join(', ')
                : 'Selected people'}
            <span className="text-gray-400">· called by {m.created_by_name}</span>
          </p>

          {m.in_room?.length > 0 && !over && (
            <p className="text-sm font-black text-orange-700 mt-2">
              In the room now: {m.in_room.join(', ')}
            </p>
          )}

          {over && m.notes && (
            <div className="mt-3 p-3 rounded-xl bg-gray-50 border-2 border-gray-200">
              <p className="text-[11px] font-black uppercase text-gray-500 mb-1">What was decided</p>
              <p className="text-sm font-semibold text-gray-800 whitespace-pre-wrap">{m.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {!over && (
          <button onClick={() => navigate(`/meetings/${m._id}/room`)}
                  className="flex-1 min-w-[140px] py-3 rounded-xl font-black bg-orange-500 text-white
                             flex items-center justify-center gap-2">
            <FiMic size={16} /> {live ? 'Join the meeting' : 'Start the meeting'}
          </button>
        )}
        {canManage && !over && (
          <>
            <button onClick={() => close.mutate()} disabled={close.isPending}
                    className="px-4 py-3 rounded-xl font-bold border-2 border-gray-300 flex items-center gap-2">
              <FiCheckCircle size={15} /> End
            </button>
            <button onClick={() => cancel.mutate()} disabled={cancel.isPending}
                    className="px-4 py-3 rounded-xl font-bold border-2 border-gray-300 text-gray-600
                               flex items-center gap-2">
              <FiXCircle size={15} /> Cancel
            </button>
          </>
        )}
        {canManage && over && m.status === 'ended' && (
          <button onClick={() => setNotesFor(m)}
                  className="px-4 py-3 rounded-xl font-bold border-2 border-gray-300 flex items-center gap-2">
            <FiEdit3 size={15} /> {m.notes ? 'Edit notes' : 'Write up what was decided'}
          </button>
        )}
      </div>

      {notesFor && <NotesModal meeting={notesFor} onClose={() => setNotesFor(null)} />}
    </div>
  )
}

export default function Meetings() {
  const { user } = useAuthStore()
  const [scope, setScope] = useState('upcoming')
  const [creating, setCreating] = useState(false)
  const canManage = isOwner(user?.role)

  const { data, isLoading } = useQuery({
    queryKey: ['meetings', scope],
    queryFn: () => getMeetings({ scope }).then((r) => r.data),
    // A meeting that somebody else has just started should appear without
    // the person having to reload the page.
    refetchInterval: 30000,
  })

  const meetings = data?.meetings || []

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Meetings"
        subtitle="Staff meetings, held inside the app"
        action={canManage && (
          <button onClick={() => setCreating(true)}
                  className="px-4 py-2.5 rounded-xl font-black bg-orange-500 text-white
                             flex items-center gap-2">
            <FiPlus size={17} /> New meeting
          </button>
        )}
      />

      <div className="flex gap-2 mb-5">
        {[{ k: 'upcoming', l: 'Coming up' }, { k: 'past', l: 'Past' }].map((t) => (
          <button key={t.k} onClick={() => setScope(t.k)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border-2 ${
                    scope === t.k
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="font-bold text-gray-500">Loading…</p>
      ) : meetings.length === 0 ? (
        <div className="text-center py-16">
          <FiVideo size={44} className="mx-auto text-gray-300" />
          <p className="font-black text-gray-700 mt-3">
            {scope === 'past' ? 'No past meetings.' : 'No meetings coming up.'}
          </p>
          {canManage && scope === 'upcoming' && (
            <p className="text-sm font-semibold text-gray-500 mt-1">
              Tap “New meeting” to call one.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => <MeetingCard key={m._id} m={m} canManage={canManage && m.mine} />)}
        </div>
      )}

      {creating && <NewMeetingModal onClose={() => setCreating(false)} />}
    </div>
  )
}
