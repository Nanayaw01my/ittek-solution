import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  FiAlertTriangle, FiClock, FiPackage, FiMoon, FiChevronRight, FiCheckCircle,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import { getDirectorOverview } from '../api/director'

/**
 * The owners' one screen.
 *
 * Nothing here is new information. It is all somewhere else in ITTEK — the
 * takings in Reports, the debts in Debts, the approvals in four separate
 * queues — and that is exactly the problem it solves: an owner should not
 * have to visit nine screens to learn whether anything needs them this
 * morning, because in practice nobody does, and the approvals sit.
 */

const ICONS = {
  discount: FiAlertTriangle,
  debt: FiClock,
  stock: FiPackage,
  hours: FiMoon,
}

const LINE_COLOURS = {
  solar: '#F97316',
  networking: '#2563eb',
  electrical: '#16a34a',
  other: '#94a3b8',
}

const LINE_LABELS = {
  solar: 'Solar',
  networking: 'IT',
  electrical: 'Electricals',
  other: 'Other',
}

function Tile({ label, value, sub, tone = 'slate' }) {
  const tones = {
    green: 'text-green-700',
    orange: 'text-orange-600',
    red: 'text-red-700',
    slate: 'text-gray-900',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-[10px] font-extrabold tracking-wider uppercase text-gray-400">{label}</p>
      <p className={`text-xl sm:text-2xl font-black mt-1 ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function DirectorPortal() {
  const { user } = useAuthStore()
  const { data, isLoading } = useQuery({
    queryKey: ['director-overview'],
    queryFn: () => getDirectorOverview().then((r) => r.data),
    // An owner leaves this open on a desk; stale figures on a screen whose
    // whole job is "what is happening now" would be worse than none.
    refetchInterval: 120000,
  })

  if (isLoading) return <LoadingSpinner />

  const d = data || {}
  const needs = d.needs_you || []
  const looks = d.worth_a_look || []
  const lines = d.lines || []
  const staff = d.staff || []
  const days = d.days || []
  const peak = Math.max(1, ...days.map((x) => x.total))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user?.username || ''}`}
        subtitle={new Date().toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long',
        })}
        action={<RefreshButton keys={[['director-overview']]} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Tile
          label="Took today" tone="green"
          value={formatCurrency(d.today?.takings)}
          sub={`${d.today?.sales || 0} sale${d.today?.sales === 1 ? '' : 's'}`}
        />
        <Tile
          label="This month"
          value={formatCurrency(d.month?.takings)}
          sub={`profit ${formatCurrency(d.month?.profit)}`}
        />
        <Tile
          label="Owed to us" tone="orange"
          value={formatCurrency(d.owed_to_us?.amount)}
          sub={`${d.owed_to_us?.customers || 0} customers · ${d.owed_to_us?.overdue || 0} overdue`}
        />
        <Tile
          label="We owe" tone="red"
          value={formatCurrency(d.we_owe?.amount)}
          sub={`${d.we_owe?.suppliers || 0} supplier${d.we_owe?.suppliers === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Needs you ─────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="text-[11px] font-extrabold tracking-wider uppercase text-gray-500 flex items-center gap-2">
            Needs you
            <span className={`px-2 rounded-full text-[11px] font-extrabold ${
              needs.length ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {needs.reduce((s, i) => s + (i.count || 1), 0)}
            </span>
          </h3>

          {needs.length === 0 ? (
            // An empty queue is the useful answer, so it is said plainly
            // rather than left as a blank panel somebody has to interpret.
            <div className="py-8 text-center">
              <FiCheckCircle size={26} className="mx-auto text-green-500 mb-2" />
              <p className="text-sm text-gray-600 font-semibold">Nothing is waiting on you.</p>
              <p className="text-xs text-gray-400 mt-0.5">Every approval is cleared.</p>
            </div>
          ) : (
            <div className="mt-1">
              {needs.map((item) => (
                <Link
                  key={item.key}
                  to={item.link}
                  className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 group"
                >
                  <span className="w-[7px] h-[7px] rounded-full bg-orange-500 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-900">{item.label}</span>
                    {item.detail && (
                      <span className="block text-[11.5px] text-gray-400 truncate">{item.detail}</span>
                    )}
                  </span>
                  <FiChevronRight className="text-gray-300 group-hover:text-orange-500 shrink-0" size={16} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Worth a look ──────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="text-[11px] font-extrabold tracking-wider uppercase text-gray-500 flex items-center gap-2">
            Worth a look
            <span className={`px-2 rounded-full text-[11px] font-extrabold ${
              looks.length ? 'bg-amber-400 text-amber-900' : 'bg-gray-200 text-gray-600'
            }`}>
              {looks.length}
            </span>
          </h3>

          {looks.length === 0 ? (
            <div className="py-8 text-center">
              <FiCheckCircle size={26} className="mx-auto text-green-500 mb-2" />
              <p className="text-sm text-gray-600 font-semibold">Nothing out of the ordinary.</p>
              <p className="text-xs text-gray-400 mt-0.5">
                No discount over your limit, no debt past 60 days.
              </p>
            </div>
          ) : (
            <div className="mt-1">
              {looks.map((note) => {
                const Icon = ICONS[note.icon] || FiAlertTriangle
                return (
                  <Link
                    key={note.key}
                    to={note.link}
                    className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0 group"
                  >
                    <Icon size={15} className="text-amber-500 mt-0.5 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-900">{note.label}</span>
                      <span className="block text-[11.5px] text-gray-400">{note.detail}</span>
                    </span>
                    <FiChevronRight className="text-gray-300 group-hover:text-orange-500 shrink-0 mt-0.5" size={16} />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {/* ── Where it came from ────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="text-[11px] font-extrabold tracking-wider uppercase text-gray-500">
            Where the money came from
            <span className="ml-2 font-semibold normal-case tracking-normal text-gray-400">· this month</span>
          </h3>

          {lines.length === 0 ? (
            <p className="py-6 text-sm text-gray-400 text-center">No sales this month yet.</p>
          ) : (
            <div className="mt-3">
              {lines.map((l) => (
                <div key={l.aspect} className="flex items-center gap-3 mb-2.5 text-sm">
                  <span className="w-20 text-gray-600 shrink-0">{LINE_LABELS[l.aspect] || l.aspect}</span>
                  <span className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    {/* block, not the default inline: an inline span ignores
                        width and the bar renders as an empty grey track. */}
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${l.share}%`, background: LINE_COLOURS[l.aspect] || '#94a3b8' }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right font-bold whitespace-nowrap">
                    {formatCurrency(l.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {days.length > 0 && (
            <>
              <div className="flex items-end gap-[3px] h-11 mt-4">
                {days.map((x, i) => (
                  <span
                    key={x.day}
                    title={`${x.day}: ${formatCurrency(x.total)}`}
                    className={`flex-1 rounded-t-sm ${i === days.length - 1 ? 'bg-orange-500' : 'bg-orange-200'}`}
                    style={{ height: `${Math.max(4, (x.total / peak) * 100)}%` }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">takings, last 14 days</p>
            </>
          )}
        </div>

        {/* ── Who sold it ───────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="text-[11px] font-extrabold tracking-wider uppercase text-gray-500">
            Who sold it
            <span className="ml-2 font-semibold normal-case tracking-normal text-gray-400">· this month</span>
          </h3>

          {staff.length === 0 ? (
            <p className="py-6 text-sm text-gray-400 text-center">Nobody has sold anything yet.</p>
          ) : (
            <div className="mt-1">
              {staff.map((s) => (
                <div key={s.username} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="w-7 h-7 rounded-full bg-orange-500 text-white grid place-items-center
                                   text-[11px] font-extrabold shrink-0">
                    {String(s.username).charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{s.username}</span>
                    <span className="block text-[11.5px] text-gray-400">{s.sales} sales</span>
                  </span>
                  <span className="font-bold text-sm whitespace-nowrap">{formatCurrency(s.total)}</span>
                </div>
              ))}
              <Link to="/staff-sales" className="block mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700">
                See who sold what, to whom →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
