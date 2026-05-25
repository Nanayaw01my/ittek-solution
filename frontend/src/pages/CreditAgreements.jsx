import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEye, FiDownload, FiDollarSign } from 'react-icons/fi'
import {
  getCreditAgreements, createCreditAgreement, recordCreditPayment, getCreditPayments, generateCreditPDF
} from '../api/creditAgreements'
import { formatCurrency, formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import Badge from '../components/Badge'
import { format, addDays } from 'date-fns'
import { saveAs } from 'file-saver'

function AgreementForm({ onSubmit, loading }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      startDate: format(new Date(), 'yyyy-MM-dd'),
      interestRate: 0,
    }
  })
  const totalAmount = parseFloat(watch('totalAmount') || 0)
  const downPayment = parseFloat(watch('downPayment') || 0)
  const startDate = watch('startDate')
  const interestRate = parseFloat(watch('interestRate') || 0)

  const remaining = totalAmount - downPayment
  const withInterest = remaining * (1 + interestRate / 100)
  const weeklyInstallment = withInterest / 3
  const endDate = startDate ? format(addDays(new Date(startDate), 21), 'yyyy-MM-dd') : '—'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-5">
      {/* Customer Info */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-3 border-b pb-2">Customer Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label>
            <input {...register('customerName', { required: 'Required' })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Customer full name" />
            {errors.customerName && <p className="mt-1 text-xs text-red-500">{errors.customerName.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone *</label>
            <input {...register('customerPhone', { required: 'Required' })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="+233 XXX XXX XXX" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Address</label>
            <input {...register('customerAddress')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Customer address" />
          </div>
        </div>
      </div>

      {/* Guarantor */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-3 border-b pb-2">Guarantor Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Guarantor Name *</label>
            <input {...register('guarantorName', { required: 'Required' })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Guarantor full name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Guarantor Phone *</label>
            <input {...register('guarantorPhone', { required: 'Required' })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="+233 XXX XXX XXX" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Guarantor Address</label>
            <input {...register('guarantorAddress')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Guarantor address" />
          </div>
        </div>
      </div>

      {/* Product & Financials */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-3 border-b pb-2">Product & Financials</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Product Description *</label>
            <textarea {...register('productDescription', { required: 'Required' })} rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              placeholder="Describe the product(s)" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Total Amount (GH₵) *</label>
            <input type="number" step="0.01" min="0.01" {...register('totalAmount', { required: 'Required' })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Down Payment (GH₵) *</label>
            <input type="number" step="0.01" min="0" {...register('downPayment', { required: 'Required' })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Interest Rate (%)</label>
            <input type="number" step="0.1" min="0" max="100" {...register('interestRate')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date *</label>
            <input type="date" {...register('startDate', { required: 'Required' })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>

        {/* Summary */}
        {totalAmount > 0 && (
          <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-orange-700 text-xs">Remaining Balance</p>
              <p className="font-black text-orange-800">{formatCurrency(remaining)}</p>
            </div>
            <div>
              <p className="text-orange-700 text-xs">With Interest</p>
              <p className="font-black text-orange-800">{formatCurrency(withInterest)}</p>
            </div>
            <div>
              <p className="text-orange-700 text-xs">Weekly Installment (3 weeks)</p>
              <p className="font-black text-orange-800">{formatCurrency(weeklyInstallment)}</p>
            </div>
            <div>
              <p className="text-orange-700 text-xs">End Date</p>
              <p className="font-black text-orange-800">{endDate}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading}
          className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
          {loading ? 'Creating...' : 'Create Agreement'}
        </button>
      </div>
    </form>
  )
}

function ViewAgreementModal({ agreement, isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [payAmount, setPayAmount] = useState('')
  const { data: paymentsData } = useQuery({
    queryKey: ['credit-payments', agreement?._id],
    queryFn: () => getCreditPayments(agreement._id).then(r => r.data),
    enabled: !!agreement && isOpen,
  })

  const payMutation = useMutation({
    mutationFn: ({ id, data }) => recordCreditPayment(id, data),
    onSuccess: () => {
      toast.success('Payment recorded!')
      queryClient.invalidateQueries(['credit-agreements'])
      queryClient.invalidateQueries(['credit-payments', agreement._id])
      setPayAmount('')
    },
    onError: err => toast.error(err.response?.data?.message || 'Payment failed'),
  })

  const handlePDF = async () => {
    try {
      const res = await generateCreditPDF(agreement._id)
      const blob = new Blob([res.data], { type: 'application/pdf' })
      saveAs(blob, `credit-agreement-${agreement._id?.slice(-8)}.pdf`)
      toast.success('PDF downloaded!')
    } catch {
      toast.error('Failed to generate PDF')
    }
  }

  if (!agreement) return null
  const remaining = agreement.totalAmount - (agreement.downPayment || 0) - (agreement.amountPaid || 0)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Credit Agreement Details" size="lg">
      <div className="p-5 space-y-5">
        {/* Header info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Customer</p>
            <p className="font-bold">{agreement.customer?.name || agreement.customerName}</p>
            <p className="text-gray-600">{agreement.customer?.phone || agreement.customerPhone}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Guarantor</p>
            <p className="font-bold">{agreement.guarantorName}</p>
            <p className="text-gray-600">{agreement.guarantorPhone}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-600">Total Amount</p>
            <p className="font-black text-blue-800">{formatCurrency(agreement.totalAmount)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-xs text-green-600">Down Payment</p>
            <p className="font-black text-green-800">{formatCurrency(agreement.downPayment)}</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-xs text-orange-600">Amount Paid</p>
            <p className="font-black text-orange-800">{formatCurrency(agreement.amountPaid || 0)}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xs text-red-600">Remaining</p>
            <p className="font-black text-red-800">{formatCurrency(remaining)}</p>
          </div>
        </div>

        <div className="text-sm text-gray-700">
          <p><strong>Product:</strong> {agreement.productDescription}</p>
          <p className="mt-1"><strong>Status:</strong> <Badge status={agreement.status} /></p>
          <p className="mt-1"><strong>End Date:</strong> {formatDate(agreement.endDate)}</p>
        </div>

        {/* Make payment */}
        {agreement.status !== 'paid' && remaining > 0 && (
          <div className="border border-orange-200 rounded-xl p-4">
            <p className="text-sm font-bold text-gray-700 mb-3">Record Payment</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="Amount (GH₵)"
                min="0.01"
                max={remaining}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={() => {
                  if (!payAmount || parseFloat(payAmount) <= 0) { toast.error('Enter amount'); return }
                  payMutation.mutate({ id: agreement._id, data: { amount: parseFloat(payAmount) } })
                }}
                disabled={payMutation.isPending}
                className="px-4 py-2 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 disabled:opacity-60"
              >
                {payMutation.isPending ? '...' : 'Pay'}
              </button>
            </div>
          </div>
        )}

        {/* Payment History */}
        {paymentsData?.payments?.length > 0 && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Payment History</p>
            <div className="space-y-2">
              {paymentsData.payments.map((p, i) => (
                <div key={i} className="flex justify-between items-center text-sm bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-gray-600">{formatDate(p.date)}</span>
                  <span className="font-bold text-green-600">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handlePDF}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-orange-500 text-orange-600 rounded-xl font-bold text-sm hover:bg-orange-50 transition-colors"
        >
          <FiDownload size={16} /> Download Agreement PDF
        </button>
      </div>
    </Modal>
  )
}

export default function CreditAgreements() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [viewAgreement, setViewAgreement] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['credit-agreements', search, page],
    queryFn: () => getCreditAgreements({ search: search || undefined, page, limit: 15 }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createCreditAgreement,
    onSuccess: () => {
      toast.success('Credit agreement created!')
      queryClient.invalidateQueries(['credit-agreements'])
      setShowCreate(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to create'),
  })

  const agreements = data?.agreements || data || []

  const columns = [
    {
      header: 'Customer',
      key: 'customer',
      render: (v, row) => (
        <div>
          <p className="font-semibold">{v?.name || row.customerName}</p>
          <p className="text-xs text-gray-500">{v?.phone || row.customerPhone}</p>
        </div>
      ),
    },
    { header: 'Total', key: 'totalAmount', render: v => formatCurrency(v) },
    { header: 'Down Payment', key: 'downPayment', render: v => formatCurrency(v) },
    {
      header: 'Remaining',
      key: '_id',
      render: (_, row) => (
        <span className="font-bold text-orange-600">
          {formatCurrency(row.totalAmount - (row.downPayment || 0) - (row.amountPaid || 0))}
        </span>
      ),
    },
    { header: 'End Date', key: 'endDate', render: v => formatDate(v) },
    { header: 'Status', key: 'status', render: v => <Badge status={v} /> },
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => (
        <button
          onClick={e => { e.stopPropagation(); setViewAgreement(row) }}
          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
        >
          <FiEye size={14} />
        </button>
      ),
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Credit Agreements"
        subtitle="Manage installment credit agreements"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm"
          >
            <FiPlus size={16} /> New Agreement
          </button>
        }
      />

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer name..."
          className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <Table
        columns={columns}
        data={agreements}
        loading={isLoading}
        emptyMessage="No credit agreements found"
        pagination={data?.pagination}
        onPageChange={setPage}
        onRowClick={setViewAgreement}
      />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Credit Agreement" size="2xl">
        <AgreementForm
          loading={createMutation.isPending}
          onSubmit={d => createMutation.mutate(d)}
        />
      </Modal>

      <ViewAgreementModal
        isOpen={!!viewAgreement}
        agreement={viewAgreement}
        onClose={() => setViewAgreement(null)}
      />
    </div>
  )
}
