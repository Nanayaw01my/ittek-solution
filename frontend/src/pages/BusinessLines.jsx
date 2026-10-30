import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiSun, FiWifi, FiZap, FiHelpCircle, FiChevronRight } from 'react-icons/fi'
import { getSalesByAspect } from '../api/aspects'
import PageHeader from '../components/PageHeader'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency } from '../utils/helpers'

/**
 * The day's takings, split into the three sides of the business.
 *
 * Solar, networking and electricals are sold out of one till and one
 * catalogue, which is right — a customer buying panels and a router pays
 * once, and nobody at the counter should have to think about which list a
 * thing is on. But at the end of the day the owners want to know which side
 * the money came from, and that answer was nowhere: it meant reading the
 * sales list and sorting it in your head.
 *
 * Nothing here changes how anything is sold. It is the same sales, read a
 * different way.
 */

const LOOK = {
  solar: { icon: FiSun, ring: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400' },
  networking: { icon: FiWifi, ring: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-400' },
  electrical: { icon: FiZap, ring: 'border-violet-200', bg: 'bg-violet-50', text: 'text-violet-700', bar: 'bg-violet-400' },
  other: { icon: FiHelpCircle, ring: 'border-gray-200', bg: 'bg-gray-50', text: 'text-gray-600', bar: 'bg-gray-300' },
}

const today = () => new Date().toISOString().slice(0, 10)

export default function BusinessLines() {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [open, setOpen] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sales-by-aspect', from, to],
    queryFn: () => getSalesByAspect({ from, to }).then((r) => r.data),
  })

  const lines = data?.lines || []
  const total = data?.total || {}
  const sold = lines.filter((l) => l.pieces > 0)
  const unsorted = lines.find((l) => l.key === 'other')

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Business Lines"
        subtitle="Where the day's money came from — solar, networking, electricals"
      >
        <RefreshButton keys={['sales-by-aspect']} />
      </PageHeader>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <button
            onClick={() => { setFrom(today()); setTo(today()) }}
            className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            Today
          </button>
        </div>
      </div>

      {/* The day as a whole, so a line's share has something to be read
          against. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-5">
        {[
          { label: 'Taken', value: formatCurrency(total.revenue || 0) },
          { label: 'Profit', value: formatCurrency(total.profit || 0), good: true },
          { label: 'Sales', value: (total.sales ?? 0).toLocaleString() },
        ].map((s) => (
          <div key={s.label}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between sm:block">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{s.label}</p>
            <p className={`text-lg sm:text-xl font-black tabular-nums ${s.good ? 'text-green-700' : 'text-gray-900'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : sold.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <p className="text-sm text-gray-500">Nothing was sold in these dates.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sold.map((l) => {
            const look = LOOK[l.key] || LOOK.other
            const Icon = look.icon
            const isOpen = open === l.key
            return (
              <div key={l.key} className={`bg-white border rounded-2xl overflow-hidden ${look.ring}`}>
                <button
                  onClick={() => setOpen(isOpen ? null : l.key)}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-gray-50/60"
                >
                  <div className={`w-10 h-10 rounded-xl ${look.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={19} className={look.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900">{l.label}</p>
                    <p className="text-[11px] text-gray-500">
                      {l.pieces} piece{l.pieces === 1 ? '' : 's'} · {l.products.length} product
                      {l.products.length === 1 ? '' : 's'} · {l.sales} sale{l.sales === 1 ? '' : 's'}
                    </p>
                    {/* The share of the day, as a bar — three figures in a
                        column are a comparison nobody makes by eye. */}
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${look.bar}`} style={{ width: `${l.share}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-gray-900 tabular-nums">{formatCurrency(l.revenue)}</p>
                    <p className="text-[11px] text-gray-500 tabular-nums">{l.share}% of the day</p>
                    <p className="text-[11px] font-bold text-green-700 tabular-nums">
                      {formatCurrency(l.profit)} profit
                    </p>
                  </div>
                  <FiChevronRight size={16}
                    className={`flex-shrink-0 mt-1 text-gray-300 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {l.products.map((p) => (
                      <div key={p.name} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-gray-700">
                          {p.name}
                          {p.source === 'guess' && (
                            <span className="ml-1.5 text-[10px] font-bold text-amber-600">guessed</span>
                          )}
                        </span>
                        <span className="flex-shrink-0 text-right">
                          <span className="text-gray-500 text-xs tabular-nums mr-2">×{p.pieces}</span>
                          <span className="font-bold text-gray-900 tabular-nums">{formatCurrency(p.revenue)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Said rather than hidden: a figure that came from a word match should
          be correctable, and nobody can correct what they are not told. */}
      {unsorted?.pieces > 0 && (
        <p className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
          <strong>{unsorted.pieces} piece{unsorted.pieces === 1 ? '' : 's'}</strong> could not be
          placed and are counted under Unsorted. Give their category a business line under
          Categories and they will fall into place — every product in that category at once.
        </p>
      )}
      {sold.some((l) => l.guessed > 0) && (
        <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
          Items marked <span className="font-bold text-amber-600">guessed</span> were placed by
          reading their name. Setting the business line on their category makes it certain.
        </p>
      )}
    </div>
  )
}
