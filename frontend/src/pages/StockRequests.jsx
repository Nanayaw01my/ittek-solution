import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiTrash2, FiCheck, FiX, FiEye } from 'react-icons/fi'
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

  /**
   * The form works in product ids; the server stores a line of a request —
   * a name, a quantity and a cost. Sending the form's own shape straight up
   * was silently rejected by the database for having no product_name, and
   * every request came back as "Server error".
   */
  const submit = (d) => {
    const lines = (d.items || [])
      .filter((i) => i.product && Number(i.quantity) > 0)
      .map((i) => {
        const product = products.find((p) => String(p._id) === String(i.product))
        const quantity = Number(i.quantity) || 0
        const cost = parseFloat(i.estimatedCost) || 0
        return {
          product_id: i.product,
          product_name: product?.name || 'Unknown product',
          quantity_requested: quantity,
          estimated_cost: cost,
          total: Number((quantity * cost).toFixed(2)),
        }
      })

    if (lines.length === 0) {
      toast.error('Pick a product and a quantity first')
      return
    }
    mutation.mutate({ items: lines, notes: d.notes || undefined })
  }

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
      <form onSubmit={handleSubmit(submit)} className="p-5 space-y-4">
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
  const [viewing, setViewing] = useState(null)
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

  // These read the record's own field names. They used to be camelCase —
  // totalAmount, requestedBy, productName — none of which exist on a stock
  // request, so Est. Total sat at GH0.00 on every row, Created By showed a
  // dash, and the product names never appeared at all.
  const columns = [
    {
      header: 'Request',
      key: 'items',
      render: (items) => (
        <div>
          <p className="font-semibold text-gray-800">{items?.length || 0} item(s)</p>
          <p className="text-xs text-gray-500 line-clamp-1">
            {(items || []).map(i => i.product_name).filter(Boolean).join(', ') || '—'}
          </p>
        </div>
      ),
    },
    { header: 'Est. Total', key: 'total_amount', render: v => formatCurrency(v || 0) },
    { header: 'Created By', key: 'created_by', render: v => v?.username || '—' },
    { header: 'Date', key: 'request_date', render: (v, row) => formatDate(v || row.createdAt) },
    { header: 'Status', key: 'status', render: v => <Badge status={v} /> },
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => (
        <div className="flex gap-2">
          <button
            onClick={e => { e.stopPropagation(); setViewing(row) }}
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
            title="View the request"
          >
            <FiEye size={15} />
          </button>
          {canApprove && row.status === 'pending' && (
            <>
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
            </>
          )}
        </div>
      ),
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

      {/* What was actually asked for. The list can only show a count and a
          total; deciding whether to approve needs the lines themselves. */}
      {viewing && (
        <Modal isOpen onClose={() => setViewing(null)} title="Stock Request" size="md">
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {viewing.created_by?.username || 'Unknown'} asked for {viewing.items?.length || 0} item(s)
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(viewing.request_date || viewing.createdAt)}
                </p>
              </div>
              <Badge status={viewing.status} />
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-[11px] font-bold text-gray-500">
                <span className="col-span-6">PRODUCT</span>
                <span className="col-span-2 text-center">QTY</span>
                <span className="col-span-2 text-right">EACH</span>
                <span className="col-span-2 text-right">TOTAL</span>
              </div>
              {(viewing.items || []).map((i, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-t text-sm">
                  <span className="col-span-6 truncate">{i.product_name}</span>
                  <span className="col-span-2 text-center">{i.quantity_requested}</span>
                  <span className="col-span-2 text-right text-gray-600">
                    {i.estimated_cost ? formatCurrency(i.estimated_cost) : '—'}
                  </span>
                  <span className="col-span-2 text-right font-semibold">
                    {i.total ? formatCurrency(i.total) : '—'}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-orange-800">Estimated total</span>
              <span className="text-xl font-black text-orange-900">
                {formatCurrency(viewing.total_amount || 0)}
              </span>
            </div>

            {viewing.notes && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
                <p className="text-sm text-gray-700">{viewing.notes}</p>
              </div>
            )}

            {viewing.status === 'rejected' && viewing.rejected_reason && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                Rejected: {viewing.rejected_reason}
              </p>
            )}
            {viewing.status === 'approved' && viewing.approved_by && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
                Approved by {viewing.approved_by.username}
                {viewing.approved_date ? ` on ${formatDate(viewing.approved_date)}` : ''}
              </p>
            )}

            {canApprove && viewing.status === 'pending' ? (
              <div className="flex gap-2 pt-2 border-t">
                <button
                  onClick={() => { const r = viewing; setViewing(null); setRejectTarget(r) }}
                  className="flex-1 py-2.5 border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => { const r = viewing; setViewing(null); setApproveTarget(r) }}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm"
                >
                  Approve
                </button>
              </div>
            ) : (
              <button
                onClick={() => setViewing(null)}
                className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
              >
                Close
              </button>
            )}
          </div>
        </Modal>
      )}

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
