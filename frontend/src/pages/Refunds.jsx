import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiRotateCcw, FiSearch, FiTrash2, FiPlus, FiMinus, FiX } from 'react-icons/fi'
import { getRefunds, lookupSaleByInvoice, createRefund, deleteRefund } from '../api/refunds'
import useAuthStore from '../store/authStore'
import { formatCurrency, formatDate, getRoleLevel } from '../utils/helpers'
import Modal from '../components/Modal'

const METHODS = ['cash', 'card', 'mobile_money']
const METHOD_LABELS = { cash: 'Cash', card: 'Card', mobile_money: 'Mobile Money' }

function RefundForm({ onClose, onSuccess }) {
  const { user } = useAuthStore()
  const [invoiceInput, setInvoiceInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [saleItems, setSaleItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('cash')

  const handleLookup = async () => {
    if (!invoiceInput.trim()) return
    setLookupLoading(true)
    try {
      const res = await lookupSaleByInvoice(invoiceInput.trim())
      const sale = res.data
      setCustomerName(sale.customer_name || '')
      setCustomerPhone(sale.customer_phone || '')
      const items = (sale.items || []).map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        unit_price: i.unit_price,
        maxQty: i.quantity,
        quantity: i.quantity,
        total: i.unit_price * i.quantity,
        selected: true,
      }))
      setSaleItems(items)
      setSelectedItems(items)
      const total = items.reduce((s, i) => s + i.total, 0)
      setRefundAmount(total.toFixed(2))
      toast.success('Invoice found — items loaded')
    } catch {
      toast.error('Invoice not found')
      setSaleItems([])
    } finally {
      setLookupLoading(false)
    }
  }

  const toggleItem = (idx) => {
    const updated = selectedItems.map((item, i) =>
      i === idx ? { ...item, selected: !item.selected } : item
    )
    setSelectedItems(updated)
    recalcAmount(updated)
  }

  const updateQty = (idx, qty) => {
    const item = selectedItems[idx]
    const newQty = Math.max(1, Math.min(item.maxQty, qty))
    const updated = selectedItems.map((it, i) =>
      i === idx ? { ...it, quantity: newQty, total: it.unit_price * newQty } : it
    )
    setSelectedItems(updated)
    recalcAmount(updated)
  }

  const recalcAmount = (items) => {
    const total = items.filter(i => i.selected).reduce((s, i) => s + i.total, 0)
    if (total > 0) setRefundAmount(total.toFixed(2))
  }

  const mutation = useMutation({
    mutationFn: createRefund,
    onSuccess: () => {
      toast.success('Refund processed successfully')
      onSuccess()
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to process refund'),
  })

  const handleSubmit = () => {
    if (!customerName.trim()) { toast.error('Customer name is required'); return }
    if (!refundAmount || parseFloat(refundAmount) <= 0) { toast.error('Enter a valid refund amount'); return }
    if (!reason.trim()) { toast.error('Reason is required'); return }

    const itemsToSend = selectedItems.filter(i => i.selected).map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total,
    }))

    mutation.mutate({
      invoice_ref: invoiceInput.trim() || undefined,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || undefined,
      refund_amount: parseFloat(refundAmount),
      reason: reason.trim(),
      refund_method: method,
      items: itemsToSend,
    })
  }

  return (
    <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
      {/* Invoice lookup */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Original Invoice Number (optional)</label>
        <div className="flex gap-2">
          <input
            value={invoiceInput}
            onChange={e => setInvoiceInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
            placeholder="e.g. INV-0001"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading}
            className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-60 flex items-center gap-1.5"
          >
            <FiSearch size={14} />
            {lookupLoading ? 'Looking…' : 'Look Up'}
          </button>
        </div>
      </div>

      {/* Items from invoice */}
      {saleItems.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide">
            Select items to return
          </div>
          {selectedItems.map((item, idx) => (
            <div key={idx} className={`px-4 py-3 flex items-center gap-3 border-b border-gray-100 last:border-0 ${!item.selected ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={item.selected}
                onChange={() => toggleItem(idx)}
                className="w-4 h-4 accent-orange-500"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name}</p>
                <p className="text-xs text-gray-500">{formatCurrency(item.unit_price)} each</p>
              </div>
              {item.selected && (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateQty(idx, item.quantity - 1)} className="w-6 h-6 rounded bg-gray-100 hover:bg-orange-100 flex items-center justify-center">
                    <FiMinus size={11} />
                  </button>
                  <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                  <button onClick={() => updateQty(idx, item.quantity + 1)} disabled={item.quantity >= item.maxQty} className="w-6 h-6 rounded bg-gray-100 hover:bg-orange-100 flex items-center justify-center disabled:opacity-40">
                    <FiPlus size={11} />
                  </button>
                </div>
              )}
              <p className="text-sm font-bold text-orange-600 w-20 text-right">{formatCurrency(item.total)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Customer */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Customer Name *</label>
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Full name"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone (optional)</label>
          <input
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="+233 XXXXXXXXX"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Refund Amount (GH₵) *</label>
        <input
          type="number"
          value={refundAmount}
          onChange={e => setRefundAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Reason */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reason *</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why is this refund being issued?"
          rows={2}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      </div>

      {/* Method */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Refund Method *</label>
        <div className="flex gap-2">
          {METHODS.map(m => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors
                ${method === m ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-orange-50'}`}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Refunded by */}
      <p className="text-xs text-gray-500">Processed by: <span className="font-semibold text-gray-700">{user?.username}</span></p>

      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl font-bold text-sm"
        >
          {mutation.isPending ? 'Processing…' : 'Process Refund'}
        </button>
      </div>
    </div>
  )
}

export default function Refunds() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const userLevel = getRoleLevel(user?.role)
  const canDelete = userLevel >= 3

  const [showForm, setShowForm] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['refunds', dateFrom, dateTo],
    queryFn: () => getRefunds({ startDate: dateFrom || undefined, endDate: dateTo || undefined }).then(r => r.data),
  })

  const refunds = Array.isArray(data) ? data : (data?.refunds || [])
  const totalRefunded = refunds.reduce((s, r) => s + (r.refund_amount || 0), 0)

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRefund(id),
    onSuccess: () => {
      toast.success('Refund deleted and stock reversed')
      queryClient.invalidateQueries({ queryKey: ['refunds'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setDeleteTarget(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">Refunds</h1>
          <p className="text-sm text-gray-500">Track all refunds and returned stock</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors"
        >
          <FiRotateCcw size={15} /> Process Refund
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-orange-700 font-medium">Total Refunded (filtered)</p>
          <p className="text-2xl font-black text-orange-600">{formatCurrency(totalRefunded)}</p>
        </div>
        <p className="text-sm text-orange-600 font-semibold">{refunds.length} record{refunds.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <FiX size={14} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Invoice Ref</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Method</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Refunded By</th>
                {canDelete && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(canDelete ? 8 : 7).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : refunds.length === 0 ? (
                <tr>
                  <td colSpan={canDelete ? 8 : 7} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No refunds recorded yet
                  </td>
                </tr>
              ) : refunds.map(r => (
                <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.refund_date)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{r.customer_name}</p>
                    {r.customer_phone && <p className="text-xs text-gray-500">{r.customer_phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{r.invoice_ref || '—'}</td>
                  <td className="px-4 py-3 font-bold text-red-600">{formatCurrency(r.refund_amount)}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                      {METHOD_LABELS[r.refund_method] || r.refund_method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.reason}</td>
                  <td className="px-4 py-3 text-gray-600">{r.processed_by?.username || '—'}</td>
                  {canDelete && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDeleteTarget(r)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Refund Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Process Refund" size="lg">
        <RefundForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['refunds'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
          }}
        />
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Refund" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Delete refund of <span className="font-bold text-red-600">{formatCurrency(deleteTarget?.refund_amount || 0)}</span> for{' '}
            <span className="font-semibold">{deleteTarget?.customer_name}</span>?
          </p>
          {deleteTarget?.items?.length > 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This will also reverse the stock restoration for {deleteTarget.items.length} item(s).
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold">Cancel</button>
            <button
              onClick={() => deleteMutation.mutate(deleteTarget._id)}
              disabled={deleteMutation.isPending}
              className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-60"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
