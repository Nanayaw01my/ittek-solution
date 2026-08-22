import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, addDays } from 'date-fns'
import {
  FiUser, FiShoppingBag, FiDollarSign, FiSearch, FiPlus, FiMinus,
  FiTrash2, FiArrowRight, FiArrowLeft, FiCheck,
} from 'react-icons/fi'
import Modal from './Modal'
import { formatCurrency } from '../utils/helpers'
import { getProducts } from '../api/products'
import { createLayaway } from '../api/layaways'

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'biweekly', label: 'Every 2 weeks', days: 14 },
  { value: 'monthly', label: 'Monthly', days: 30 },
]

const STEPS = [
  { n: 1, label: 'Customer', icon: FiUser },
  { n: 2, label: 'Goods', icon: FiShoppingBag },
  { n: 3, label: 'Payment Plan', icon: FiDollarSign },
]

/**
 * Pay & Pick Later, taken in the order the shop actually works:
 *   1. the customer is signed up and their details recorded,
 *   2. they choose what they want,
 *   3. the price is agreed and a payment plan set.
 *
 * The POS has a cart-first shortcut for when someone has already picked their
 * goods; this is the counter conversation version.
 */
export default function LayawayWizard({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)

  // Step 1 — customer
  const [customer, setCustomer] = useState({
    name: '', phone: '', address: '', idType: 'Ghana Card', idNumber: '', notes: '',
  })

  // Step 2 — goods
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState([])

  // Step 3 — plan
  const [downPayment, setDownPayment] = useState('')
  const [installments, setInstallments] = useState(4)
  const [frequency, setFrequency] = useState('weekly')
  const [method, setMethod] = useState('cash')

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['layaway-products', search],
    queryFn: () => getProducts({ limit: 40, ...(search.trim() ? { search } : {}) }).then((r) => r.data),
    enabled: isOpen && step === 2,
    staleTime: 30000,
  })
  const products = Array.isArray(productsData) ? productsData : productsData?.products || []

  const total = useMemo(
    () => picked.reduce((sum, p) => sum + p.unit_price * p.qty, 0),
    [picked]
  )
  const down = Math.min(parseFloat(downPayment) || 0, total)
  const balance = Math.max(0, total - down)
  const perInstalment = installments > 0 ? balance / installments : 0

  const schedule = useMemo(() => {
    const days = FREQUENCIES.find((f) => f.value === frequency)?.days || 7
    return Array.from({ length: Math.min(installments, 8) }, (_, i) => ({
      date: addDays(new Date(), (i + 1) * days),
      amount: i === installments - 1 ? balance - perInstalment * (installments - 1) : perInstalment,
    }))
  }, [installments, frequency, balance, perInstalment])

  const addProduct = (product, variant = null) => {
    const key = variant ? `${product._id}:${variant.sku}` : product._id
    const stock = variant ? variant.quantity : product.quantity
    if (stock <= 0) return toast.error('Out of stock')

    setPicked((prev) => {
      const found = prev.find((p) => p.key === key)
      if (found) {
        if (found.qty >= stock) { toast.error('Not enough stock'); return prev }
        return prev.map((p) => (p.key === key ? { ...p, qty: p.qty + 1 } : p))
      }
      return [...prev, {
        key,
        product_id: product._id,
        variant_sku: variant?.sku,
        name: variant ? `${product.name} — ${variant.name}` : product.name,
        unit_price: variant ? variant.selling_price : product.selling_price,
        stock,
        qty: 1,
      }]
    })
  }

  const changeQty = (key, delta) => {
    setPicked((prev) => prev.flatMap((p) => {
      if (p.key !== key) return [p]
      const qty = p.qty + delta
      if (qty <= 0) return []
      if (qty > p.stock) { toast.error('Not enough stock'); return [p] }
      return [{ ...p, qty }]
    }))
  }

  const reset = () => {
    setStep(1)
    setCustomer({ name: '', phone: '', address: '', idType: 'Ghana Card', idNumber: '', notes: '' })
    setPicked([]); setSearch(''); setDownPayment(''); setInstallments(4)
    setFrequency('weekly'); setMethod('cash')
  }

  const mutation = useMutation({
    mutationFn: (data) => createLayaway(data),
    onSuccess: (res) => {
      toast.success(`Layaway ${res.data?.reference || ''} created — goods reserved`)
      queryClient.invalidateQueries({ queryKey: ['layaways'] })
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      reset()
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not create layaway'),
  })

  const canLeaveStep1 = customer.name.trim() && customer.phone.trim()
  const canLeaveStep2 = picked.length > 0

  const submit = () => {
    if (down >= total) return toast.error('Down payment covers everything — record it as a normal sale instead')
    mutation.mutate({
      customer_name: customer.name.trim(),
      customer_phone: customer.phone.trim(),
      customer_address: customer.address.trim() || undefined,
      customer_id_type: customer.idType || undefined,
      customer_id_number: customer.idNumber.trim() || undefined,
      notes: customer.notes.trim() || undefined,
      cart: picked.map((p) => ({ product_id: p.product_id, variant_sku: p.variant_sku, quantity: p.qty })),
      down_payment: down,
      installments: Number(installments),
      frequency,
      payment_method: method,
    })
  }

  const field = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500'
  const label = 'block text-xs font-bold text-gray-600 mb-1'

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose() }} title="New Pay & Pick Later Agreement" size="lg">
      <div className="p-5 space-y-4">

        {/* Steps */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = step > s.n
            const active = step === s.n
            return (
              <React.Fragment key={s.n}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  active ? 'bg-teal-600 text-white' : done ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {done ? <FiCheck size={13} /> : <Icon size={13} />} {s.label}
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${done ? 'bg-teal-300' : 'bg-gray-200'}`} />}
              </React.Fragment>
            )
          })}
        </div>

        {/* ── Step 1: customer details ── */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Record who you are dealing with. These details print on the agreement and are what let you
              follow up if payments stop.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Full Name *</label>
                <input type="text" value={customer.name} className={field}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Kwabena Osei" />
              </div>
              <div>
                <label className={label}>Phone *</label>
                <input type="tel" value={customer.phone} className={field}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="0598565277" />
              </div>
            </div>
            <div>
              <label className={label}>Address / Location</label>
              <input type="text" value={customer.address} className={field}
                onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                placeholder="House No. 42, Bogoso Junction" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>ID Type</label>
                <select value={customer.idType} className={field}
                  onChange={(e) => setCustomer({ ...customer, idType: e.target.value })}>
                  {['Ghana Card', 'Voter ID', 'Passport', 'Driver’s Licence', 'Other'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>ID Number</label>
                <input type="text" value={customer.idNumber} className={field}
                  onChange={(e) => setCustomer({ ...customer, idNumber: e.target.value })}
                  placeholder="GHA-123456789-0" />
              </div>
            </div>
            <div>
              <label className={label}>Notes</label>
              <textarea rows={2} value={customer.notes} className={field}
                onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
                placeholder="Anything worth remembering about this agreement" />
            </div>
          </div>
        )}

        {/* ── Step 2: choose goods ── */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="relative">
              <FiSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…" className={`${field} pl-9`} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
              {productsLoading ? (
                <p className="col-span-full text-center text-xs text-gray-400 py-6">Loading…</p>
              ) : products.length === 0 ? (
                <p className="col-span-full text-center text-xs text-gray-400 py-6">No products found</p>
              ) : products.map((p) => (
                p.has_variants ? (
                  (p.variants || []).filter((v) => v.is_active !== false).map((v) => (
                    <button key={`${p._id}:${v.sku}`} onClick={() => addProduct(p, v)}
                      disabled={v.quantity <= 0}
                      className="text-left p-2 rounded-xl border border-gray-200 hover:border-teal-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      <p className="text-xs font-semibold text-gray-800 leading-tight">{p.name}</p>
                      <p className="text-[11px] text-gray-500">{v.name}</p>
                      <p className="text-xs font-black text-teal-600 mt-1">{formatCurrency(v.selling_price)}</p>
                      <p className="text-[10px] text-gray-400">Qty: {v.quantity}</p>
                    </button>
                  ))
                ) : (
                  <button key={p._id} onClick={() => addProduct(p)} disabled={p.quantity <= 0}
                    className="text-left p-2 rounded-xl border border-gray-200 hover:border-teal-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-xs font-black text-teal-600 mt-1">{formatCurrency(p.selling_price)}</p>
                    <p className="text-[10px] text-gray-400">Qty: {p.quantity}</p>
                  </button>
                )
              ))}
            </div>

            <div className="border border-gray-200 rounded-xl">
              <div className="px-3 py-2 border-b border-gray-100 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-600 uppercase">Chosen goods</span>
                <span className="text-sm font-black text-teal-700">{formatCurrency(total)}</span>
              </div>
              {picked.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-5">Nothing chosen yet</p>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                  {picked.map((p) => (
                    <div key={p.key} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{p.name}</p>
                        <p className="text-[11px] text-gray-500">{formatCurrency(p.unit_price)} each</p>
                      </div>
                      <button onClick={() => changeQty(p.key, -1)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-teal-100 flex items-center justify-center">
                        <FiMinus size={11} />
                      </button>
                      <span className="w-6 text-center text-xs font-bold">{p.qty}</span>
                      <button onClick={() => changeQty(p.key, 1)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-teal-100 flex items-center justify-center">
                        <FiPlus size={11} />
                      </button>
                      <span className="w-20 text-right text-xs font-bold">{formatCurrency(p.unit_price * p.qty)}</span>
                      <button onClick={() => setPicked((prev) => prev.filter((x) => x.key !== p.key))}
                        className="text-red-400 hover:text-red-600">
                        <FiTrash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: price and plan ── */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
              <p className="text-xs text-teal-700">{customer.name} · {customer.phone}</p>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-sm text-teal-800">Price of goods</span>
                <span className="text-2xl font-black text-teal-900">{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={label}>Paying today</label>
                <input type="number" value={downPayment} onChange={(e) => setDownPayment(e.target.value)}
                  placeholder="0.00" min="0" max={total} step="0.01" className={field} />
              </div>
              <div>
                <label className={label}>Instalments</label>
                <input type="number" value={installments} min="1" max="52" className={field}
                  onChange={(e) => setInstallments(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div>
                <label className={label}>How often</label>
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
                      method === m ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-teal-50'
                    }`}>
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}

            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 text-sm">
              <div className="flex justify-between px-4 py-2">
                <span className="text-gray-600">Paid today</span>
                <span className="font-bold text-green-600">{formatCurrency(down)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-gray-600">Balance to pay</span>
                <span className="font-black text-red-600">{formatCurrency(balance)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-gray-600">
                  {installments} payments, {FREQUENCIES.find((f) => f.value === frequency)?.label.toLowerCase()}
                </span>
                <span className="font-bold">{formatCurrency(perInstalment)} each</span>
              </div>
            </div>

            {balance > 0 && (
              <div className="max-h-28 overflow-y-auto space-y-1">
                {schedule.map((s, i) => (
                  <div key={i} className="flex justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                    <span className="text-gray-600">{format(s.date, 'dd MMM yyyy')}</span>
                    <span className="font-semibold">{formatCurrency(s.amount)}</span>
                  </div>
                ))}
                {installments > 8 && (
                  <p className="text-[11px] text-gray-400 text-center">…and {installments - 8} more</p>
                )}
              </div>
            )}

            <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              The goods are reserved and held by the shop from now. They are handed over once the balance
              reaches zero.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 pt-1">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)}
              className="flex items-center justify-center gap-1 px-4 py-3 border border-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-50">
              <FiArrowLeft size={14} /> Back
            </button>
          ) : (
            <button onClick={() => { reset(); onClose() }}
              className="px-4 py-3 border border-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-50">
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1 && !canLeaveStep1) return toast.error('Name and phone are required')
                if (step === 2 && !canLeaveStep2) return toast.error('Choose at least one item')
                setStep(step + 1)
              }}
              className="flex-1 flex items-center justify-center gap-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm">
              Continue <FiArrowRight size={14} />
            </button>
          ) : (
            <button onClick={submit} disabled={mutation.isPending}
              className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm">
              {mutation.isPending ? 'Reserving…' : 'Create Agreement & Reserve Goods'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
