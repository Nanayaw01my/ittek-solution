import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FiSun, FiWifi, FiZap, FiHelpCircle, FiChevronRight, FiGrid } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { getSalesByAspect, getCatalogueAspects, autoSortAspects, setProductAspect } from '../api/aspects'
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
  // Two questions on one screen: where today's money came from, and what
  // the system makes of the catalogue it came out of.
  const [tab, setTab] = useState('sales')

  const { data, isLoading } = useQuery({
    queryKey: ['sales-by-aspect', from, to],
    queryFn: () => getSalesByAspect({ from, to }).then((r) => r.data),
  })

  const lines = data?.lines || []
  const total = data?.total || {}
  const sold = lines.filter((l) => l.pieces > 0)
  const unsorted = lines.find((l) => l.key === 'other')
  const days = data?.days || []

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Business Lines"
        subtitle="Where the day's money came from — solar, networking, electricals"
      >
        <RefreshButton keys={['sales-by-aspect']} />
      </PageHeader>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit max-w-full mb-4">
        {[['sales', 'The money'], ['catalogue', 'The products']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap
              ${tab === k ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'catalogue' ? <Catalogue /> : (
      <>
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

      {/*
        The sum done where it can be seen.
        Sold, less what the goods cost, is the profit — three figures rather
        than one, because an owner checking a day's profit wants to see the
        two it came from instead of being asked to trust it.
      */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-5">
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-wide text-gray-500">Sold for</p>
            <p className="text-base sm:text-xl font-black text-gray-900 tabular-nums">
              {formatCurrency(total.revenue || 0)}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-wide text-gray-500">Goods cost</p>
            <p className="text-base sm:text-xl font-black text-red-700 tabular-nums">
              −{formatCurrency(total.cost || 0)}
            </p>
          </div>
          <div className="px-3 py-3 text-center bg-green-50">
            <p className="text-[10px] font-black uppercase tracking-wide text-green-800/70">Profit</p>
            <p className="text-base sm:text-xl font-black text-green-700 tabular-nums">
              {formatCurrency(total.profit || 0)}
            </p>
          </div>
        </div>
        <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
          {(total.sales ?? 0).toLocaleString()} sale{total.sales === 1 ? '' : 's'}
          {' · '}{(total.pieces ?? 0).toLocaleString()} piece{total.pieces === 1 ? '' : 's'}
          {total.revenue > 0 && ` · ${total.margin}% kept`}
        </p>
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
                    <p className="text-[11px] text-gray-400 tabular-nums">
                      cost {formatCurrency(l.cost)}
                    </p>
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

      {/*
        Day by day.
        A range says what the week came to; it does not say which day was
        good. Shown only when there is more than one day in it — a single
        day repeated underneath itself is noise.
      */}
      {days.length > 1 && (
        <div className="mt-5 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Day by day</h3>
            <p className="text-[11px] text-gray-500">Sold, less what the goods cost</p>
          </div>
          <div className="divide-y divide-gray-50">
            {days.map((d) => (
              <div key={d.date} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800">
                    {new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GH', {
                      weekday: 'short', day: 'numeric', month: 'short',
                    })}
                  </p>
                  <p className="text-[11px] text-gray-400 tabular-nums">
                    {formatCurrency(d.revenue)} − {formatCurrency(d.cost)}
                    {' · '}{d.sales} sale{d.sales === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-green-700 tabular-nums">{formatCurrency(d.profit)}</p>
                  <p className="text-[11px] text-gray-400 tabular-nums">{d.margin}% kept</p>
                </div>
              </div>
            ))}
          </div>
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
          reading their name. Open <strong>The products</strong> above to sort the catalogue
          once and for all.
        </p>
      )}
      </>
      )}
    </div>
  )
}

/**
 * What the system makes of the catalogue, before anything is sold.
 *
 * The report works a product's department out as it runs, which answers the
 * question but leaves nothing behind — an owner cannot see what the system
 * thinks until a thing is sold. This is that view, and the button that
 * writes the thinking down so it stops being re-done on every report and
 * can be corrected like any other field.
 */
function Catalogue() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['catalogue-aspects'],
    queryFn: () => getCatalogueAspects().then((r) => r.data),
  })

  const sort = useMutation({
    mutationFn: autoSortAspects,
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Sorted.', { duration: 8000 })
      queryClient.invalidateQueries({ queryKey: ['catalogue-aspects'] })
      queryClient.invalidateQueries({ queryKey: ['sales-by-aspect'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not sort them'),
  })

  const place = useMutation({
    mutationFn: ({ id, aspect }) => setProductAspect(id, aspect),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Done.')
      queryClient.invalidateQueries({ queryKey: ['catalogue-aspects'] })
      queryClient.invalidateQueries({ queryKey: ['sales-by-aspect'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not set it'),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array(3).fill(0).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  const counts = data?.counts || []
  const unplaced = data?.unplaced || []

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <FiGrid size={19} className="text-orange-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black text-gray-900">{(data?.total ?? 0).toLocaleString()} products</p>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {data?.guessed_total || 0} are placed by reading their name each time a report runs.
              {' '}Sorting writes those down, so they can be corrected like any other field.
            </p>
          </div>
        </div>

        <button
          onClick={() => sort.mutate()}
          disabled={sort.isPending || !(data?.guessed_total > 0)}
          className="mt-3 w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50
                     text-white font-bold rounded-xl text-sm"
        >
          {sort.isPending ? 'Sorting…'
            : data?.guessed_total > 0 ? `Sort ${data.guessed_total} products into departments`
              : 'Nothing left to sort'}
        </button>
        <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
          Anything you or a category has already placed is left exactly as it is.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {counts.map((c) => {
          const look = LOOK[c.key] || LOOK.other
          const Icon = look.icon
          return (
            <div key={c.key} className={`bg-white border rounded-2xl p-3 ${look.ring}`}>
              <div className="flex items-center gap-2">
                <Icon size={15} className={look.text} />
                <p className="text-xs font-black text-gray-800">{c.label}</p>
              </div>
              <p className="text-xl font-black text-gray-900 tabular-nums mt-1">{c.total}</p>
              <p className="text-[10.5px] text-gray-500">
                {c.certain} set{c.guessed > 0 ? ` · ${c.guessed} guessed` : ''}
              </p>
            </div>
          )
        })}
      </div>

      {unplaced.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">
              {data.unplaced_total} the system cannot read
            </h3>
            <p className="text-[11px] text-gray-500">
              Their names say nothing about which department they belong to. Put them right here.
            </p>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {unplaced.map((p) => (
              <div key={p._id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{p.name}</p>
                  {p.category && <p className="text-[10.5px] text-gray-400">{p.category}</p>}
                </div>
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && place.mutate({ id: p._id, aspect: e.target.value })}
                  className="flex-shrink-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white
                             focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Put it in…</option>
                  <option value="solar">Solar</option>
                  <option value="networking">Networking</option>
                  <option value="electrical">Electricals</option>
                </select>
              </div>
            ))}
          </div>
          {data.unplaced_total > unplaced.length && (
            <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-50">
              Showing the first {unplaced.length}. Giving a whole category a department under
              Categories clears them faster than one at a time.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
