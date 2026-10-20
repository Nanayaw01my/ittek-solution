import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FiUser, FiTag, FiAlertTriangle, FiRotateCcw, FiClock, FiX, FiChevronRight, FiSearch,
} from 'react-icons/fi'
import { getStaffSalesSummary, getStaffSales, getSaleTrail } from '../api/settings'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import { formatCurrency, formatDate, formatDateTime } from '../utils/helpers'

/**
 * Who sold what, to whom, and at what discount.
 *
 * The figures were all in the system and none of them were in one place. An
 * owner could see the day's takings and could open any single receipt, but
 * could not ask the question an owner actually asks: is somebody selling
 * cheap, and to the same few names every time?
 *
 * Deliberately not an accusation. A discount can be the right call at a
 * counter, and nothing here marks anybody as dishonest — it shows what was
 * given away and who it went to, and leaves the judgement to the person
 * reading it.
 */

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

export default function StaffSales() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [who, setWho] = useState(null)          // the staff row being read
  const [customer, setCustomer] = useState('')
  const [onlyDiscounted, setOnlyDiscounted] = useState(false)
  const [openSale, setOpenSale] = useState(null)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['staff-sales-summary', from, to],
    queryFn: () => getStaffSalesSummary({ from, to }).then(r => r.data),
  })

  const { data: list, isFetching: listing } = useQuery({
    queryKey: ['staff-sales', from, to, who?.user_id, customer, onlyDiscounted],
    queryFn: () => getStaffSales({
      from, to,
      user_id: who?.user_id || undefined,
      customer: customer.trim() || undefined,
      discounted: onlyDiscounted ? 'true' : undefined,
      limit: 50,
    }).then(r => r.data),
    // The list is the second question. Asking it before anybody has chosen
    // a name just loads the whole month for nothing.
    enabled: !!who || !!customer.trim() || onlyDiscounted,
  })

  const staff = summary?.staff || []
  const totals = summary?.totals || {}

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Who Sold What"
        subtitle="Each person's sales, their customers, and what was taken off the price"
      />

      {/* When */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div className="w-full sm:flex-1 sm:w-auto min-w-[180px]">
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Customer or receipt
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                value={customer}
                onChange={e => setCustomer(e.target.value)}
                placeholder="Name, phone or invoice no."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* What the whole shop gave away, so one person's figure has something
          to be read against. */}
      {/*
        Stacked on a phone, side by side on a desktop.
        Three tiles across a 390px screen leaves about a hundred pixels for
        a figure like GH₵ 129,500.00, and a truncated total — "GH₵ 1…" — is
        worse than no total at all.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-5">
        {[
          { label: 'Sales', value: (totals.sales_count ?? 0).toLocaleString() },
          { label: 'Taken', value: formatCurrency(totals.gross || 0) },
          { label: 'Given away', value: formatCurrency(totals.discount_total || 0), warn: true },
        ].map(s => (
          <div key={s.label}
            className={`rounded-2xl border px-4 py-3 flex items-center justify-between sm:block
              ${s.warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{s.label}</p>
            <p className={`text-lg sm:text-xl font-black tabular-nums ${s.warn ? 'text-amber-800' : 'text-gray-900'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Each person */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">By person</h3>
          <p className="text-[11px] text-gray-400">Most given away first</p>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array(3).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : staff.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">Nothing was sold in these dates.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {staff.map(s => {
              const active = who?.user_id === s.user_id
              return (
                <button
                  key={s.user_id}
                  onClick={() => setWho(active ? null : s)}
                  className={`w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-3 transition-colors
                    ${active ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <FiUser size={16} className="text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{s.username}</p>
                    <p className="text-[11px] text-gray-500">
                      {s.role} · {s.sales_count} sale{s.sales_count === 1 ? '' : 's'}
                      {' · '}{s.customers} customer{s.customers === 1 ? '' : 's'}
                      {s.on_credit > 0 && ` · ${s.on_credit} on credit`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-gray-900 tabular-nums text-sm">{formatCurrency(s.gross)}</p>
                    {s.discount_total > 0 ? (
                      <p className="text-[11px] font-bold text-amber-700 tabular-nums">
                        −{formatCurrency(s.discount_total)} ({s.discount_pct}%)
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-400">no discounts</p>
                    )}
                  </div>
                  <FiChevronRight size={16} className={`flex-shrink-0 ${active ? 'text-orange-500 rotate-90' : 'text-gray-300'} transition-transform`} />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* The sales behind the figures */}
      {(who || customer.trim() || onlyDiscounted) && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 truncate">
                {who ? `${who.username}'s sales` : 'Matching sales'}
              </h3>
              {list && (
                <p className="text-[11px] text-gray-500">
                  {list.pagination?.total ?? 0} shown · {formatCurrency(list.discount_total || 0)} taken off
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer">
                <input type="checkbox" checked={onlyDiscounted}
                  onChange={e => setOnlyDiscounted(e.target.checked)}
                  className="accent-orange-500" />
                Discounted only
              </label>
              {who && (
                <button onClick={() => setWho(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Clear">
                  <FiX size={15} />
                </button>
              )}
            </div>
          </div>

          {listing ? (
            <div className="p-5 space-y-3">
              {Array(4).fill(0).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : (list?.sales || []).length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">
              {onlyDiscounted ? 'No discounted sales in these dates.' : 'No sales match that.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {list.sales.map(s => (
                <button
                  key={s._id}
                  onClick={() => setOpenSale(s._id)}
                  className="w-full text-left px-4 sm:px-5 py-3 hover:bg-gray-50 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {s.customer_name || 'Walk-in'}
                      {s.customer_phone && (
                        <span className="font-normal text-gray-400"> · {s.customer_phone}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {s.invoice_no} · {formatDate(s.sale_date)} · {s.item_count} item{s.item_count === 1 ? '' : 's'}
                      {!who && s.user_id?.username && ` · ${s.user_id.username}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-gray-900 tabular-nums text-sm">
                      {formatCurrency(s.total_amount)}
                    </p>
                    {s.discount_cash > 0 && (
                      <p className="text-[11px] font-bold text-amber-700 tabular-nums">
                        −{formatCurrency(s.discount_cash)}
                      </p>
                    )}
                    {s.payment_status !== 'paid' && (
                      <p className="text-[10px] font-bold text-red-600 uppercase">{s.payment_status}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {openSale && <SaleTrail id={openSale} onClose={() => setOpenSale(null)} />}
    </div>
  )
}

/**
 * One sale, and everything that has happened to it since.
 */
function SaleTrail({ id, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sale-trail', id],
    queryFn: () => getSaleTrail(id).then(r => r.data),
  })

  const sale = data?.sale
  const refunds = data?.refunds || []
  const debt = data?.debt
  const layaways = data?.layaways || []
  const history = data?.customer_history || []

  return (
    <Modal isOpen onClose={onClose} title="The whole story of this sale" size="lg">
      <div className="p-5 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array(5).fill(0).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : error ? (
          <p className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error.response?.data?.message || 'Could not read that sale.'}
          </p>
        ) : !sale ? null : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-gray-900">{sale.customer_name || 'Walk-in'}</p>
                <p className="text-xs text-gray-500">
                  {sale.customer_phone || 'no phone'} · {sale.invoice_no}
                </p>
                <p className="text-xs text-gray-500">
                  Sold by <strong>{sale.user_id?.username || 'Unknown'}</strong>
                  {' · '}{formatDateTime(sale.sale_date)}
                </p>
              </div>
              <Badge status={sale.payment_status} />
            </div>

            {/*
              The lines.
              Two columns, not four. A cedi amount is eleven characters wide
              — "GH₵ 4,500.00" — and four of them side by side on a 390px
              phone put the price sold at straight on top of the list price,
              which is the one comparison this panel exists to make.
            */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex justify-between px-3 py-2 bg-gray-50 text-[11px] font-bold text-gray-500">
                <span>ITEM</span>
                <span>SOLD AT · LIST</span>
              </div>
              {(sale.items || []).map((i, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 px-3 py-2.5 border-t text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-gray-900 leading-snug">{i.product_name}</span>
                    <span className="block text-[11px] text-gray-500 tabular-nums">
                      {i.quantity} × {formatCurrency(i.unit_price)}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-right tabular-nums">
                    <span className="block font-bold text-gray-900">
                      {formatCurrency((Number(i.unit_price) || 0) * (Number(i.quantity) || 0))}
                    </span>
                    {i.list_price ? (
                      i.below_list > 0 ? (
                        <span className="block text-[11px] font-bold text-amber-700">
                          list {formatCurrency(i.list_price)} · −{formatCurrency(i.below_list)}
                        </span>
                      ) : (
                        <span className="block text-[11px] text-gray-400">at list price</span>
                      )
                    ) : (
                      <span className="block text-[11px] text-gray-300">list unknown</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* What came off, and how */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-[11px] font-bold uppercase text-gray-500">Paid</p>
                <p className="text-lg font-black text-gray-900 tabular-nums">
                  {formatCurrency(sale.total_amount)}
                </p>
                <p className="text-[11px] text-gray-500 capitalize">
                  {(sale.payment_method || '').replace('_', ' ') || '—'}
                </p>
              </div>
              <div className={`rounded-xl p-3 border ${sale.discount_cash > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-[11px] font-bold uppercase text-gray-500">Discount given</p>
                <p className={`text-lg font-black tabular-nums ${sale.discount_cash > 0 ? 'text-amber-800' : 'text-gray-400'}`}>
                  {formatCurrency(sale.discount_cash)}
                </p>
                <p className="text-[11px] text-gray-500">
                  {sale.discount_type === 'percentage' && sale.discount
                    ? `${sale.discount}% off ${formatCurrency(sale.subtotal)}`
                    : 'off the subtotal'}
                </p>
              </div>
            </div>

            {/* A price typed below the list price never shows as a discount
                anywhere else, which is exactly why it is called out here. */}
            {sale.below_list_total > 0 && (
              <div className="flex gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <FiAlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 leading-relaxed">
                  <strong>{formatCurrency(sale.below_list_total)}</strong> of this was given away by
                  selling below the list price, on top of any discount above. That does not appear
                  as a discount anywhere else in the system.
                </p>
              </div>
            )}

            {/* What happened afterwards */}
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">
                What happened after
              </p>
              <div className="space-y-2">
                {refunds.map(r => (
                  <div key={r._id} className="flex gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200">
                    <FiRotateCcw size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 text-xs text-red-900">
                      <p className="font-bold">
                        Refunded {formatCurrency(r.refund_amount)} — {r.product_name}
                        {' '}<span className="font-normal">({r.status})</span>
                      </p>
                      <p className="text-red-700">
                        {r.reason}
                        {r.requested_by?.username && ` · asked by ${r.requested_by.username}`}
                        {r.approved_by?.username && ` · approved by ${r.approved_by.username}`}
                        {' · '}{formatDate(r.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}

                {debt && (
                  <div className="flex gap-2.5 p-3 rounded-xl bg-orange-50 border border-orange-200">
                    <FiClock size={15} className="text-orange-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 text-xs text-orange-900">
                      <p className="font-bold">
                        Left owing {formatCurrency(debt.amount_owed)} —
                        {' '}{formatCurrency(debt.amount_paid || 0)} paid since
                        {' '}<span className="font-normal">({debt.status})</span>
                      </p>
                      <p className="text-orange-700">
                        {debt.recorded_by?.username && `Recorded by ${debt.recorded_by.username}`}
                        {debt.due_date && ` · due ${formatDate(debt.due_date)}`}
                      </p>
                    </div>
                  </div>
                )}

                {layaways.map(l => (
                  <div key={l._id} className="flex gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-200">
                    <FiTag size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="min-w-0 text-xs text-blue-900">
                      <strong>Layaway {l.reference}</strong> — {formatCurrency(l.amount_paid)} of
                      {' '}{formatCurrency(l.total_amount)} paid ({l.status})
                    </p>
                  </div>
                ))}

                {refunds.length === 0 && !debt && layaways.length === 0 && (
                  <p className="text-sm text-gray-400 px-1">
                    Nothing. Paid and done with.
                  </p>
                )}
              </div>
            </div>

            {/* The same customer's other trade, so one cheap sale can be read
                in context rather than on its own. */}
            {history.length > 0 && (
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">
                  This customer's other sales
                </p>
                <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
                  {history.map(h => (
                    <div key={h._id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-gray-600">
                        {formatDate(h.sale_date)} · {h.user_id?.username || 'Unknown'}
                      </span>
                      <span className="flex-shrink-0 text-right">
                        <span className="font-bold tabular-nums text-gray-900">
                          {formatCurrency(h.total_amount)}
                        </span>
                        {h.discount_cash > 0 && (
                          <span className="ml-2 font-bold text-amber-700 tabular-nums">
                            −{formatCurrency(h.discount_cash)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
