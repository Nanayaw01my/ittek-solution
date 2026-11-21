import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  FiTarget, FiChevronLeft, FiChevronRight, FiEdit3, FiCheck, FiX,
  FiRefreshCw, FiAlertTriangle,
} from 'react-icons/fi'
import { getTargets, setTarget, syncTargets } from '../api/targets'
import PageHeader from '../components/PageHeader'

/**
 * What each side of the business is aiming for this month, and how far
 * along it is.
 *
 * Counted in jobs rather than cedis — installations, sites, call-outs.
 * Money per department is already on the owners' dashboard, worked out
 * from the till; this is the work itself, which the till cannot see.
 *
 * Two hands write it. An owner types a target here; the IT
 * department's own system pushes its figures over the API. Each row
 * says which, because a number nobody can account for is worse than no
 * number at all.
 */

const shift = (year, month, by) => {
  const d = new Date(year, month - 1 + by, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** Behind, on track, or done — decided once so the colours agree. */
const standing = (row) => {
  if (row.progress === null || row.progress === undefined) return 'unreported'
  if (row.progress >= 100) return 'met'
  if (row.progress >= 60) return 'close'
  return 'behind'
}

const BAR = {
  met: 'bg-green-600',
  close: 'bg-orange-500',
  behind: 'bg-red-500',
  unreported: 'bg-gray-300',
}

function Row({ row, onSave, saving }) {
  const [editing, setEditing] = useState(false)
  const [target, setTargetValue] = useState(row.target ?? '')
  const [achieved, setAchieved] = useState(row.achieved ?? '')
  const [unit, setUnit] = useState(row.unit || 'jobs')

  const state = standing(row)
  const pct = Math.min(100, Math.max(0, row.progress ?? 0))

  const save = () => {
    const payload = {
      department: row.department, year: row.year, month: row.month, unit,
    }
    if (String(target).trim() !== '') payload.target = Number(target)
    if (String(achieved).trim() !== '') payload.achieved = Number(achieved)
    if (payload.target === undefined && payload.achieved === undefined) {
      return toast.error('Enter a target, a number done, or both.')
    }
    onSave(payload, () => setEditing(false))
  }

  return (
    <div className="rounded-2xl border-2 border-gray-900 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-black text-base">{row.department_label}</h3>
          {row.target === null ? (
            <p className="text-sm font-semibold text-gray-500 mt-0.5">No target set</p>
          ) : (
            <p className="text-sm font-bold text-gray-700 mt-0.5">
              {row.achieved === null ? '—' : row.achieved} of {row.target} {row.unit}
              {row.progress !== null && (
                <span className="text-gray-400"> · {row.progress}%</span>
              )}
            </p>
          )}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
                  className="px-3 py-2 rounded-xl font-bold border-2 border-gray-300 text-sm
                             flex items-center gap-1.5 shrink-0">
            <FiEdit3 size={14} /> Set
          </button>
        )}
      </div>

      {row.target !== null && (
        <div className="mt-3">
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full ${BAR[state]}`} style={{ width: `${pct}%` }} />
          </div>
          {/*
            A department that has not reported is not a department at
            nothing. Saying so stops an owner chasing somebody who is
            simply quiet about their paperwork.
          */}
          {state === 'unreported' && (
            <p className="text-[12px] font-bold text-gray-500 mt-1.5">
              Nothing reported yet this month
            </p>
          )}
        </div>
      )}

      {row.achieved_source === 'api' && (
        <p className="text-[11px] font-bold text-gray-400 mt-2">
          Progress reported by {row.achieved_set_by || 'their system'}
        </p>
      )}

      {editing && (
        <div className="mt-4 pt-4 border-t-2 border-gray-200 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Target</label>
              <input type="number" min="0" value={target}
                     onChange={(e) => setTargetValue(e.target.value)}
                     className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl font-semibold
                                focus:border-orange-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Done</label>
              <input type="number" min="0" value={achieved}
                     onChange={(e) => setAchieved(e.target.value)}
                     placeholder="—"
                     className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl font-semibold
                                focus:border-orange-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Counting</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)}
                     placeholder="jobs"
                     className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl font-semibold
                                focus:border-orange-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)}
                    className="flex-1 py-2.5 rounded-xl font-bold border-2 border-gray-300
                               flex items-center justify-center gap-1.5">
              <FiX size={15} /> Cancel
            </button>
            <button onClick={save} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl font-bold bg-orange-500 text-white
                               disabled:opacity-60 flex items-center justify-center gap-1.5">
              <FiCheck size={15} /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Targets() {
  const qc = useQueryClient()
  const now = new Date()
  const [when, setWhen] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })

  const { data, isLoading } = useQuery({
    queryKey: ['targets', when.year, when.month],
    queryFn: () => getTargets(when).then((r) => r.data),
  })

  const save = useMutation({
    mutationFn: setTarget,
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Saved.')
      qc.invalidateQueries({ queryKey: ['targets'] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not save.'),
  })

  /**
   * The last word from the phone system.
   *
   * Kept on screen rather than flashed as a toast: when a sync cannot
   * read the other system's reply it hands back a sample of it, and
   * that is the one thing worth reading twice.
   */
  const [report, setReport] = useState(null)

  const sync = useMutation({
    mutationFn: syncTargets,
    onSuccess: (res) => {
      const r = res?.data || {}
      setReport(r)
      if (r.ok) {
        toast.success(r.message || 'Brought in.')
        qc.invalidateQueries({ queryKey: ['targets'] })
      } else {
        toast.error(r.message || 'Could not read the phone system.')
      }
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not reach the phone system.'),
  })

  const rows = data?.targets || []

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <PageHeader title="Targets" subtitle="What each side of the business is aiming for"
        action={(
          <button onClick={() => sync.mutate()} disabled={sync.isPending}
                  className="px-4 py-2.5 rounded-xl font-black bg-orange-500 text-white
                             flex items-center gap-2 disabled:opacity-60">
            <FiRefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''} />
            {sync.isPending ? 'Asking…' : 'Sync now'}
          </button>
        )} />

      {/*
        What the phone system said, in full. A failed sync hands back a
        sample of the reply it could not read; printing it is what turns
        "it did not work" into something anybody can act on.
      */}
      {report && !report.ok && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 mb-5">
          <p className="font-black text-amber-900 flex items-center gap-2">
            <FiAlertTriangle size={17} /> {report.reason}
          </p>
          {report.hint && <p className="text-sm font-semibold text-amber-800 mt-1">{report.hint}</p>}
          {report.sample && (
            <>
              <p className="text-[11px] font-black uppercase text-amber-700 mt-3">
                What it sent back
              </p>
              <pre className="text-[11px] bg-white border border-amber-200 rounded-lg p-2 mt-1
                              overflow-x-auto text-gray-800">{report.sample}</pre>
              <p className="text-[12px] font-semibold text-amber-800 mt-2">
                Show this to whoever set up the link and they can match the names up.
              </p>
            </>
          )}
        </div>
      )}

      {report?.ok && report.path && (
        <p className="text-[12px] font-bold text-gray-500 mb-4">
          Last brought in {report.saved} from {report.path}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 mb-5">
        <button onClick={() => setWhen((w) => shift(w.year, w.month, -1))}
                aria-label="Previous month"
                className="w-11 h-11 rounded-xl border-2 border-gray-300 grid place-items-center">
          <FiChevronLeft size={18} />
        </button>
        <p className="font-black text-base">{data?.month_label || '…'}</p>
        <button onClick={() => setWhen((w) => shift(w.year, w.month, 1))}
                aria-label="Next month"
                className="w-11 h-11 rounded-xl border-2 border-gray-300 grid place-items-center">
          <FiChevronRight size={18} />
        </button>
      </div>

      {isLoading ? (
        <p className="font-bold text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <FiTarget size={44} className="mx-auto text-gray-300" />
          <p className="font-black text-gray-700 mt-3">No departments to show.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* The editor closes when the save succeeds, not when it is
              attempted: closing on a failed save would hide the figures
              the person still has to correct. */}
          {rows.map((row) => (
            <Row key={row.department} row={row} saving={save.isPending}
                 onSave={(payload, done) => save.mutate(payload, { onSuccess: done })} />
          ))}
        </div>
      )}
    </div>
  )
}
