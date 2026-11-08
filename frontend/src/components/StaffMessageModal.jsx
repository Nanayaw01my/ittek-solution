import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiSend, FiUsers, FiUser, FiBriefcase } from 'react-icons/fi'
import Modal from './Modal'
import { getRecipients, sendStaffMessage } from '../api/notifications'

/**
 * An owner writing to the staff.
 *
 * The shop had no way to say anything to everybody. Notifications were
 * things the system had noticed — a discount over the limit, a debt going
 * late — and "we close at four on Friday" had to go round by phone.
 *
 * Who sees it is the part worth getting right, so it is three plain
 * choices rather than a list of tick-boxes to get wrong: everybody, a
 * whole role, or named people.
 */
export default function StaffMessageModal({ onClose }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState('everyone')
  const [roles, setRoles] = useState([])
  const [people, setPeople] = useState([])
  const [type, setType] = useState('info')

  const { data: recipientData } = useQuery({
    queryKey: ['message-recipients'],
    queryFn: () => getRecipients().then((r) => r.data),
  })
  const recipients = Array.isArray(recipientData) ? recipientData : []
  const allRoles = [...new Set(recipients.map((r) => r.role))].sort()

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])

  const mutation = useMutation({
    mutationFn: sendStaffMessage,
    onSuccess: (d) => {
      // The sentence rides inside `data`: the axios layer keeps only that
      // and drops every sibling field, `message` included.
      toast.success(d?.message || 'Sent')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not send that'),
  })

  // Said before sending, because "sent to 0 people" looks exactly like a
  // message that went out.
  const willReach = audience === 'everyone'
    ? recipients.length
    : audience === 'roles'
      ? recipients.filter((r) => roles.includes(r.role)).length
      : people.length

  return (
    <Modal isOpen onClose={onClose} title="Message the staff" size="md">
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Heading</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Heading"
            placeholder="e.g. Shop closes at 4 on Friday"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                       focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Message</label>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Message"
            placeholder="What do they need to know?"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none
                       focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">Who sees it</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'everyone', label: 'Everyone', icon: FiUsers },
              { key: 'roles', label: 'By role', icon: FiBriefcase },
              { key: 'people', label: 'Certain people', icon: FiUser },
            ].map((o) => {
              const Icon = o.icon
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setAudience(o.key)}
                  className={`py-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 ${
                    audience === o.key
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={15} /> {o.label}
                </button>
              )
            })}
          </div>

          {audience === 'roles' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {allRoles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggle(roles, setRoles, r)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                    roles.includes(r)
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {audience === 'people' && (
            <div className="mt-3 max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
              {recipients.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">Nobody else has an account yet.</p>
              ) : recipients.map((u) => (
                <label key={u._id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-orange-50">
                  <input
                    type="checkbox"
                    checked={people.includes(u._id)}
                    onChange={() => toggle(people, setPeople, u._id)}
                    className="accent-orange-500"
                  />
                  <span className="flex-1">{u.username}</span>
                  <span className="text-[11px] text-gray-400">{u.role}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">How loud</label>
          <div className="flex gap-2">
            {[
              { key: 'info', label: 'Just so they know' },
              { key: 'important', label: 'Important' },
              { key: 'critical', label: 'Urgent' },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setType(o.key)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  type === o.key
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">
          {willReach === 0
            ? 'Nobody would receive this yet.'
            : `It will appear on ${willReach} ${willReach === 1 ? 'person' : 'people'}'s screen.`}
          {' '}You are left off your own message.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || !title.trim() || !message.trim() || willReach === 0}
            onClick={() => mutation.mutate({
              title: title.trim(),
              message: message.trim(),
              audience,
              roles,
              user_ids: people,
              type,
            })}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50
                       text-white rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2"
          >
            <FiSend size={15} /> {mutation.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
