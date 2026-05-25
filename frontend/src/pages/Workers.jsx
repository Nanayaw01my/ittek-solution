import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiUsers } from 'react-icons/fi'
import { getWorkerPayments, createWorkerPayment, deleteWorkerPayment } from '../api/workers'
import { formatCurrency, formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import StatCard from '../components/StatCard'
import ConfirmDialog from '../components/ConfirmDialog'
import { format, startOfMonth } from 'date-fns'

function PaymentForm({ onSubmit, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      periodStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      periodEnd: format(new Date(), 'yyyy-MM-dd'),
    }
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
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
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Commission Rate (%)</label>
          <input type="number" step="0.1" min="0" max="100" {...register('commissionRate')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="0" />
        </div>
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
      <button type="submit" disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        {loading ? 'Saving...' : 'Record Payment'}
      </button>
    </form>
  )
}

export default function Workers() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['worker-payments', page],
    queryFn: () => getWorkerPayments({ page, limit: 15 }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createWorkerPayment,
    onSuccess: () => {
      toast.success('Payment recorded!')
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

  const payments = data?.payments || data || []
  const totalThisMonth = payments.reduce((s, p) => s + (p.amount || 0), 0)

  const columns = [
    { header: 'Worker', key: 'workerName', render: (v, row) => (
      <div>
        <p className="font-semibold">{v}</p>
        <p className="text-xs text-gray-500">{row.phone}</p>
      </div>
    )},
    { header: 'Commission Rate', key: 'commissionRate', render: v => v ? `${v}%` : '—' },
    { header: 'Amount Paid', key: 'amount', render: v => <span className="font-bold text-orange-600">{formatCurrency(v)}</span> },
    { header: 'Period Start', key: 'periodStart', render: v => formatDate(v) },
    { header: 'Period End', key: 'periodEnd', render: v => formatDate(v) },
    { header: 'Date Paid', key: 'createdAt', render: v => formatDate(v) },
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
        subtitle="Track commission and salary payments"
        action={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm">
            <FiPlus size={16} /> Record Payment
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard icon={FiUsers} value={formatCurrency(totalThisMonth)} label="Total Paid (Showing)" color="orange" />
        <StatCard icon={FiUsers} value={payments.length} label="Payment Records" color="blue" />
      </div>

      <Table
        columns={columns}
        data={payments}
        loading={isLoading}
        emptyMessage="No payment records found"
        pagination={data?.pagination}
        onPageChange={setPage}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Worker Payment" size="lg">
        <PaymentForm loading={createMutation.isPending} onSubmit={d => createMutation.mutate(d)} />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        title="Delete Payment Record"
        message={`Delete payment of ${formatCurrency(deleteTarget?.amount || 0)} for ${deleteTarget?.workerName}?`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
