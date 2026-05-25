import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiTrash2, FiCheck, FiX } from 'react-icons/fi'
import { getStockRequests, createStockRequest, approveStockRequest, rejectStockRequest } from '../api/stockRequests'
import { getProducts } from '../api/products'
import { formatCurrency, formatDate, getRoleLevel } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import Badge from '../components/Badge'
import ConfirmDialog from '../components/ConfirmDialog'

function CreateRequestModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const { data: productsData } = useQuery({
    queryKey: ['products-for-request'],
    queryFn: () => getProducts({ limit: 200 }).then(r => r.data),
  })
  const products = productsData?.products || productsData || []

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    defaultValues: { items: [{ product: '', quantity: 1, estimatedCost: '' }], notes: '' }
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = watch('items')

  const total = items.reduce((s, i) => s + (parseFloat(i.estimatedCost || 0) * parseFloat(i.quantity || 0)), 0)

  const mutation = useMutation({
    mutationFn: createStockRequest,
    onSuccess: () => {
      toast.success('Stock request submitted!')
      queryClient.invalidateQueries(['stock-requests'])
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to submit'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Stock Request" size="xl">
      <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-5 space-y-4">
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <select
                  {...register(`items.${index}.product`, { required: true })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  {...register(`items.${index}.quantity`, { required: true, min: 1 })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="col-span-4">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Est. cost/unit (GH₵)"
                  {...register(`items.${index}.estimatedCost`)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="col-span-1 flex justify-center">
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(index)} className="text-red-400 hover:text-red-600 p-1">
                    <FiTrash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => append({ product: '', quantity: 1, estimatedCost: '' })}
            className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-semibold"
          >
            <FiPlus size={14} /> Add Item
          </button>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
          <textarea
            {...register('notes')}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            placeholder="Additional notes..."
          />
        </div>

        {total > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="font-semibold text-orange-800">Estimated Total:</span>
            <span className="text-xl font-black text-orange-600">{formatCurrency(total)}</span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold text-sm disabled:opacity-60">
            {mutation.isPending ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function StockRequests() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const userLevel = getRoleLevel(user?.role)
  const canApprove = userLevel >= 3

  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [approveTarget, setApproveTarget] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['stock-requests', statusFilter, page],
    queryFn: () => getStockRequests({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      limit: 15,
    }).then(r => r.data),
  })

  const approveMutation = useMutation({
    mutationFn: (id) => approveStockRequest(id, {}),
    onSuccess: () => {
      toast.success('Request approved!')
      queryClient.invalidateQueries(['stock-requests'])
      setApproveTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Approval failed'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id) => rejectStockRequest(id, {}),
    onSuccess: () => {
      toast.success('Request rejected')
      queryClient.invalidateQueries(['stock-requests'])
      setRejectTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Rejection failed'),
  })

  const requests = data?.requests || data || []

  const columns = [
    {
      header: 'Request',
      key: 'items',
      render: (items, row) => (
        <div>
          <p className="font-semibold text-gray-800">{items?.length || 0} item(s)</p>
          <p className="text-xs text-gray-500 line-clamp-1">{items?.map(i => i.product?.name || i.productName).join(', ')}</p>
        </div>
      ),
    },
    { header: 'Est. Total', key: 'totalAmount', render: v => formatCurrency(v || 0) },
    { header: 'Created By', key: 'requestedBy', render: v => v?.username || '—' },
    { header: 'Date', key: 'createdAt', render: v => formatDate(v) },
    { header: 'Status', key: 'status', render: v => <Badge status={v} /> },
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => {
        if (!canApprove || row.status !== 'pending') return null
        return (
          <div className="flex gap-2">
            <button
              onClick={e => { e.stopPropagation(); setApproveTarget(row) }}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
              title="Approve"
            >
              <FiCheck size={15} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setRejectTarget(row) }}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
              title="Reject"
            >
              <FiX size={15} />
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Stock Requests"
        subtitle="Request and manage inventory restocking"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm"
          >
            <FiPlus size={16} /> New Request
          </button>
        }
      />

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors
              ${statusFilter === s ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <Table
        columns={columns}
        data={requests}
        loading={isLoading}
        emptyMessage="No stock requests found"
        pagination={data?.pagination}
        onPageChange={setPage}
      />

      <CreateRequestModal isOpen={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmDialog
        isOpen={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={() => approveMutation.mutate(approveTarget._id)}
        title="Approve Stock Request"
        message="Are you sure you want to approve this stock request?"
        confirmText="Approve"
        loading={approveMutation.isPending}
      />
      <ConfirmDialog
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => rejectMutation.mutate(rejectTarget._id)}
        title="Reject Stock Request"
        message="Are you sure you want to reject this stock request?"
        confirmText="Reject"
        danger
        loading={rejectMutation.isPending}
      />
    </div>
  )
}
