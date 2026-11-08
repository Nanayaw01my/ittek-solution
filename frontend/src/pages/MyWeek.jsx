import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiPrinter, FiChevronLeft, FiChevronRight, FiAlertCircle, FiPlus } from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import { formatCurrency, formatDate } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import { getMyWeek } from '../api/myWeek'
import { raiseComplaint } from '../api/complaints'

/**
 * A sales attendant's own week, on one page they can print.
 *
 * They could see today's takings on the Dashboard and nothing else — no
 * way to answer "how did my week go", and nothing to hand a manager on a
 * Saturday. It is their own figures only; the shop's week is a different
 * screen with different permissions.
 *
 * Printing goes through the browser's own print, with a stylesheet that
 * drops the app around it. It is A4 rather than the thermal roll: this is
 * a sheet to hand over or file, not a receipt, and the till's print rules
 * are built for 72mm of paper.
 */

function ComplaintModal({ onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    subject: '', detail: '', customer_name: '', customer_phone: '', severity: 'medium',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: raiseComplaint,
    onSuccess: () => {
      toast.success('Written down. The owners have been told.')
      queryClient.invalidateQueries({ queryKey: ['my-week'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save that'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Write down a complaint" size="md">
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">What is it about?</label>
          <input
            value={form.subject} onChange={set('subject')} aria-label="What is it about"
            placeholder="e.g. Bulb failed after two days"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                       focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">What happened?</label>
          <textarea
            rows={3} value={form.detail} onChange={set('detail')} aria-label="What happened"
            placeholder="In your own words."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none
                       focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Customer <span className="font-normal text-gray-400">(if any)</span>
            </label>
            <input
              value={form.customer_name} onChange={set('customer_name')} aria-label="Customer"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
            <input
              value={form.customer_phone} onChange={set('customer_phone')} aria-label="Customer phone"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">How bad</label>
          <div className="flex gap-2">
            {[
              { key: 'low', label: 'Minor' },
              { key: 'medium', label: 'Worth knowing' },
              { key: 'high', label: 'Serious' },
            ].map((o) => (
              <button
                key={o.key} type="button"
                onClick={() => setForm((f) => ({ ...f, severity: o.key }))}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  form.severity === o.key
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || !form.subject.trim() || !form.detail.trim()}
            onClick={() => mutation.mutate(form)}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm"
          >
            {mutation.isPending ? 'Saving…' : 'Save it'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function MyWeek() {
  const { user } = useAuthStore()
  // Any date inside the week; the server works out the Monday.
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10))
  const [complaining, setComplaining] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my-week', when],
    queryFn: () => getMyWeek(when).then((r) => r.data),
  })

  const shift = (days) => {
    const d = new Date(when)
    d.setDate(d.getDate() + days)
    setWhen(d.toISOString().slice(0, 10))
  }

  if (isLoading) return <LoadingSpinner />
  const w = data || {}
  const days = w.days || []
  const peak = Math.max(1, ...days.map((d) => d.takings))

  return (
    <div>
      {/*
        The app disappears when this is printed, and only the sheet below
        is left. Scoped to this page's own id so it cannot affect the
        till's thermal printing, which has its own rules for 72mm paper.
      */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          body * { visibility: hidden !important; }
          #week-sheet, #week-sheet * { visibility: visible !important; }
          #week-sheet {
            position: absolute !important; left: 0; top: 0; width: 100%;
            box-shadow: none !important; border: 0 !important;
          }
          .no-print { display: none !important; }
          /* The bars are the point of the day-by-day list, and a browser
             drops backgrounds when printing unless told not to. This rule
             first said #e5e7eb, which is the colour of the empty track —
             so every bar printed grey on grey and the chart was blank. */
          #week-sheet .print-bar { background: #F97316 !important; }
          #week-sheet .print-track { background: #eceef1 !important; }
          #week-sheet .print-bar, #week-sheet .print-track {
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title="My Week"
          subtitle="Your own figures, Monday to Sunday"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setComplaining(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                <FiPlus size={14} /> Complaint
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl"
              >
                <FiPrinter size={15} /> Print
              </button>
            </div>
          }
        />

        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => shift(-7)} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            <FiChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700">
            {w.week_start ? `${formatDate(w.week_start)} — ${formatDate(w.week_end)}` : ''}
          </span>
          <button onClick={() => shift(7)} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            <FiChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── the sheet ───────────────────────────────────────────────── */}
      <div id="week-sheet" className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-start justify-between border-b border-gray-200 pb-3 mb-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">Weekly report — {w.who || user?.username}</h2>
            <p className="text-sm text-gray-500">
              {w.week_start ? `${formatDate(w.week_start)} to ${formatDate(w.week_end)}` : ''}
            </p>
          </div>
          <p className="text-xs text-gray-400">DAN &amp; DOR SOLAR</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            ['Took', formatCurrency(w.takings)],
            ['Sales', w.sales ?? 0],
            ['Pieces sold', w.pieces ?? 0],
            ['Average sale', formatCurrency(w.average_sale)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] font-extrabold tracking-wider uppercase text-gray-400">{k}</p>
              <p className="text-xl font-black text-gray-900">{v}</p>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <p className="text-[11px] font-extrabold tracking-wider uppercase text-gray-500 mb-2">Day by day</p>
          {days.map((d) => (
            <div key={d.date} className="flex items-center gap-3 py-1 text-sm">
              <span className="w-24 text-gray-600">{d.day}</span>
              <span className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden print-track">
                <span
                  className="block h-full rounded-full print-bar bg-orange-500"
                  style={{ width: `${(d.takings / peak) * 100}%` }}
                />
              </span>
              <span className="w-12 text-right text-gray-400 text-xs">{d.sales}</span>
              <span className="w-28 text-right font-bold whitespace-nowrap">{formatCurrency(d.takings)}</span>
            </div>
          ))}
          {w.busiest_day && (
            <p className="text-xs text-gray-500 mt-2">Busiest day: <b>{w.busiest_day}</b></p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-5 mb-5">
          <div>
            <p className="text-[11px] font-extrabold tracking-wider uppercase text-gray-500 mb-2">
              What you sold most of
            </p>
            {(w.top_products || []).length === 0 ? (
              <p className="text-sm text-gray-400">Nothing sold this week.</p>
            ) : (w.top_products || []).map((p) => (
              <div key={p.name} className="flex justify-between text-sm py-0.5">
                <span className="truncate pr-2 text-gray-700">{p.name}</span>
                <span className="font-semibold whitespace-nowrap">{p.pieces}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[11px] font-extrabold tracking-wider uppercase text-gray-500 mb-2">
              Also this week
            </p>
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-700">Debt payments collected</span>
              <span className="font-semibold">{formatCurrency(w.collections?.amount)}</span>
            </div>
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-700">Money paid out</span>
              <span className="font-semibold">{formatCurrency(w.expenses?.amount)}</span>
            </div>
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-700">Discounts given</span>
              <span className="font-semibold">{formatCurrency(w.discounts)}</span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-extrabold tracking-wider uppercase text-gray-500 mb-2">
            Complaints you wrote down
          </p>
          {(w.complaints || []).length === 0 ? (
            <p className="text-sm text-gray-400">None this week.</p>
          ) : (
            <div className="space-y-1">
              {(w.complaints || []).map((cp) => (
                <div key={cp._id} className="flex items-center gap-2 text-sm">
                  <FiAlertCircle
                    size={13}
                    className={cp.severity === 'high' ? 'text-red-500' : 'text-amber-500'}
                  />
                  <span className="flex-1 text-gray-700">{cp.subject}</span>
                  <span className={`text-[11px] font-bold ${
                    cp.status === 'resolved' ? 'text-green-700' : 'text-amber-700'
                  }`}>
                    {cp.status === 'resolved' ? 'Settled' : 'Open'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 pt-3 border-t border-gray-200 text-[11px] text-gray-400">
          Printed {formatDate(new Date())} · ITTEK Solution
        </p>
      </div>

      {complaining && <ComplaintModal onClose={() => setComplaining(false)} />}
    </div>
  )
}
