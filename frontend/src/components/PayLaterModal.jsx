import React, { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, addDays } from 'date-fns'
import { FiPackage, FiCalendar } from 'react-icons/fi'
import Modal from './Modal'
import { formatCurrency } from '../utils/helpers'
import { createLayaway } from '../api/layaways'

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'biweekly', label: 'Every 2 weeks', days: 14 },
  { value: 'monthly', label: 'Monthly', days: 30 },
]

/**
 * "Pay & Pick Later" — the customer pays in instalments and collects the goods
 * once the balance reaches zero.
 *
 * The stock is deducted the moment this is created, so the reserved items can't
 * be sold to somebody else while the customer is still paying.
 */
export default function PayLaterModal({ isOpen, onClose, cart, cartTotal, onCreated }) {
  const queryClient = useQueryClient()
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [downPayment, setDownPayment] = useState('')
  const [installments, setInstallments] = useState(4)
  const [frequency, setFrequency] = useState('weekly')
  const [method, setMethod] = useState('cash')

  const down = Math.min(parseFloat(downPayment) || 0, cartTotal)
  const balance = Math.max(0, cartTotal - down)
  const perInstalment = installments > 0 ? balance / installments : 0

  // Preview the dates so the customer can be told exactly when to come back.
  const schedule = useMemo(() => {
    const days = FREQUENCIES.find((f) => f.value === frequency)?.days || 7
    return Array.from({ length: Math.min(installments, 12) }, (_, i) => ({
      date: addDays(new Date(), (i + 1) * days),
      amount: i === installments - 1 ? balance - perInstalment * (installments - 1) : perInstalment,
    }))
  }, [installments, frequency, balance, perInstalment])

  const mutation = useMutation({
    mutationFn: (data) => createLayaway(data),
    onSuccess: (res) => {
      const ref = res.data?.reference
      toast.success(ref ? `Layaway ${ref} created — goods reserved` : 'Layaway created')
      queryClient.invalidateQueries({ queryKey: ['layaways'] })
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      onCreated?.(res.data)
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not create layaway'),
  })

  const handleSubmit = () => {
    if (!customerName.trim()) return toast.error('Customer name is required')
    if (!customerPhone.trim()) return toast.error('Customer phone is required')
    if (down >= cartTotal) return toast.error('Down payment covers the full amount — use Complete Sale instead')

    mutation.mutate({
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      cart: cart.map((i) => ({ product_id: i._id, variant_sku: i.variant_sku, quantity: i.qty })),
      down_payment: down,
      installments: Number(installments),
      frequency,
      payment_method: method,
    })
  }

  const field = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pay & Pick Later" size="md">
      <div className="p-5 space-y-4">

        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-start gap-2">
          <FiPackage size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-teal-800">
            The goods are reserved now and held by the shop. The customer collects them once the
            balance is fully paid.
          </p>
        </div>

        <div className="flex items-baseline justify-between bg-gray-50 rounded-xl px-4 py-3">
          <span className="text-sm text-gray-600">Goods total</span>
          <span className="text-2xl font-black text-gray-900">{formatCurrency(cartTotal)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Customer Name *</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Full name" className={field} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Phone *</label>
            <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="0598565277" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Down Payment</label>
            <input type="number" value={downPayment} onChange={(e) => setDownPayment(e.target.value)}
              placeholder="0.00" min="0" max={cartTotal} step="0.01" className={field} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Instalments</label>
            <input type="number" value={installments}
              onChange={(e) => setInstallments(Math.max(1, parseInt(e.target.value) || 1))}
              min="1" max="52" className={field} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={field}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        {down > 0 && (
          <div className="flex gap-1">
            {['cash', 'card', 'mobile_money'].map((m) => (
              <button key={m} onClick={() => setMethod(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-colors ${
                  method === m ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-teal-50'
                }`}>
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}

        <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
          <div className="flex justify-between px-4 py-2 text-sm">
            <span className="text-gray-600">Paid today</span>
            <span className="font-bold text-green-600">{formatCurrency(down)}</span>
          </div>
          <div className="flex justify-between px-4 py-2 text-sm">
            <span className="text-gray-600">Balance to pay</span>
            <span className="font-black text-red-600">{formatCurrency(balance)}</span>
          </div>
          <div className="flex justify-between px-4 py-2 text-sm">
            <span className="text-gray-600">{installments} × {FREQUENCIES.find(f => f.value === frequency)?.label.toLowerCase()}</span>
            <span className="font-bold text-gray-900">{formatCurrency(perInstalment)} each</span>
          </div>
        </div>

        {balance > 0 && (
          <div>
            <p className="flex items-center gap-1 text-xs font-bold text-gray-500 uppercase mb-1.5">
              <FiCalendar size={12} /> Payment schedule
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {schedule.map((s, i) => (
                <div key={i} className="flex justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                  <span className="text-gray-600">{format(s.date, 'dd MMM yyyy')}</span>
                  <span className="font-semibold text-gray-800">{formatCurrency(s.amount)}</span>
                </div>
              ))}
              {installments > 12 && (
                <p className="text-[11px] text-gray-400 text-center pt-1">
                  …and {installments - 12} more
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors">
            {mutation.isPending ? 'Reserving…' : 'Reserve Goods'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
