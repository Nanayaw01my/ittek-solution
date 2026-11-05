import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  FiPackage, FiPlus, FiSearch, FiCheckCircle, FiSlash, FiClock,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency, formatDate, getRoleLevel } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import {
  getPackagePlans, getPackageCatalogue, createPackagePlan,
  recordPackagePayment, cancelPackagePlan,
} from '../api/packagePlans'

/**
 * Packages bought on instalments.
 *
 * The shop sells freezers, power stations and battery kits on a printed
 * sheet: so much down, so much a month. The sheet went home with the
 * customer and the payments were a note in a book, so a month that lived on
 * instalments looked, in the system, like a month with no sales.
 *
 * This is that sheet written down, and the two buttons the counter actually
 * needs — the whole instalment, or half of it — with each payment landing in
 * the day's takings on the day the money was handed over.
 */

const STATUS = {
  active: { label: 'Paying', cls: 'bg-blue-100 text-blue-700', icon: FiClock },
  completed: { label: 'Paid off', cls: 'bg-green-100 text-green-700', icon: FiCheckCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600', icon: FiSlash },
}

function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.active
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${s.cls}`}>
      <Icon size={11} /> {s.label}
    </span>
  )
}

/**
 * Taking a payment.
 *
 * Full and half are buttons rather than numbers to type, because that is how
 * the money actually arrives and because a figure typed at a counter is a
 * figure that can be typed wrong. What they come to is decided on the
 * server from the plan, so the two buttons mean the same thing on every till
 * and a stale screen cannot invent a different half.
 */
function PaymentModal({ plan, onClose }) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState('cash')
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')

  const mutation = useMutation({
    mutationFn: (body) => recordPackagePayment(plan._id, body),
    onSuccess: (data) => {
      // The sentence comes back inside `data` because the axios layer keeps
      // only that and drops every sibling field, `message` included.
      toast.success(data?.message || 'Payment recorded')
      queryClient.invalidateQueries({ queryKey: ['package-plans'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not record that'),
  })

  const full = Number(plan.installment_amount) || 0
  const outstanding = Number(plan.outstanding) || 0
  // What will actually be taken: the last payment of a plan is whatever is
  // left, which is usually less than an instalment.
  const take = (amount) => Math.min(amount, outstanding)

  return (
    <Modal isOpen onClose={onClose} title={`Payment — ${plan.customer_name}`} size="md">
      <div className="p-5 space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm">
          <p className="font-bold text-gray-900">{plan.package_name}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] text-gray-500">Package</p>
              <p className="font-semibold">{formatCurrency(plan.total_amount)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500">Paid</p>
              <p className="font-semibold text-green-700">{formatCurrency(plan.amount_paid)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500">Still owing</p>
              <p className="font-bold text-orange-600">{formatCurrency(outstanding)}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">How much did they pay?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ portion: 'full', payment_method: method, note })}
              className="py-4 rounded-xl border-2 border-green-500 bg-green-50 hover:bg-green-100
                         disabled:opacity-60 text-green-800"
            >
              <span className="block text-xs font-semibold">FULL instalment</span>
              <span className="block text-xl font-black">{formatCurrency(take(full))}</span>
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ portion: 'half', payment_method: method, note })}
              className="py-4 rounded-xl border-2 border-orange-400 bg-orange-50 hover:bg-orange-100
                         disabled:opacity-60 text-orange-800"
            >
              <span className="block text-xs font-semibold">HALF instalment</span>
              <span className="block text-xl font-black">{formatCurrency(take(full / 2))}</span>
            </button>
          </div>
          {take(full) < full && (
            <p className="mt-2 text-xs text-gray-500">
              Only {formatCurrency(outstanding)} is still owed, so that is all that will be taken —
              the rest of an instalment is not money the shop is due.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Or some other amount
          </label>
          <div className="flex gap-2">
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="Some other amount"
              placeholder="0.00"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="button"
              disabled={mutation.isPending || !(Number(custom) > 0)}
              onClick={() => mutation.mutate({ portion: 'part', amount: Number(custom), payment_method: method, note })}
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-40
                         text-white rounded-xl font-bold text-sm"
            >
              Take it
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Paid by</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile money</option>
              <option value="bank">Bank</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Payment note"
              placeholder="e.g. paid by her brother"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Whatever is taken goes into today&rsquo;s sales, dated today.
        </p>
      </div>
    </Modal>
  )
}

/**
 * Starting a plan, and taking the deposit in the same breath.
 *
 * The fields carry aria-labels because the labels above them are not
 * attached to anything — a screen reader announces an unnamed box, and
 * nothing can find the field by the name a person sees. On a screen that
 * decides how much money the shop is owed, that is worth the attribute.
 */
function NewPlanModal({ onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', package_set: 'custom', package_name: '',
    total_amount: '', installment_amount: '', frequency: 'monthly',
    installments_count: '', deposit: '', payment_method: 'cash', notes: '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const { data: catalogue } = useQuery({
    queryKey: ['package-catalogue'],
    queryFn: () => getPackageCatalogue().then((r) => r.data),
  })
  const sets = Array.isArray(catalogue) ? catalogue : []

  /**
   * Picking an advertised package fills the figures in.
   *
   * There are four of them — the total, the deposit, the instalment and how
   * many — and copying them off a printed sheet by hand is how a customer
   * ends up on a plan the shop never offered.
   */
  const choose = (setKey, pkg) => setForm((f) => ({
    ...f,
    package_set: setKey,
    package_name: pkg.name,
    total_amount: String(pkg.total ?? ''),
    deposit: String(pkg.deposit ?? ''),
    installment_amount: String(f.frequency === 'weekly' ? (pkg.weekly ?? '') : (pkg.monthly ?? '')),
    installments_count: String(f.frequency === 'weekly' ? (pkg.weeks ?? '') : (pkg.months ?? '')),
  }))

  const mutation = useMutation({
    mutationFn: createPackagePlan,
    onSuccess: () => {
      toast.success('Plan started')
      queryClient.invalidateQueries({ queryKey: ['package-plans'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not start that plan'),
  })

  return (
    <Modal isOpen onClose={onClose} title="New package plan" size="lg">
      <div className="p-5 space-y-4">
        {sets.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Pick the package</p>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {sets.map((s) => (
                <div key={s.key}>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">{s.title}</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {s.packages.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => choose(s.key, p)}
                        className={`text-left px-3 py-2 rounded-xl border text-sm ${
                          form.package_name === p.name
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <span className="block font-semibold text-gray-800">{p.name}</span>
                        <span className="block text-[11px] text-gray-500">
                          {formatCurrency(p.total)} · {formatCurrency(p.deposit)} down ·{' '}
                          {formatCurrency(p.monthly)}/month
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Customer *</label>
            <input value={form.customer_name} onChange={set('customer_name')} aria-label="Customer"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
            <input value={form.customer_phone} onChange={set('customer_phone')} aria-label="Customer phone"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Package *</label>
            <input value={form.package_name} onChange={set('package_name')} aria-label="Package"
              placeholder="e.g. 218L DC Freezer"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Package total *</label>
            <input type="number" min="0" step="0.01" value={form.total_amount} onChange={set('total_amount')} aria-label="Package total"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Deposit paid today</label>
            <input type="number" min="0" step="0.01" value={form.deposit} onChange={set('deposit')} aria-label="Deposit paid today"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">One instalment *</label>
            <input type="number" min="0" step="0.01" value={form.installment_amount} onChange={set('installment_amount')} aria-label="One instalment"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            <p className="text-[11px] text-gray-400 mt-1">Full and half are worked out from this.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Every</label>
              <select value={form.frequency} onChange={set('frequency')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="monthly">Month</option>
                <option value="weekly">Week</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">How many</label>
              <input type="number" min="1" value={form.installments_count} onChange={set('installments_count')} aria-label="How many instalments"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
        </div>

        {Number(form.deposit) > 0 && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
            {formatCurrency(form.deposit)} goes into today&rsquo;s sales as the deposit.
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({
              ...form,
              total_amount: Number(form.total_amount) || 0,
              installment_amount: Number(form.installment_amount) || 0,
              installments_count: Number(form.installments_count) || undefined,
              deposit: Number(form.deposit) || 0,
            })}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl font-bold text-sm"
          >
            {mutation.isPending ? 'Starting…' : 'Start plan'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function PackagePlans() {
  const { user } = useAuthStore()
  const isOwner = getRoleLevel(user?.role) >= 3
  const queryClient = useQueryClient()

  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  const [paying, setPaying] = useState(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['package-plans', status, search],
    queryFn: () => getPackagePlans({ status, search: search || undefined }).then((r) => r.data),
  })
  const plans = Array.isArray(data) ? data : (data?.plans || [])

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelPackagePlan(id, { reason: 'Cancelled from the plans screen' }),
    onSuccess: () => {
      toast.success('Plan cancelled')
      queryClient.invalidateQueries({ queryKey: ['package-plans'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not cancel that'),
  })

  const owed = plans.reduce((s, p) => s + (Number(p.outstanding) || 0), 0)
  const collected = plans.reduce((s, p) => s + (Number(p.amount_paid) || 0), 0)

  return (
    <div>
      <PageHeader
        title="Package Plans"
        subtitle="Freezers, power stations and kits paid for over time"
        action={
          <div className="flex items-center gap-2">
            <RefreshButton keys={[['package-plans']]} />
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm"
            >
              <FiPlus size={15} /> New plan
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">Collected on these plans</p>
          <p className="text-2xl font-black text-green-700">{formatCurrency(collected)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">Still owed</p>
          <p className="text-2xl font-black text-orange-600">{formatCurrency(owed)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {['active', 'completed', 'cancelled', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold capitalize ${
              status === s ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {s === 'active' ? 'Paying' : s === 'all' ? 'All' : s}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto px-3 py-1.5 bg-white border border-gray-200 rounded-xl">
          <FiSearch size={14} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, phone or package"
            className="text-sm focus:outline-none w-48"
          />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : plans.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <FiPackage size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No plans here yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => {
            const paidPct = p.total_amount > 0
              ? Math.min(100, Math.round((p.amount_paid / p.total_amount) * 100))
              : 0
            return (
              <div key={p._id} className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{p.customer_name}</p>
                    <p className="text-xs text-gray-500 truncate">{p.package_name}</p>
                  </div>
                  <StatusChip status={p.status} />
                </div>

                <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500" style={{ width: `${paidPct}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs">
                  <span className="text-green-700 font-semibold">{formatCurrency(p.amount_paid)} paid</span>
                  <span className="text-orange-600 font-semibold">{formatCurrency(p.outstanding)} left</span>
                </div>

                <p className="mt-2 text-[11px] text-gray-400">
                  {formatCurrency(p.installment_amount)} a {p.frequency === 'weekly' ? 'week' : 'month'}
                  {p.installments_paid ? ` · ${p.installments_paid} paid` : ''}
                  {p.createdAt ? ` · started ${formatDate(p.createdAt)}` : ''}
                </p>

                {p.status === 'active' && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setPaying(p)}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm"
                    >
                      Record payment
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => cancelMutation.mutate(p._id)}
                        className="px-3 py-2 border border-gray-200 text-gray-500 hover:text-red-600 rounded-xl text-sm"
                        title="Cancel this plan"
                      >
                        <FiSlash size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {paying && <PaymentModal plan={paying} onClose={() => setPaying(null)} />}
      {creating && <NewPlanModal onClose={() => setCreating(false)} />}
    </div>
  )
}
