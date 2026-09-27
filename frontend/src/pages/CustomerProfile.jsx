import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  FiUser, FiSearch, FiPhone, FiShoppingBag, FiTool, FiArrowLeft,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import { formatCurrency } from '../utils/helpers'
import { lookupCustomers, getCustomerProfile } from '../api/customerLookup'

const when = (d, f = 'dd MMM yyyy') => (d ? format(new Date(d), f) : '—')

/** One kind of money still owed, with the deals behind it. */
function OwingBlock({ title, amount, rows }) {
  if (!rows.length) return null
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide">{title}</h3>
        <span className={`text-sm font-black ${amount > 0 ? 'text-orange-600' : 'text-green-700'}`}>
          {amount > 0 ? formatCurrency(amount) : 'clear'}
        </span>
      </div>
      <ul className="divide-y text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between px-3 py-2 gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{r.label}</p>
              <p className="text-[11px] text-gray-500">{r.sub}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`font-black ${r.left > 0 ? 'text-orange-600' : 'text-green-700'}`}>
                {r.left > 0 ? formatCurrency(r.left) : 'paid'}
              </p>
              {r.of != null && (
                <p className="text-[11px] text-gray-500">of {formatCurrency(r.of)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Profile({ phone, onBack }) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-profile', phone],
    queryFn: () => getCustomerProfile(phone).then((r) => r.data),
  })

  if (isLoading) return <LoadingSpinner />
  if (!data) return <p className="text-sm text-gray-500">Nothing found for {phone}.</p>

  const { customer, totals, sales, debts, layaways, credits, phone_sales: phoneSales, services } = data
  const owing = totals.owing || {}

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900"
      >
        <FiArrowLeft size={14} /> Back to search
      </button>

      {/* ── Who they are, and the one number that matters ─────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-gray-900">{customer.name}</h2>
            <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
              <FiPhone size={13} /> {customer.phone}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              First seen {when(customer.first_seen)} · last {when(customer.last_seen)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-500">Owes the shop</p>
            <p className={`text-2xl font-black ${owing.total > 0 ? 'text-orange-600' : 'text-green-700'}`}>
              {owing.total > 0 ? formatCurrency(owing.total) : 'Nothing'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t text-sm">
          <div>
            <p className="text-[11px] text-gray-500">Spent with you</p>
            <p className="font-black text-gray-900">{formatCurrency(totals.spend)}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500">Purchases</p>
            <p className="font-black text-gray-900">{totals.sales_count}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500">Jobs done</p>
            <p className="font-black text-gray-900">{totals.service_count}</p>
          </div>
        </div>
      </div>

      {/* ── What they owe, wherever it is owed from ───────────────────── */}
      {owing.total > 0 ? (
        <div className="space-y-3">
          <OwingBlock
            title="Debts" amount={owing.debts}
            rows={debts.filter((d) => d.status !== 'paid').map((d) => ({
              key: d._id,
              label: `Debt of ${formatCurrency(d.amount_owed)}`,
              sub: `due ${when(d.due_date)}${d.status === 'overdue' ? ' — overdue' : ''}`,
              left: Math.max(0, (d.amount_owed || 0) - (d.amount_paid || 0)),
              of: d.amount_owed,
            }))}
          />
          <OwingBlock
            title="Layaway" amount={owing.layaway}
            rows={layaways.filter((l) => !['completed', 'cancelled'].includes(l.status)).map((l) => ({
              key: l._id,
              label: l.reference || 'Layaway',
              sub: `next ${when(l.next_due_date)} · ${l.status}`,
              left: l.balance,
              of: l.total_amount,
            }))}
          />
          <OwingBlock
            title="Credit agreements" amount={owing.credit}
            rows={credits.filter((c) => c.status === 'active').map((c) => ({
              key: c._id,
              label: c.reference || c.item_description || 'Agreement',
              sub: `${c.installments || '—'} instalments · ${c.status}`,
              left: c.remaining,
              of: c.total_amount,
            }))}
          />
          <OwingBlock
            title="Phone credit" amount={owing.phone_credit}
            rows={phoneSales.filter((p) => p.status === 'approved').map((p) => ({
              key: p._id,
              label: p.phone_model,
              sub: `${p.reference} · paid ${formatCurrency(p.amount_paid || 0)}`,
              left: p.balance,
              of: p.total_amount,
            }))}
          />
        </div>
      ) : (
        <p className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 font-semibold">
          Owes nothing — everything is settled.
        </p>
      )}

      {/* ── What they bought ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide px-4 py-3 border-b flex items-center gap-1.5">
          <FiShoppingBag size={13} /> Purchases
        </h3>
        {sales.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">Nothing bought over the counter yet.</p>
        ) : (
          <ul className="divide-y max-h-72 overflow-y-auto">
            {sales.map((s) => (
              <li key={s._id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{s.invoice_no}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {when(s.sale_date)} ·{' '}
                    {(s.items || []).map((i) => i.product_name).slice(0, 2).join(', ')
                      || 'no items'}
                    {(s.items || []).length > 2 ? ` +${s.items.length - 2} more` : ''}
                  </p>
                </div>
                <p className="font-black text-gray-900 flex-shrink-0">
                  {formatCurrency(s.total_amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Work done for them ────────────────────────────────────────── */}
      {services.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide px-4 py-3 border-b flex items-center gap-1.5">
            <FiTool size={13} /> Jobs
          </h3>
          <ul className="divide-y max-h-60 overflow-y-auto">
            {services.map((s) => (
              <li key={s._id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{s.description}</p>
                  <p className="text-[11px] text-gray-500">
                    {when(s.charged_at)}{s.location ? ` · ${s.location}` : ''}
                  </p>
                </div>
                <p className="font-black text-gray-900 flex-shrink-0">{formatCurrency(s.amount)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function CustomerProfile() {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null)

  const { data, isFetching } = useQuery({
    queryKey: ['customer-lookup', q],
    queryFn: () => lookupCustomers(q).then((r) => r.data),
    enabled: !picked && q.trim().length > 1,
  })
  const customers = data?.customers || []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        subtitle="Everything one person has bought, owes and paid — in one place"
      />

      {picked ? (
        <Profile phone={picked} onBack={() => setPicked(null)} />
      ) : (
        <>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or phone number…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {q.trim().length < 2 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
              <FiUser className="mx-auto text-gray-300" size={34} />
              <p className="mt-2 text-sm text-gray-500">
                Type a name or number to pull up a customer.
              </p>
            </div>
          ) : isFetching ? <LoadingSpinner /> : customers.length === 0 ? (
            <p className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-500">
              Nobody by that name or number.
            </p>
          ) : (
            <div className="space-y-2">
              {customers.map((c) => (
                <button
                  key={c.phone} onClick={() => setPicked(c.phone)}
                  className="w-full text-left bg-white border border-gray-100 rounded-2xl p-4 hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.phone}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end flex-shrink-0">
                      {c.sources.map((s) => (
                        <span key={s} className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
