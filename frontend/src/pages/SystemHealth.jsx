import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiCheckCircle, FiAlertTriangle, FiXCircle, FiDatabase, FiSave,
  FiMessageSquare, FiBell, FiDollarSign, FiPlay, FiClock,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { getSystemHealth, runJobsNow, getCreditSalesGap, repairCreditSales } from '../api/health'

const TONE = {
  ok: { bar: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', Icon: FiCheckCircle },
  warn: { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', Icon: FiAlertTriangle },
  bad: { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', Icon: FiXCircle },
}

const HEADLINE = {
  ok: 'Everything is running',
  warn: 'Something needs a look',
  bad: 'Something is broken',
}

/** The job names as a person would say them, not as the code spells them. */
const JOB_LABELS = {
  nightly_backup: 'Nightly backup',
  low_stock: 'Low stock check',
  chase_debts: 'Chase overdue debts',
  todays_installations: "Today's installations",
  overdue_debts: 'Mark overdue debts',
  overdue_layaways: 'Mark overdue layaways',
  daily_summary: 'Daily summary email',
  fraud_scan: 'Fraud sweep',
}

function Check({ title, icon: Icon, state, children }) {
  const tone = TONE[state] || TONE.warn
  return (
    <div className={`rounded-2xl border p-4 ${tone.border} ${tone.bg}`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={`${tone.text} mt-0.5 flex-shrink-0`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-black text-gray-900 text-sm">{title}</p>
            <tone.Icon size={13} className={tone.text} />
          </div>
          <div className="text-xs text-gray-600 mt-0.5 space-y-0.5">{children}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Credit agreement money that never reached the sales book.
 *
 * Recording a payment used to write it onto the agreement and nowhere
 * else, and the day's takings are the sum of that day's sale rows — so
 * every payment taken before the fix is missing from the figures for the
 * day it was taken. The balance on the agreement was always right; the
 * shop's day was short by whatever had been collected.
 *
 * It shows before it touches anything, and today is offered on its own.
 * Today is the only day still open: adding to it corrects a figure
 * nobody has closed, while reaching back into last month moves money
 * into days that have already been reported on. That is a decision for
 * the shop, so it is a separate button and says what it will do.
 */
function CreditSalesGap() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['credit-sales-gap'],
    queryFn: () => getCreditSalesGap().then((r) => r.data),
    retry: false,
  })

  const fix = useMutation({
    mutationFn: repairCreditSales,
    onSuccess: (d) => {
      // The sentence rides inside `data`: the axios layer keeps only that
      // and drops every sibling field, `message` included.
      toast.success(d?.message || 'Added to the takings.')
      queryClient.invalidateQueries({ queryKey: ['credit-sales-gap'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not repair'),
  })

  if (isLoading || !data) return null
  if (!data.count) return null

  const money = (n) => `GH\u20b5${Number(n || 0).toFixed(2)}`

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <FiAlertTriangle size={24} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-amber-900">
            {data.count} credit agreement {data.count === 1 ? 'payment is' : 'payments are'} missing
            from the takings
          </p>
          <p className="text-sm text-gray-700 mt-1">
            {money(data.total)} in all. The money is on the agreements and the balances are
            right — it was never written into the sales book, so it is absent from the figures
            for the day it was taken. Adding it dates each one to the day it was actually paid.
          </p>

          {data.today_count > 0 && (
            <p className="text-sm font-bold text-amber-900 mt-2">
              {data.today_count} of {data.today_count === 1 ? 'them was' : 'them were'} taken
              today — {money(data.today_total)}.
            </p>
          )}

          <div className="mt-3 rounded-xl bg-white border border-amber-200 divide-y divide-amber-100 max-h-56 overflow-y-auto">
            {data.payments.map((p) => (
              <div key={p.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-gray-900 truncate">{p.customer_name}</span>
                  <span className="block text-[11px] text-gray-500">
                    {p.kind === 'deposit' ? 'Deposit at signing' : 'Instalment'}
                    {' · '}{format(new Date(p.paid_at), 'd MMM yyyy')}
                  </span>
                </span>
                <span className="font-black tabular-nums shrink-0">{money(p.amount)}</span>
              </div>
            ))}
          </div>
          {data.truncated && (
            <p className="text-[11px] text-gray-500 mt-1">Showing the 200 most recent.</p>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {data.today_count > 0 && (
              <button onClick={() => fix.mutate({ today: true })} disabled={fix.isPending}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-sm disabled:opacity-50">
                {fix.isPending ? 'Adding…' : `Add today's ${money(data.today_total)}`}
              </button>
            )}
            <button onClick={() => fix.mutate({ all: true })} disabled={fix.isPending}
              title="Includes days that have already been closed and reported on"
              className="px-4 py-2.5 border-2 border-gray-900 text-gray-800 hover:bg-white rounded-xl font-black text-sm disabled:opacity-50">
              Add all {data.count}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Adding all of them changes the totals for days that have already been closed.
            Safe to press twice — a payment that has been added is skipped.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SystemHealth() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => getSystemHealth().then((r) => r.data),
    // Reading it is cheap and a stale answer here is worse than none.
    refetchInterval: 60000,
    retry: false,
  })

  const run = useMutation({
    mutationFn: runJobsNow,
    onSuccess: (res) => {
      toast.success(res.data?.ran?.length ? `Ran: ${res.data.ran.join(', ')}.` : 'Nothing was outstanding.')
      queryClient.invalidateQueries({ queryKey: ['system-health'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not run them'),
  })

  if (isLoading) return <div className="p-6"><LoadingSpinner text="Checking…" /></div>

  /**
   * A health screen that cannot reach the server must say so.
   *
   * It used to render its empty shells — "Checked", amber warnings, blank
   * figures — which reads as "I looked and things are middling". On this
   * screen above all others that is the worst possible lie: the one page
   * whose job is to tell you something is wrong, quietly implying it has
   * checked when it has not.
   */
  if (error || !data?.checks) {
    const why = error?.response?.data?.message
      || error?.message
      || 'The server answered, but not with anything this page could read.'
    return (
      <div className="space-y-5">
        <PageHeader title="System health" subtitle="Whether the things that run on their own are actually running" />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-4">
            <FiXCircle size={28} className="text-red-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-black text-red-700">Could not check</p>
              <p className="text-sm text-gray-700 mt-1">
                Nothing below is known — this is not a report that things are
                middling, it is a report that the check itself failed.
              </p>
              <p className="text-xs text-gray-600 mt-2 break-words">
                <span className="font-semibold">The server said:</span> {why}
              </p>
              <button onClick={() => queryClient.invalidateQueries({ queryKey: ['system-health'] })}
                className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm">
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const h = data || {}
  const c = h.checks || {}
  const tone = TONE[h.state] || TONE.warn

  return (
    <div className="space-y-5">
      <PageHeader
        title="System health"
        subtitle="Whether the things that run on their own are actually running"
        action={
          <div className="flex items-center gap-2">
            <RefreshButton keys={['system-health']} />
            <button onClick={() => run.mutate()} disabled={run.isPending}
              title="Run anything outstanding now, instead of waiting for tomorrow"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-sm disabled:opacity-50">
              <FiPlay size={14} /> {run.isPending ? 'Running…' : 'Run what is due'}
            </button>
          </div>
        }
      />

      <CreditSalesGap />

      <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-5 flex items-center gap-4`}>
        <tone.Icon size={32} className={tone.text} />
        <div>
          <p className={`text-lg font-black ${tone.text}`}>{HEADLINE[h.state] || 'Checked'}</p>
          <p className="text-xs text-gray-600">
            Checked {h.checked_at ? format(new Date(h.checked_at), 'HH:mm') : '—'}
            {' · up '}{Math.floor((h.uptime_seconds || 0) / 60)} min
          </p>
          {/* What is actually deployed. Compare this with the latest commit
              when a change you were told about is not on the screen. */}
          <p className="text-[11px] text-gray-400 mt-0.5">
            {h.version?.commit
              ? <>Running <span className="font-mono font-semibold">{h.version.commit}</span>
                  {h.version.branch ? ` on ${h.version.branch}` : ''}
                  {h.version.started_at ? `, deployed ${format(new Date(h.version.started_at), 'd MMM HH:mm')}` : ''}</>
              : 'This server does not report which version it is running.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Check title="Backups" icon={FiSave} state={c.backups?.state}>
          <p>Last taken <span className="font-bold">{c.backups?.last_ago}</span>.</p>
          {c.backups?.message && <p>{c.backups.message}</p>}
          {/* The remedy comes from the server, which has read the reason.
              A screen that guesses sends people on the wrong errand. */}
          {c.backups?.remedy && <p className="font-semibold">{c.backups.remedy}</p>}
          {c.backups?.attempts > 1 && (
            <p className="text-[11px] opacity-75">Tried {c.backups.attempts} times today.</p>
          )}
        </Check>

        <Check title="Database" icon={FiDatabase} state={c.database?.state}>
          <p className="capitalize">{c.database?.label}{c.database?.name ? ` · ${c.database.name}` : ''}</p>
        </Check>

        <Check title="Text messages" icon={FiMessageSquare} state={c.sms?.state}>
          <p>
            {c.sms?.configured
              ? <>Sending as <span className="font-bold">{c.sms.sender_id}</span></>
              : 'Not set up'}
            {c.sms?.balance != null && <> · <span className="font-bold">{c.sms.balance}</span> credits</>}
          </p>
          {c.sms?.message && <p>{c.sms.message}</p>}
        </Check>

        <Check title="Chasing debts" icon={FiDollarSign} state={c.chasing?.state}>
          <p>
            {c.chasing?.enabled
              ? `On, at ${String(c.chasing.hour).padStart(2, '0')}:00.`
              : 'Off.'}
          </p>
          {c.chasing?.message && <p>{c.chasing.message}</p>}
        </Check>

        <Check title="Phone alerts" icon={FiBell} state={c.alerts?.state}>
          <p>
            {c.alerts?.configured ? 'Keys installed' : 'No keys'}
            {' · '}<span className="font-bold">{c.alerts?.devices ?? 0}</span> device
            {c.alerts?.devices === 1 ? '' : 's'} subscribed
          </p>
          {c.alerts?.message && <p>{c.alerts.message}</p>}
        </Check>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <FiClock size={15} className="text-gray-400" />
          <p className="font-black text-gray-900 text-sm">Today&rsquo;s jobs</p>
        </div>
        <div className="divide-y divide-gray-100">
          {(h.jobs || []).map((j) => {
            const t = TONE[j.state] || TONE.warn
            return (
              <div key={j.name} className="px-4 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {JOB_LABELS[j.name] || j.name.replace(/_/g, ' ')}
                  </p>
                  {j.message && <p className="text-xs text-gray-500 break-words">{j.message}</p>}
                  {!j.message && j.last_run && (
                    <p className="text-xs text-gray-400">last ran {j.last_run_ago}</p>
                  )}
                </div>
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold flex-shrink-0 ${t.text}`}>
                  <t.Icon size={12} /> {j.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
