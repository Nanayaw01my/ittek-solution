import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiUsers, FiBriefcase, FiPercent } from 'react-icons/fi'
import { getWorkerPayments, createWorkerPayment, deleteWorkerPayment } from '../api/workers'
import { formatCurrency, formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import StatCard from '../components/StatCard'
import ConfirmDialog from '../components/ConfirmDialog'
import { format, startOfMonth } from 'date-fns'

const METHOD_LABELS = { cash: 'Cash', mobile_money: 'Mobile Money', bank_transfer: 'Bank Transfer' }

const METHODS = [['cash', 'Cash'], ['mobile_money', 'Mobile Money'], ['bank_transfer', 'Bank Transfer']]

function PaymentForm({ onSubmit, loading }) {
  // Salary or commission. It decides what the payment is filed as in the
  // accounts, so it is asked first rather than buried in the form.
  const [type, setType] = useState('salary')
  const [method, setMethod] = useState('cash')

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      periodStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      periodEnd: format(new Date(), 'yyyy-MM-dd'),
    }
  })
  const amount = parseFloat(watch('amount')) || 0

  const handleSubmitTransform = (d) => {
    onSubmit({
      worker_name: d.workerName,
      worker_phone: d.phone || undefined,
      payment_type: type,
      commission_rate: type === 'commission' && d.commissionRate
        ? parseFloat(d.commissionRate) : undefined,
      amount_paid: parseFloat(d.amount),
      payment_method: method,
      reference: d.reference || undefined,
      period_start: d.periodStart,
      period_end: d.periodEnd,
      notes: d.notes || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleSubmitTransform)} className="p-5 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">What is this payment for? *</label>
        <div className="grid grid-cols-2 gap-2">
          {[['salary', 'Salary', 'A fixed wage for a period'],
            ['commission', 'Commission', 'A cut of what they sold']].map(([value, label, hint]) => (
            <button
              key={value} type="button" onClick={() => setType(value)}
              className={`p-3 rounded-xl border text-left transition-colors ${
                type === value
                  ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <p className={`font-bold text-sm ${type === value ? 'text-orange-700' : 'text-gray-800'}`}>{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Worker Name *</label>
          <input {...register('workerName', { required: 'Required' })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="Full name" />
          {errors.workerName && <p className="mt-1 text-xs text-red-500">{errors.workerName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
          <input {...register('phone')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="+233 XXX XXX XXX" />
        </div>
        {type === 'commission' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Commission Rate (%)</label>
            <input type="number" step="0.1" min="0" max="100" {...register('commissionRate')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="0" />
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Amount Paid (GH₵) *</label>
          <input type="number" step="0.01" min="0.01" {...register('amount', { required: 'Required' })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="0.00" />
          {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Period Start *</label>
          <input type="date" {...register('periodStart', { required: 'Required' })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Period End *</label>
          <input type="date" {...register('periodEnd', { required: 'Required' })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">How is it being paid? *</label>
        <div className="flex gap-2">
          {METHODS.map(([value, label]) => (
            <button
              key={value} type="button" onClick={() => setMethod(value)}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-colors ${
                method === value
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Reference {method === 'cash' ? '' : '(transaction / cheque no.)'}
          </label>
          <input {...register('reference')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder={method === 'mobile_money' ? 'MoMo transaction id' : 'Optional'} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
          <input {...register('notes')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="Optional" />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        This records money leaving the business. It is filed in Expenses under
        <span className="font-semibold"> {type === 'commission' ? 'Commission' : 'Salaries'}</span>.
      </p>

      <button type="submit" disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        {loading ? 'Paying...' : `Pay ${amount > 0 ? formatCurrency(amount) : ''}`.trim()}
      </button>
    </form>
  )
}

export default function Workers() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['worker-payments', page, typeFilter],
    queryFn: () => getWorkerPayments({
      page, limit: 15, type: typeFilter || undefined,
    }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createWorkerPayment,
    // The axios interceptor unwraps { success, data }, so the server's message
    // does not survive the trip — it is built here from what was submitted.
    onSuccess: (_res, sent) => {
      const kind = sent?.payment_type === 'commission' ? 'Commission' : 'Salary'
      toast.success(`${kind} of ${formatCurrency(sent?.amount_paid || 0)} paid to ${sent?.worker_name}`)
      queryClient.invalidateQueries(['worker-payments'])
      setShowModal(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to record'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteWorkerPayment(id),
    onSuccess: () => {
      toast.success('Payment record deleted')
      queryClient.invalidateQueries(['worker-payments'])
      setDeleteTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const payments = Array.isArray(data) ? data : (data?.payments || [])
  const totalThisMonth = payments.reduce((s, p) => s + (p.amount_paid || 0), 0)
  const salaryTotal = payments
    .filter(p => p.payment_type !== 'commission')
    .reduce((s, p) => s + (p.amount_paid || 0), 0)
  const commissionTotal = payments
    .filter(p => p.payment_type === 'commission')
    .reduce((s, p) => s + (p.amount_paid || 0), 0)

  const columns = [
    { header: 'Worker', key: 'worker_name', render: (v, row) => (
      <div>
        <p className="font-semibold">{v}</p>
        <p className="text-xs text-gray-500">{row.worker_phone}</p>
      </div>
    )},
    { header: 'Type', key: 'payment_type', render: v => (
      <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
        v === 'commission' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      }`}>
        {v === 'commission' ? 'Commission' : 'Salary'}
      </span>
    )},
    { header: 'Rate', key: 'commission_rate', render: (v, row) =>
      row.payment_type === 'commission' && v ? `${v}%` : '—' },
    { header: 'Amount Paid', key: 'amount_paid', render: v => <span className="font-bold text-orange-600">{formatCurrency(v || 0)}</span> },
    { header: 'Paid By', key: 'payment_method', render: (v, row) => (
      <div>
        <p className="text-xs">{METHOD_LABELS[v] || 'Cash'}</p>
        {row.reference && <p className="text-[11px] text-gray-400">{row.reference}</p>}
      </div>
    )},
    { header: 'Period Start', key: 'period_start', render: v => formatDate(v) },
    { header: 'Period End', key: 'period_end', render: v => formatDate(v) },
    { header: 'Date Paid', key: 'payment_date', render: v => formatDate(v) },
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => (
        <button onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}
          className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg">
          Delete
        </button>
      ),
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Worker Payments"
        subtitle="Pay staff their salary or their commission — each filed separately in the accounts"
        action={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm">
            <FiPlus size={16} /> Make Payment
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard icon={FiUsers} value={formatCurrency(totalThisMonth)} label="Total Paid (Showing)" color="orange" />
        <StatCard icon={FiBriefcase} value={formatCurrency(salaryTotal)} label="Salaries" color="blue" />
        <StatCard icon={FiPercent} value={formatCurrency(commissionTotal)} label="Commission" color="purple" />
        <StatCard icon={FiUsers} value={payments.length} label="Payment Records" color="green" />
      </div>

      <div className="flex gap-1 mb-4">
        {[['', 'All'], ['salary', 'Salaries'], ['commission', 'Commission']].map(([value, label]) => (
          <button
            key={value || 'all'}
            onClick={() => { setTypeFilter(value); setPage(1) }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${
              typeFilter === value
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Table
        columns={columns}
        data={payments}
        loading={isLoading}
        emptyMessage="No payment records found"
        pagination={data?.pagination}
        onPageChange={setPage}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Make a Payment" size="lg">
        <PaymentForm loading={createMutation.isPending} onSubmit={d => createMutation.mutate(d)} />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        title="Delete Payment Record"
        message={`Delete payment of ${formatCurrency(deleteTarget?.amount_paid || 0)} for ${deleteTarget?.worker_name}?`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
