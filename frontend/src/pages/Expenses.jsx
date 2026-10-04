import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2, FiDollarSign, FiTruck } from 'react-icons/fi'
import { getExpenses, createExpense, updateExpense, deleteExpense, getExpenseSummary } from '../api/expenses'
import { formatCurrency, formatDate } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import ConfirmDialog from '../components/ConfirmDialog'
import StatCard from '../components/StatCard'
import DateRangePicker from '../components/DateRangePicker'
import { format, startOfMonth } from 'date-fns'
import RefreshButton from '../components/RefreshButton'

import { EXPENSE_CATEGORIES } from '../config/expenseCategories'
import { isOwner } from '../config/pageAccess'

function ExpenseForm({ expense, onSubmit, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: expense
      ? { ...expense, expense_date: expense.expense_date ? expense.expense_date.split('T')[0] : format(new Date(), 'yyyy-MM-dd') }
      : { expense_date: format(new Date(), 'yyyy-MM-dd') }
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Category *</label>
        <select
          {...register('category', { required: 'Category is required' })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        >
          <option value="">Select Category</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Amount (GH₵) *</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          {...register('amount', { required: 'Amount is required', min: { value: 0.01, message: 'Must be > 0' } })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="0.00"
        />
        {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
        <textarea
          {...register('description')}
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          placeholder="What was this expense for?"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Date *</label>
        <input
          type="date"
          {...register('expense_date', { required: 'Date is required' })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        {errors.expense_date && <p className="mt-1 text-xs text-red-500">{errors.expense_date.message}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
      >
        {loading ? 'Saving...' : expense ? 'Update Expense' : 'Add Expense'}
      </button>
    </form>
  )
}

/**
 * Paying the motor rider.
 *
 * It is an ordinary expense underneath — that is the point, because anything
 * written as an Expense is in the day's expenses without a second path to
 * keep in step. What this adds is the three things a delivery run actually
 * has, which a category and a free-text box would leave to whoever is typing:
 * who rode, where to, and for which customer.
 */
function RiderForm({ onSubmit, loading }) {
  const [rider, setRider] = useState('')
  const [destination, setDestination] = useState('')
  const [customer, setCustomer] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const paid = Number(amount)
  const ready = rider.trim() && destination.trim() && paid > 0

  const submit = (e) => {
    e.preventDefault()
    if (!ready) return
    // Composed into the one description field the expense already has, so the
    // run reads back whole on the expenses list and every report that uses it.
    const parts = [rider.trim(), `to ${destination.trim()}`]
    if (customer.trim()) parts.push(`for ${customer.trim()}`)
    onSubmit({
      category: 'Motor Rider',
      amount: paid,
      description: parts.join(' — '),
      expense_date: date,
    })
  }

  const field = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'

  return (
    <form onSubmit={submit} className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Rider *</label>
          <input value={rider} onChange={(e) => setRider(e.target.value)}
            placeholder="Who rode" className={field} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Amount (GH₵) *</label>
          <input type="number" step="0.01" min="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={field} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Where to *</label>
        <input value={destination} onChange={(e) => setDestination(e.target.value)}
          placeholder="Tarkwa" className={field} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Customer <span className="font-normal text-gray-400">— optional</span>
        </label>
        <input value={customer} onChange={(e) => setCustomer(e.target.value)}
          placeholder="Who the delivery was for" className={field} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Date *</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </div>

      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">
        Goes into today's expenses under <span className="font-bold">Motor Rider</span>.
      </p>

      <button
        type="submit" disabled={!ready || loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
      >
        {loading ? 'Saving...' : 'Record rider payment'}
      </button>
    </form>
  )
}

export default function Expenses() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const isManager = user?.role === 'Manager' || isOwner(user?.role)

  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showRider, setShowRider] = useState(false)
  const [editExpense, setEditExpense] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', startDate, endDate, categoryFilter, page],
    queryFn: () => getExpenses({
      startDate,
      endDate,
      category: categoryFilter || undefined,
      page,
      limit: 15,
    }).then(r => r.data),
  })

  const { data: summaryData } = useQuery({
    queryKey: ['expense-summary', startDate, endDate],
    queryFn: () => getExpenseSummary({ startDate, endDate }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      toast.success('Expense recorded!')
      queryClient.invalidateQueries(['expenses'])
      queryClient.invalidateQueries(['expense-summary'])
      // The dashboard's expense total is now stale.
      queryClient.invalidateQueries(['dashboard-stats'])
      setShowModal(false)
      setShowRider(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to record expense'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateExpense(id, data),
    onSuccess: () => {
      toast.success('Expense updated!')
      queryClient.invalidateQueries(['expenses'])
      queryClient.invalidateQueries(['expense-summary'])
      setShowModal(false)
      setEditExpense(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteExpense(id),
    onSuccess: () => {
      toast.success('Expense deleted')
      queryClient.invalidateQueries(['expenses'])
      queryClient.invalidateQueries(['expense-summary'])
      setDeleteTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const expenses = data?.expenses || (Array.isArray(data) ? data : [])
  const summary = summaryData || {}

  const columns = [
    { header: 'Date', key: 'expense_date', render: v => formatDate(v) },
    ...(isManager ? [{ header: 'User', key: 'user_id', render: v => v?.username || '—' }] : []),
    { header: 'Category', key: 'category', render: v => (
      <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-semibold">{v}</span>
    )},
    { header: 'Description', key: 'description', render: v => v || '—' },
    { header: 'Amount', key: 'amount', render: v => (
      <span className="font-bold text-red-600">{formatCurrency(v)}</span>
    )},
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => (
        <div className="flex gap-2">
          {(isManager || row.user_id?._id === user?._id) && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setEditExpense(row); setShowModal(true) }}
                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                <FiEdit2 size={14} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
              >
                <FiTrash2 size={14} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Expenses"
        subtitle="Track and manage business expenses"
        action={
          <div className="flex gap-2">
          <RefreshButton keys={['expenses', 'expense-summary']} />
          <button
            onClick={() => setShowRider(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
          >
            <FiTruck size={16} /> Motor Rider
          </button>
          <button
            onClick={() => { setEditExpense(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            <FiPlus size={16} /> Add Expense
          </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard icon={FiDollarSign} value={formatCurrency(summary.grand_total || 0)} label="Total Expenses" color="red" />
        {(summary.by_category || []).slice(0, 3).map(cat => (
          <StatCard key={cat._id} value={formatCurrency(cat.total)} label={cat._id} color="orange" />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        >
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <Table
        columns={columns}
        data={expenses}
        loading={isLoading}
        emptyMessage="No expenses found"
        pagination={data?.pagination}
        onPageChange={setPage}
      />

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditExpense(null) }}
        title={editExpense ? 'Edit Expense' : 'Add Expense'}
        size="md"
      >
        <ExpenseForm
          expense={editExpense}
          loading={createMutation.isPending || updateMutation.isPending}
          onSubmit={(formData) => {
            if (editExpense) {
              updateMutation.mutate({ id: editExpense._id, data: formData })
            } else {
              createMutation.mutate(formData)
            }
          }}
        />
      </Modal>

      <Modal
        isOpen={showRider}
        onClose={() => setShowRider(false)}
        title="Motor rider payment"
        size="md"
      >
        <RiderForm
          loading={createMutation.isPending}
          onSubmit={(data) => createMutation.mutate(data)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        title="Delete Expense"
        message={`Delete this ${deleteTarget?.category} expense of ${formatCurrency(deleteTarget?.amount || 0)}?`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
