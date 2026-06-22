import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiAlertCircle, FiDollarSign, FiChevronDown, FiChevronUp, FiMessageSquare, FiSend } from 'react-icons/fi'
import { getDebts, recordDebtPayment, getDebtSummary, sendDebtReminder, sendAllDebtReminders } from '../api/debts'
import { formatCurrency, formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import { isPast, parseISO } from 'date-fns'

function PaymentModal({ debt, onClose, isOpen }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const mutation = useMutation({
    mutationFn: ({ id, data }) => recordDebtPayment(id, data),
    onSuccess: () => {
      toast.success('Payment recorded!')
      queryClient.invalidateQueries(['debts'])
      queryClient.invalidateQueries(['debt-summary'])
      reset()
      onClose()
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

function DebtRow({ debt, onPay }) {
  const [showHistory, setShowHistory] = useState(false)
  const [sending, setSending] = useState(false)

  const remaining = Math.max(0, (debt.amount_owed || 0) - (debt.amount_paid || 0))
  const dueDateStr = debt.due_date ? debt.due_date.slice(0, 10) : null
  const isOverdue = dueDateStr && debt.status !== 'paid' && isPast(parseISO(dueDateStr))
  const payments = debt.payments || []
  const canSendSMS = debt.status !== 'paid' && !!debt.customer_phone

  const handleSendSMS = async () => {
    if (!canSendSMS || sending) return
    setSending(true)
    try {
      await sendDebtReminder(debt._id)
      toast.success(`SMS reminder sent to ${debt.customer_name}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send SMS')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-gray-50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-800">{debt.customer_name}</p>
            {debt.credit_agreement_id && (
              <span className="text-[10px] font-bold bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">CREDIT</span>
            )}
          </div>
          <p className="text-xs text-gray-500">{debt.customer_phone || <span className="italic text-gray-300">no phone</span>}</p>
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
          <div className="flex gap-2 flex-wrap">
            {debt.status !== 'paid' && (
              <button
                onClick={() => onPay(debt)}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 transition-colors"
              >
                Pay
              </button>
            )}
            <button
              onClick={handleSendSMS}
              disabled={!canSendSMS || sending}
              title={!debt.customer_phone ? 'No phone number on record' : debt.status === 'paid' ? 'Already paid' : 'Send SMS reminder'}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
                ${canSendSMS
                  ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                  : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'}`}
            >
              <FiMessageSquare size={11} className={sending ? 'animate-pulse' : ''} />
              {sending ? 'Sending…' : 'SMS'}
            </button>
            {payments.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                title="Payment history"
              >
                {showHistory ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
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
                <div key={p._id} className="flex justify-between text-xs text-gray-600 bg-white rounded-lg px-3 py-2">
                  <span>{formatDate(p.payment_date)} — {p.receipt_no || 'Payment'}</span>
                  <span className="font-bold text-green-600">{formatCurrency(p.amount)}</span>
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
  const [page, setPage] = useState(1)
  const [sendingAll, setSendingAll] = useState(false)

  const handleRemindAll = async () => {
    if (sendingAll) return
    setSendingAll(true)
    try {
      const res = await sendAllDebtReminders()
      const { sent, failed, skipped } = res.data?.data || {}
      if (sent > 0) {
        toast.success(`Sent ${sent} SMS reminder${sent !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}`)
      } else if (failed > 0) {
        toast.error(`All ${failed} reminders failed to send`)
      } else {
        toast(`No debtors with phone numbers found`, { icon: 'ℹ️' })
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reminders')
    } finally {
      setSendingAll(false)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['debts', statusFilter, search, page],
    queryFn: () => getDebts({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      customer: search || undefined,
      page,
      limit: 15,
    }).then(r => r.data),
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
      <div className="flex items-start justify-between gap-3 mb-1">
        <PageHeader title="Debts" subtitle="Track customer outstanding balances" />
        <button
          onClick={handleRemindAll}
          disabled={sendingAll}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors flex-shrink-0"
        >
          <FiSend size={14} className={sendingAll ? 'animate-pulse' : ''} />
          {sendingAll ? 'Sending…' : 'Remind All'}
        </button>
      </div>

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
                  <DebtRow key={debt._id} debt={debt} onPay={setPayTarget} />
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
      />
    </div>
  )
}
