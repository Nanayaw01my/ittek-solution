import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, isToday, isTomorrow } from 'date-fns'
import {
  FiTool, FiPlus, FiMapPin, FiUser, FiPhone, FiCheck, FiPlay, FiX, FiTrash2,
  FiAlertTriangle, FiCalendar,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import ConfirmDialog from '../components/ConfirmDialog'
import useAuthStore from '../store/authStore'
import { getRoleLevel } from '../utils/helpers'
import { getUsers } from '../api/users'
import {
  getInstallations, createInstallation, updateInstallation, deleteInstallation,
} from '../api/installations'

const STATUS_LABELS = {
  scheduled: 'Booked',
  in_progress: 'On site',
  done: 'Finished',
  cancelled: 'Cancelled',
}

const STATUS_STYLES = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-600',
}

/** "Today", "Tomorrow", or the date — which is what anybody actually asks. */
const dayWords = (d) => {
  const date = new Date(d)
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  return format(date, 'EEE d MMM')
}

function NewJobModal({ onClose, fitters }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', location: '', work: '',
    scheduled_for: format(new Date(), 'yyyy-MM-dd'), slot: '', notes: '',
  })
  const [team, setTeam] = useState([])
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: () => createInstallation({ ...form, assigned_to: team }),
    onSuccess: (res) => {
      toast.success(`${res.data?.reference || 'Job'} booked.`)
      queryClient.invalidateQueries({ queryKey: ['installations'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not book it'),
  })

  const ready = form.customer_name.trim() && form.location.trim()
    && form.work.trim() && form.scheduled_for
  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <Modal isOpen onClose={onClose} title="Book a job" size="md">
      <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Customer *</label>
            <input value={form.customer_name} onChange={set('customer_name')}
              autoFocus placeholder="Name" className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
            <input value={form.customer_phone} onChange={set('customer_phone')}
              placeholder="0244…" className={field} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Where *</label>
          <input value={form.location} onChange={set('location')}
            placeholder="e.g. Bogoso, behind the Shell station" className={field} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">What is being done *</label>
          <textarea value={form.work} onChange={set('work')} rows={2}
            placeholder="e.g. Fit 4 x 300W panels and a 3kVA inverter"
            className={`${field} resize-none`} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Day *</label>
            <input type="date" value={form.scheduled_for} onChange={set('scheduled_for')} className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">When</label>
            <select value={form.slot} onChange={set('slot')} className={field}>
              <option value="">any time</option>
              <option value="morning">morning</option>
              <option value="afternoon">afternoon</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Who is going <span className="font-normal text-gray-400">— they are told</span>
          </label>
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
            {fitters.length === 0 && (
              <p className="px-3 py-2.5 text-xs text-gray-400">No staff to assign.</p>
            )}
            {fitters.map((u) => (
              <label key={u._id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-orange-50 cursor-pointer">
                <input type="checkbox" checked={team.includes(u._id)}
                  onChange={(e) => setTeam((p) => (e.target.checked
                    ? [...p, u._id]
                    : p.filter((x) => x !== u._id)))}
                  className="w-4 h-4 accent-orange-500" />
                <span className="text-sm text-gray-700">{u.username}</span>
                <span className="text-[11px] text-gray-400 ml-auto">{u.role}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2}
            placeholder="Anything the team needs to know — a gate code, a contact on site"
            className={`${field} resize-none`} />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => save.mutate()} disabled={!ready || save.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {save.isPending ? 'Booking…' : 'Book it'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Installations() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const canBook = getRoleLevel(user?.role) >= 2
  const canDelete = getRoleLevel(user?.role) >= 3

  const [status, setStatus] = useState('open')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['installations', status],
    queryFn: () => getInstallations({ status }).then((r) => r.data),
  })

  // Only for the assign list, and only for somebody allowed to book.
  const { data: staff } = useQuery({
    queryKey: ['users', 'fitters'],
    queryFn: () => getUsers().then((r) => r.data),
    enabled: canBook,
  })
  const fitters = (Array.isArray(staff) ? staff : staff?.users || [])
    .filter((u) => u.is_active !== false)

  const jobs = data?.installations || []
  const summary = data?.summary || {}

  const move = useMutation({
    mutationFn: ({ id, ...rest }) => updateInstallation(id, rest),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installations'] }),
    onError: (err) => toast.error(err.response?.data?.message || 'Could not update it'),
  })

  const remove = useMutation({
    mutationFn: (id) => deleteInstallation(id),
    onSuccess: () => {
      toast.success('Removed.')
      queryClient.invalidateQueries({ queryKey: ['installations'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not remove it'),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Installations"
        subtitle="Who is fitting what, where, and when"
        action={
          <div className="flex items-center gap-2">
            <RefreshButton keys={['installations']} />
            {canBook && (
              <button onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm">
                <FiPlus /> Book a job
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Today</p>
          <p className="text-xl font-black text-gray-900">{summary.today || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Coming up</p>
          <p className="text-xl font-black text-blue-600">{summary.upcoming || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Past their day</p>
          <p className="text-xl font-black text-red-600">{summary.overdue || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">Nobody assigned</p>
          <p className="text-xl font-black text-amber-600">{summary.unassigned || 0}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit max-w-full overflow-x-auto">
        {[
          { key: 'open', label: 'Still to do' },
          { key: 'done', label: 'Finished' },
          { key: 'cancelled', label: 'Cancelled' },
          { key: 'all', label: 'All' },
        ].map((t) => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-colors
              ${status === t.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : jobs.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiTool className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">
            {status === 'open' ? 'Nothing booked. Quiet week.' : 'Nothing here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => (
            <div key={j._id}
              className={`bg-white border rounded-2xl p-4 ${j.overdue ? 'border-red-200' : 'border-gray-100'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900">{j.customer_name}</p>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${STATUS_STYLES[j.status]}`}>
                      {STATUS_LABELS[j.status]}
                    </span>
                    {j.overdue && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <FiAlertTriangle size={11} /> past its day
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{j.reference}</p>

                  <p className="text-sm text-gray-700 mt-1.5">{j.work}</p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <FiCalendar size={12} className="text-gray-400" />
                      {dayWords(j.scheduled_for)}{j.slot ? `, ${j.slot}` : ''}
                    </span>
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <FiMapPin size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">{j.location}</span>
                    </span>
                    {j.customer_phone && (
                      <a href={`tel:${j.customer_phone}`} className="inline-flex items-center gap-1 text-orange-600 font-semibold">
                        <FiPhone size={12} /> {j.customer_phone}
                      </a>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
                    <FiUser size={12} className="text-gray-400" />
                    {(j.assigned_to || []).length
                      ? j.assigned_to.map((u) => u.username).join(', ')
                      : <span className="text-amber-700 font-semibold">nobody assigned yet</span>}
                  </p>

                  {j.notes && <p className="text-xs text-gray-500 mt-1 italic">{j.notes}</p>}
                  {j.outcome && <p className="text-xs text-gray-600 mt-1">Outcome: {j.outcome}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                  {j.status === 'scheduled' && (
                    <button onClick={() => move.mutate({ id: j._id, status: 'in_progress' })}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600">
                      <FiPlay size={12} /> Start
                    </button>
                  )}
                  {['scheduled', 'in_progress'].includes(j.status) && (
                    <button onClick={() => move.mutate({ id: j._id, status: 'done' })}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700">
                      <FiCheck size={12} /> Done
                    </button>
                  )}
                  {canBook && ['scheduled', 'in_progress'].includes(j.status) && (
                    <button onClick={() => move.mutate({ id: j._id, status: 'cancelled' })}
                      title="Cancel this job"
                      className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                      <FiX size={14} />
                    </button>
                  )}
                  {j.status === 'done' && canBook && (
                    <button onClick={() => move.mutate({ id: j._id, status: 'scheduled' })}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                      Reopen
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => setDeleting(j)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                      <FiTrash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <NewJobModal onClose={() => setAdding(false)} fitters={fitters} />}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting._id)}
        title="Remove this job"
        message={`${deleting?.reference} — ${deleting?.customer_name} at ${deleting?.location}. This cannot be undone.`}
        confirmText="Remove"
        loading={remove.isPending}
      />
    </div>
  )
}
