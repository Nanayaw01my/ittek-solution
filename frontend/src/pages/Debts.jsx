import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiAlertCircle, FiDollarSign, FiChevronDown, FiChevronUp, FiTrash2, FiPrinter } from 'react-icons/fi'
import { getDebts, recordDebtPayment, getDebtSummary, deleteDebt } from '../api/debts'
import { formatCurrency, formatDate, getRoleLevel } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import { isPast, parseISO } from 'date-fns'
import { getSettings } from '../api/settings'
import { printReceipt } from '../utils/printReceipt'
import RefreshButton from '../components/RefreshButton'

/**
 * The slip the customer walks away with after paying down a debt.
 *
 * Built as the same thermal receipt the POS prints — `receipt-print-area` is
 * what printReceipt() sizes to the shop's roll — rather than an A4 page: a
 * debt payment happens at the counter, on the same printer, and a customer
 * handing over cash expects paper in return.
 *
 * It states the balance that remains, which is the whole point of it. A
 * receipt that only says what was paid settles no argument three weeks later
 * about what is still owed.
 */
function DebtReceiptModal({ receipt, onClose, settings }) {
  if (!receipt) return null

  const cur = 'GH₵'
  const remaining = Math.max(0, (receipt.amount_owed || 0) - (receipt.amount_paid || 0))
  const settled = remaining <= 0

  const Line = ({ label, value, bold, colour }) => (
    <div className="flex justify-between py-0.5">
      <span className={bold ? 'font-bold' : ''}>{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${colour || ''}`}>{value}</span>
    </div>
  )

  return (
    <Modal isOpen={!!receipt} onClose={onClose} title="Payment Receipt" size="md">
      <div className="p-4">
        <div className="receipt-print-area bg-white border border-gray-200 rounded-xl p-4 font-mono text-sm">
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            {settings?.logo_url && (
              <img
                src={settings.logo_url}
                alt=""
                className="h-14 mx-auto mb-2 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <p className="font-black text-base">{settings?.company_name || 'DAN & DOR SOLAR COMPANY LIMITED'}</p>
            {settings?.company_address && <p className="text-xs">{settings.company_address}</p>}
            {settings?.company_phone && <p className="text-xs">Tel: {settings.company_phone}</p>}
            <p className="font-bold mt-2">DEBT PAYMENT RECEIPT</p>
          </div>

          <div className="border-b border-dashed border-gray-300 pb-2 mb-2 text-xs">
            <Line label="Receipt No" value={receipt.receipt_no || '—'} />
            <Line label="Date" value={formatDate(receipt.payment_date)} />
            <Line label="Customer" value={receipt.customer_name || '—'} />
            {receipt.customer_phone && <Line label="Phone" value={receipt.customer_phone} />}
            {receipt.received_by && <Line label="Received by" value={receipt.received_by} />}
            {receipt.payment_method && (
              <Line label="Method" value={String(receipt.payment_method).replace(/_/g, ' ').toUpperCase()} />
            )}
          </div>

          <div className="border-b border-dashed border-gray-300 pb-2 mb-2">
            <Line label="Total owed" value={`${cur}${(receipt.amount_owed || 0).toFixed(2)}`} />
            <Line
              label="Paid before now"
              value={`${cur}${Math.max(0, (receipt.amount_paid || 0) - (receipt.payment_amount || 0)).toFixed(2)}`}
            />
            <div className="border-t border-gray-200 mt-1 pt-1">
              <Line
                label="PAID NOW"
                value={`${cur}${(receipt.payment_amount || 0).toFixed(2)}`}
                bold
                colour="text-green-700"
              />
            </div>
          </div>

          <Line
            label={settled ? 'BALANCE' : 'BALANCE REMAINING'}
            value={`${cur}${remaining.toFixed(2)}`}
            bold
            colour={settled ? 'text-green-700' : 'text-red-600'}
          />

          <div className="text-center border-t border-dashed border-gray-300 mt-3 pt-3 text-xs">
            {settled
              ? <p className="font-bold">PAID IN FULL — THANK YOU</p>
              : <p className="font-bold">BALANCE OF {cur}{remaining.toFixed(2)} STILL DUE</p>}
            <p className="mt-1">Thank you for your payment.</p>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={() => printReceipt(settings?.receipt_width_mm)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            <FiPrinter size={16} /> Print
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

function PaymentModal({ debt, onClose, isOpen, onPaid }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const mutation = useMutation({
    mutationFn: ({ id, data }) => recordDebtPayment(id, data),
    onSuccess: (res) => {
      toast.success('Payment recorded!')
      queryClient.invalidateQueries(['debts'])
      queryClient.invalidateQueries(['debt-summary'])
      reset()
      onClose()
      // Straight to the receipt rather than back to the list: the customer is
      // still standing there waiting for their slip.
      if (res?.data) onPaid(res.data)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to record payment'),
  })

  if (!debt) return null
  const remaining = Math.max(0, (debt.amount_owed || 0) - (debt.amount_paid || 0))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Payment" size="md">
      <div className="p-5 space-y-4">
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Customer:</span>
            <span className="font-semibold">{debt.customer_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Owed:</span>
            <span className="font-bold text-red-600">{formatCurrency(debt.amount_owed || 0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Amount Paid:</span>
            <span className="font-semibold text-green-600">{formatCurrency(debt.amount_paid || 0)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
            <span className="text-gray-700 font-bold">Remaining Balance:</span>
            <span className="font-black text-orange-600 text-lg">{formatCurrency(remaining)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate({ id: debt._id, data: d }))}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Payment Amount (GH₵) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={remaining}
                {...register('amount', {
                  required: 'Amount is required',
                  min: { value: 0.01, message: 'Must be > 0' },
                  max: { value: remaining, message: `Cannot exceed ${formatCurrency(remaining)}` },
                })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="0.00"
              />
              {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                {...register('notes')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Optional notes"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
              >Cancel</button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm"
              >
                {mutation.isPending ? 'Processing...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  )
}

function DebtRow({ debt, onPay, onDelete, onReprint, canDelete }) {
  const [showHistory, setShowHistory] = useState(false)

  const remaining = Math.max(0, (debt.amount_owed || 0) - (debt.amount_paid || 0))
  const dueDateStr = debt.due_date ? debt.due_date.slice(0, 10) : null
  const isOverdue = dueDateStr && debt.status !== 'paid' && isPast(parseISO(dueDateStr))
  const payments = debt.payments || []

  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-gray-50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
        <td className="px-4 py-3">
          <p className="font-semibold text-gray-800">{debt.customer_name}</p>
          <p className="text-xs text-gray-500">{debt.customer_phone}</p>
        </td>
        <td className="px-4 py-3">
          <span className="font-bold text-red-600">{formatCurrency(debt.amount_owed || 0)}</span>
        </td>
        <td className="px-4 py-3">
          <span className="font-semibold text-green-600">{formatCurrency(debt.amount_paid || 0)}</span>
        </td>
        <td className="px-4 py-3">
          <span className="font-black text-orange-600">{formatCurrency(remaining)}</span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-sm ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
            {formatDate(debt.due_date)}
            {isOverdue && <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">OVERDUE</span>}
          </span>
        </td>
        <td className="px-4 py-3"><Badge status={debt.status || 'active'} /></td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            {debt.status !== 'paid' && (
              <button
                onClick={() => onPay(debt)}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 transition-colors"
              >
                Pay
              </button>
            )}
            {payments.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                title="Payment history"
              >
                {showHistory ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(debt)}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                title="Delete this debt"
              >
                <FiTrash2 size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {showHistory && payments.length > 0 && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-gray-50">
            <p className="text-xs font-bold text-gray-600 mb-2">Payment History ({payments.length})</p>
            <div className="space-y-1">
              {payments.map((p) => (
                <div key={p._id} className="flex items-center justify-between gap-2 text-xs text-gray-600 bg-white rounded-lg px-3 py-2">
                  <span>{formatDate(p.payment_date)} — {p.receipt_no || 'Payment'}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-green-600">{formatCurrency(p.amount)}</span>
                    {/* Receipts get lost. Reprinting one rebuilds it from the
                        payment as it was recorded, not from today's balance. */}
                    <button
                      onClick={() => onReprint(debt, p)}
                      title="Print this receipt again"
                      className="p-1 text-gray-400 hover:text-orange-600 rounded"
                    >
                      <FiPrinter size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function Debts() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [payTarget, setPayTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['debts', statusFilter, search, page],
    queryFn: () => getDebts({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      customer: search || undefined,
      page,
      limit: 15,
    }).then(r => r.data),
  })

  const { user } = useAuthStore()

  // The receipt carries the shop's letterhead and prints at the roll width set
  // in Settings, exactly as the POS receipt does.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  // Deleting a debt writes off money owed to the shop, so it is kept to the
  // owners — the same level the server enforces.
  const canDelete = getRoleLevel(user?.role) >= 3
  const queryClient = useQueryClient()

  /**
   * Rebuild a past payment's receipt.
   *
   * "Paid before now" and the balance are recomputed from the payments up to
   * and including this one, not from today's figures — a reprint has to say
   * what the original slip said, or it contradicts the copy the customer is
   * holding.
   */
  const reprint = (debt, payment) => {
    const ordered = [...(debt.payments || [])].sort(
      (a, b) => new Date(a.payment_date) - new Date(b.payment_date)
    )
    const idx = ordered.findIndex(p => p._id === payment._id)
    const paidThrough = ordered
      .slice(0, idx + 1)
      .reduce((sum, p) => sum + (p.amount || 0), 0)

    setReceipt({
      receipt_no: payment.receipt_no,
      payment_date: payment.payment_date,
      payment_amount: payment.amount,
      payment_method: payment.payment_method,
      amount_owed: debt.amount_owed,
      amount_paid: paidThrough,
      customer_name: debt.customer_name,
      customer_phone: debt.customer_phone,
      received_by: payment.recorded_by?.username,
    })
  }

  const removeMutation = useMutation({
    mutationFn: (id) => deleteDebt(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Debt deleted.')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['debt-summary'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not delete the debt.'),
  })

  const { data: summary } = useQuery({
    queryKey: ['debt-summary'],
    queryFn: () => getDebtSummary().then(r => r.data),
  })

  const debts = data?.debts || (Array.isArray(data) ? data : [])

  const totalOutstanding = (summary?.active?.total || 0) + (summary?.overdue?.total || 0)
  const totalDebtors = (summary?.active?.count || 0) + (summary?.overdue?.count || 0)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Debts"
        subtitle="Track customer outstanding balances"
        action={<RefreshButton keys={['debts', 'debt-summary']} />}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard icon={FiAlertCircle} value={formatCurrency(totalOutstanding)} label="Total Outstanding" color="red" />
        <StatCard icon={FiDollarSign} value={totalDebtors} label="Active Debtors" color="orange" />
        <StatCard icon={FiAlertCircle} value={summary?.overdue?.count || 0} label="Overdue" color="red" />
        <StatCard icon={FiDollarSign} value={formatCurrency(summary?.paid?.total || 0)} label="Total Collected" color="green" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by customer name..."
          className="flex-1 min-w-48 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {['all', 'active', 'overdue', 'paid'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-4 py-2 text-sm font-semibold capitalize transition-colors
                ${statusFilter === s ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Customer', 'Total Owed', 'Paid', 'Remaining', 'Due Date', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array(7).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : debts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <p className="text-sm">No debts found</p>
                  </td>
                </tr>
              ) : (
                debts.map(debt => (
                  <DebtRow
                    key={debt._id}
                    debt={debt}
                    onPay={setPayTarget}
                    onDelete={setDeleteTarget}
                    onReprint={reprint}
                    canDelete={canDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaymentModal
        isOpen={!!payTarget}
        debt={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={setReceipt}
      />

      <DebtReceiptModal
        receipt={receipt}
        settings={settings}
        onClose={() => setReceipt(null)}
      />

      {/* Deleting a debt writes off money the shop is owed, so it says exactly
          what is being written off and who owed it before anything happens. */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this debt?"
        size="md"
      >
        {deleteTarget && (
          <div className="p-5 space-y-4">
            <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
              <FiAlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-sm text-red-800">
                <p className="font-bold">{deleteTarget.customer_name}</p>
                <p className="mt-1">
                  {formatCurrency(Math.max(0, (deleteTarget.amount_owed || 0) - (deleteTarget.amount_paid || 0)))}
                  {' '}still owed will no longer be tracked, along with every payment
                  recorded against this debt. This cannot be undone.
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              The original sale is kept — deleting the debt only removes the claim on the
              customer, not the record that the sale happened.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => removeMutation.mutate(deleteTarget._id)}
                disabled={removeMutation.isPending}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm"
              >
                {removeMutation.isPending ? 'Deleting…' : 'Delete debt'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
