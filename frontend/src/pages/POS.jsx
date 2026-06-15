import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  FiSearch, FiPlus, FiMinus, FiTrash2, FiPrinter, FiX,
  FiCheck, FiAlertTriangle, FiShoppingCart, FiShoppingBag,
  FiCreditCard, FiDollarSign
} from 'react-icons/fi'
import { getProducts } from '../api/products'
import { createSale, createShortPayment } from '../api/pos'
import { getSettings } from '../api/settings'
import useAuthStore from '../store/authStore'
import { formatCurrency } from '../utils/helpers'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { queueSale, saveProductsCache, getCachedProducts } from '../utils/offlineQueue'
import Modal from '../components/Modal'
import { format, addDays } from 'date-fns'

const PAYMENT_METHODS = [
  { key: 'Cash', icon: FiDollarSign },
  { key: 'Card', icon: FiCreditCard },
  { key: 'Mobile Money', icon: FiShoppingBag },
]

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, onAdd }) {
  const outOfStock = product.quantity <= 0
  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={`text-left p-3 rounded-xl border-2 transition-all active:scale-95
        ${outOfStock
          ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
          : 'bg-white border-gray-100 hover:border-orange-400 hover:shadow-lg hover:shadow-orange-100 cursor-pointer'
        }`}
    >
      {product.image_url ? (
        <div className="w-full h-20 rounded-lg overflow-hidden mb-2 bg-gray-100">
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-full h-20 rounded-lg mb-2 bg-orange-50 flex items-center justify-center">
          <FiShoppingBag size={24} className="text-orange-200" />
        </div>
      )}
      <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2 mb-1">{product.name}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-sm font-black text-orange-600">{formatCurrency(product.selling_price)}</p>
        {outOfStock
          ? <span className="text-[10px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded font-bold">OUT</span>
          : <span className={`text-[10px] font-semibold ${product.quantity <= (product.low_stock_level || 5) ? 'text-amber-500' : 'text-gray-400'}`}>
              Qty {product.quantity}
            </span>
        }
      </div>
    </button>
  )
}

// ─── Cart Item Row ────────────────────────────────────────────────────────────

function CartItem({ item, index, onUpdateQty, onRemove }) {
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-gray-100 last:border-0">
      {/* Number */}
      <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
        {index + 1}
      </span>

      {/* Thumbnail */}
      {item.image_url ? (
        <img src={item.image_url} alt={item.name} className="w-8 h-8 rounded-lg object-cover border border-gray-100 flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
          <FiShoppingBag size={13} className="text-orange-300" />
        </div>
      )}

      {/* Name & unit price */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-800 truncate leading-tight">{item.name}</p>
        <p className="text-[11px] text-gray-400">{formatCurrency(item.selling_price)} ea</p>
      </div>

      {/* Qty stepper */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onUpdateQty(item._id, item.qty - 1)}
          className="w-6 h-6 rounded-md bg-gray-100 hover:bg-orange-100 hover:text-orange-600 flex items-center justify-center transition-colors"
        >
          <FiMinus size={11} />
        </button>
        <span className="w-6 text-center text-sm font-black text-gray-900">{item.qty}</span>
        <button
          onClick={() => onUpdateQty(item._id, item.qty + 1)}
          disabled={item.qty >= item.quantity}
          className="w-6 h-6 rounded-md bg-gray-100 hover:bg-orange-100 hover:text-orange-600 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FiPlus size={11} />
        </button>
      </div>

      {/* Line total */}
      <p className="text-sm font-black text-gray-900 w-16 text-right flex-shrink-0">
        {formatCurrency(item.selling_price * item.qty)}
      </p>

      {/* Remove */}
      <button
        onClick={() => onRemove(item._id)}
        className="text-gray-300 hover:text-red-500 p-0.5 transition-colors flex-shrink-0"
      >
        <FiTrash2 size={13} />
      </button>
    </div>
  )
}

// ─── Receipt Modal ────────────────────────────────────────────────────────────

function ReceiptModal({ isOpen, onClose, saleData, logoUrl, companyName, companyAddress, companyPhone }) {
  const receiptRef = useRef(null)
  if (!saleData) return null

  const cur = 'GH₵'
  const invoiceNo = saleData.invoice_no || saleData.invoiceNo || saleData._id?.slice(-8).toUpperCase()
  const saleDate = saleData.sale_date || saleData.createdAt
  const cashierName = saleData.user_id?.username || saleData.cashier?.username || saleData.soldBy?.username || 'Staff'
  const items = saleData.items || []
  const subtotal = parseFloat(saleData.subtotal || 0)
  const cartTotal = parseFloat(saleData.cart_total || saleData.grandTotal || saleData.total_amount || 0)
  const discountAmount = Math.max(0, subtotal - cartTotal)
  const amountPaid = parseFloat(saleData.total_amount || saleData.amountPaid || cartTotal)
  const change = parseFloat(saleData.change || 0)
  const balanceDue = parseFloat(saleData.debt_amount || saleData.balanceDue || 0)
  const paymentMethod = (saleData.payment_method || saleData.paymentMethod || '').replace(/_/g, ' ').toUpperCase()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sale Receipt" size="md">
      <div className="p-4">
        <div ref={receiptRef} className="receipt-print-area bg-white border border-gray-200 rounded-xl p-4 font-mono text-sm">
          {/* Header */}
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-14 mx-auto mb-2 object-contain" />}
            <p className="font-black text-base">{companyName || 'DAN & DOR SOLAR COMPANY LIMITED'}</p>
            <p className="text-xs text-gray-500">{companyAddress || 'Bogoso, Western Region'}</p>
            {companyPhone && <p className="text-xs text-gray-500">Tel: {companyPhone}</p>}
            {saleData.offline && (
              <p className="text-xs font-bold text-amber-600 mt-1 border border-amber-300 rounded px-2 py-0.5 inline-block">
                OFFLINE — Pending Sync
              </p>
            )}
          </div>

          {/* Invoice info */}
          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between"><span>Invoice #:</span><span className="font-bold">{invoiceNo}</span></div>
            <div className="flex justify-between"><span>Date:</span><span>{format(new Date(saleDate || new Date()), 'dd/MM/yyyy HH:mm')}</span></div>
            <div className="flex justify-between"><span>Cashier:</span><span>{cashierName}</span></div>
            {(saleData.customer_name || saleData.customer?.name) && (
              <div className="flex justify-between"><span>Customer:</span><span>{saleData.customer_name || saleData.customer?.name}</span></div>
            )}
            {(saleData.customer_phone || saleData.customer?.phone) && (
              <div className="flex justify-between"><span>Tel:</span><span>{saleData.customer_phone || saleData.customer?.phone}</span></div>
            )}
          </div>

          {/* Items */}
          <div className="border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between text-xs font-bold mb-2">
              <span className="flex-1">Item</span>
              <span className="w-8 text-center">Qty</span>
              <span className="w-20 text-right">Price</span>
              <span className="w-20 text-right">Total</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="text-xs mb-1">
                <p className="font-medium">{item.product_name || item.product?.name || item.name}</p>
                <div className="flex justify-between text-gray-600">
                  <span className="flex-1" />
                  <span className="w-8 text-center">{item.quantity}</span>
                  <span className="w-20 text-right">{cur}{parseFloat(item.unit_price || item.unitPrice || 0).toFixed(2)}</span>
                  <span className="w-20 text-right font-bold">{cur}{parseFloat(item.total || (item.quantity * (item.unit_price || item.unitPrice || 0))).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between"><span>Subtotal:</span><span>{cur}{subtotal.toFixed(2)}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-red-600"><span>Discount:</span><span>-{cur}{discountAmount.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between font-black text-base"><span>TOTAL:</span><span>{cur}{cartTotal.toFixed(2)}</span></div>
          </div>

          {/* Payment */}
          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between"><span>Method:</span><span className="font-bold">{paymentMethod}</span></div>
            <div className="flex justify-between"><span>Amount Paid:</span><span className="font-bold">{cur}{amountPaid.toFixed(2)}</span></div>
            {change > 0 && <div className="flex justify-between"><span>Change:</span><span className="font-bold">{cur}{change.toFixed(2)}</span></div>}
            {balanceDue > 0 && (
              <div className="flex justify-between text-red-600 font-bold"><span>BALANCE DUE:</span><span>{cur}{balanceDue.toFixed(2)}</span></div>
            )}
          </div>

          <div className="text-center text-xs text-gray-500">
            <p className="font-semibold">Thank you for your business!</p>
            <p>Powered by ITTEK Solution</p>
          </div>
        </div>

        <div className="flex gap-3 mt-4 no-print">
          <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors">
            <FiPrinter size={16} /> Print
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Short Payment Modal ──────────────────────────────────────────────────────

function ShortPaymentModal({ isOpen, onClose, cartTotal, onConfirm, loading }) {
  const [amountPaid, setAmountPaid] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 21), 'yyyy-MM-dd'))

  const balance = cartTotal - parseFloat(amountPaid || 0)

  const handleConfirm = () => {
    if (!amountPaid || parseFloat(amountPaid) <= 0) { toast.error('Enter amount being paid'); return }
    if (parseFloat(amountPaid) >= cartTotal) { toast.error('For full payment, use Complete Sale'); return }
    if (!customerName.trim()) { toast.error('Customer name required for short payment'); return }
    onConfirm({ amountPaid: parseFloat(amountPaid), customerName, customerPhone, dueDate, balance })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Short / Partial Payment" size="md">
      <div className="p-5 space-y-4">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide mb-1">Total Amount Due</p>
          <p className="text-3xl font-black text-orange-600">{formatCurrency(cartTotal)}</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Amount Being Paid *</label>
          <input
            type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
            placeholder="0.00" min="0" max={cartTotal - 0.01} step="0.01"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:border-orange-500"
          />
        </div>

        {amountPaid && parseFloat(amountPaid) > 0 && parseFloat(amountPaid) < cartTotal && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-xs text-red-500 font-semibold uppercase tracking-wide mb-0.5">Balance Owed</p>
            <p className="text-2xl font-black text-red-600">{formatCurrency(balance)}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Customer Name *</label>
          <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
            placeholder="Full name" className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Customer Phone</label>
          <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
            placeholder="+233 XXXXXXXXX" className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            min={format(new Date(), 'yyyy-MM-dd')} className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500" />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl font-black text-sm transition-colors">
            {loading ? 'Processing…' : 'Confirm Short Payment'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main POS Page ────────────────────────────────────────────────────────────

export default function POS() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const searchRef = useRef(null)
  const isOnline = useOnlineStatus()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [cart, setCart] = useState([])
  const [discountType, setDiscountType] = useState('fixed')
  const [discountValue, setDiscountValue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [showShortModal, setShowShortModal] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastSale, setLastSale] = useState(null)
  const [activeTab, setActiveTab] = useState('products') // mobile only

  useEffect(() => { if (activeTab === 'products') searchRef.current?.focus() }, [activeTab])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const settings = settingsData || {}

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['pos-products', debouncedSearch],
    queryFn: () => getProducts({ limit: 50, ...(debouncedSearch.trim() ? { search: debouncedSearch } : {}) }).then(r => r.data),
    initialData: () => (!debouncedSearch.trim() ? getCachedProducts() || undefined : undefined),
    initialDataUpdatedAt: () => parseInt(localStorage.getItem('ittek_products_cache_time') || '0'),
    staleTime: 30000,
    enabled: isOnline,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const rawProducts = Array.isArray(productsData) ? productsData : (productsData?.products || [])

  useEffect(() => {
    if (isOnline && !debouncedSearch && rawProducts.length > 0) saveProductsCache(rawProducts)
  }, [rawProducts, isOnline, debouncedSearch])

  const offlineCache = !isOnline ? (getCachedProducts() || []) : null
  const products = offlineCache !== null
    ? (debouncedSearch.trim()
        ? offlineCache.filter(p => { const q = debouncedSearch.toLowerCase(); return p.name?.toLowerCase().includes(q) || p.barcode?.includes(q) })
        : offlineCache)
    : rawProducts

  // ── Calculations ──
  const subtotal = cart.reduce((s, i) => s + (i.selling_price || 0) * i.qty, 0)
  const discountAmount = discountType === 'percent'
    ? (subtotal * parseFloat(discountValue || 0)) / 100
    : parseFloat(discountValue || 0)
  const grandTotal = Math.max(0, subtotal - discountAmount)
  const paidAmount = parseFloat(amountPaid || 0)
  const change = Math.max(0, paidAmount - grandTotal)
  const totalItems = cart.reduce((s, i) => s + i.qty, 0)

  // ── Cart actions ──
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const exists = prev.find(i => i._id === product._id)
      if (exists) {
        if (exists.qty >= product.quantity) { toast.error('Not enough stock'); return prev }
        return prev.map(i => i._id === product._id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { ...product, qty: 1 }]
    })
  }, [])

  const updateQty = (id, newQty) => {
    if (newQty <= 0) { removeFromCart(id); return }
    setCart(prev => prev.map(i => {
      if (i._id !== id) return i
      if (newQty > i.quantity) { toast.error('Not enough stock'); return i }
      return { ...i, qty: newQty }
    }))
  }

  const removeFromCart = (id) => setCart(prev => prev.filter(i => i._id !== id))

  const clearCart = () => {
    setCart([])
    setDiscountValue('')
    setAmountPaid('')
    setCustomerName('')
    setCustomerPhone('')
  }

  const buildSalePayload = (extras = {}) => ({
    cart: cart.map(i => ({ product_id: i._id, quantity: i.qty })),
    discount: parseFloat(discountValue) || 0,
    discount_type: discountType === 'percent' ? 'percentage' : 'fixed',
    payment_method: paymentMethod.toLowerCase().replace(' ', '_'),
    customer_name: customerName || extras.customer_name || undefined,
    customer_phone: customerPhone || extras.customer_phone || undefined,
    ...extras,
  })

  const saleMutation = useMutation({
    mutationFn: (data) => createSale(data),
    onSuccess: (res) => {
      setLastSale(res.data)
      setShowReceipt(true)
      clearCart()
      queryClient.invalidateQueries(['pos-products'])
      queryClient.invalidateQueries(['dashboard-stats'])
      toast.success('Sale completed!')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Sale failed'),
  })

  const shortPayMutation = useMutation({
    mutationFn: (data) => createShortPayment(data),
    onSuccess: (res) => {
      setLastSale(res.data?.sale || res.data)
      setShowShortModal(false)
      setShowReceipt(true)
      clearCart()
      queryClient.invalidateQueries(['pos-products'])
      queryClient.invalidateQueries(['dashboard-stats'])
      toast.success('Short payment recorded!')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record short payment'),
  })

  const buildOfflineReceipt = (extras = {}) => ({
    invoiceNo: `OFFLINE-${Date.now()}`,
    items: cart.map(i => ({ name: i.name, quantity: i.qty, unitPrice: i.selling_price, total: i.selling_price * i.qty })),
    subtotal, discount: discountAmount, grandTotal,
    amountPaid: extras.amountPaid ?? paidAmount,
    change: extras.change ?? change,
    paymentMethod, cashier: { username: user?.username },
    createdAt: new Date().toISOString(), offline: true, ...extras,
  })

  const handleCompleteSale = () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return }
    if (paidAmount < grandTotal) { toast.error('Amount paid is less than total. Use Short Payment.'); return }
    const payload = buildSalePayload()
    if (!isOnline) {
      queueSale('sale', payload)
      setLastSale(buildOfflineReceipt())
      setShowReceipt(true)
      clearCart()
      toast.success('Offline sale queued — syncs when reconnected')
      return
    }
    saleMutation.mutate(payload)
  }

  const handleShortPaymentConfirm = ({ amountPaid: ap, customerName: cn, customerPhone: cp }) => {
    const payload = buildSalePayload({ amount_paid: parseFloat(ap), customer_name: cn, customer_phone: cp || undefined })
    if (!isOnline) {
      const paid = parseFloat(ap)
      queueSale('short_payment', payload)
      setLastSale(buildOfflineReceipt({ amountPaid: paid, change: 0, balanceDue: grandTotal - paid }))
      setShowShortModal(false)
      setShowReceipt(true)
      clearCart()
      toast.success('Offline short payment queued')
      return
    }
    shortPayMutation.mutate(payload)
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const exact = products.find(p => p.barcode === searchQuery.trim() || p.name.toLowerCase() === searchQuery.trim().toLowerCase())
      if (exact && exact.quantity > 0) { addToCart(exact); setSearchQuery('') }
    }
  }

  // ── Cart + Checkout panel (shared between desktop sidebar & mobile cart tab) ──
  const CartAndCheckout = (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── SECTION 1: Cart Items ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Cart header */}
        <div className="sticky top-0 bg-white z-10 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiShoppingCart size={15} className="text-orange-500" />
            <span className="font-black text-gray-900 text-sm">Order Items</span>
            {cart.length > 0 && (
              <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {cart.length}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">
              <FiX size={11} /> Clear all
            </button>
          )}
        </div>

        {/* Items list */}
        <div className="px-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-300">
              <FiShoppingCart size={40} className="mb-3" />
              <p className="text-sm font-semibold text-gray-400">No items yet</p>
              <p className="text-xs text-gray-300 mt-1">Tap a product to add it to the order</p>
            </div>
          ) : (
            cart.map((item, index) => (
              <CartItem key={item._id} item={item} index={index} onUpdateQty={updateQty} onRemove={removeFromCart} />
            ))
          )}
        </div>
      </div>

      {/* ── SECTION 2: Checkout ── */}
      <div className="flex-shrink-0 border-t-2 border-gray-100 bg-gray-50">

        {/* Summary */}
        <div className="px-4 pt-3 pb-2 space-y-1.5">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Checkout</p>

          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal <span className="text-gray-400 text-xs">({totalItems} items)</span></span>
            <span className="font-semibold text-gray-700">{formatCurrency(subtotal)}</span>
          </div>

          {/* Discount row */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 flex-shrink-0">Discount</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px] bg-white">
              <button onClick={() => setDiscountType('fixed')}
                className={`px-2 py-1 font-bold transition-colors ${discountType === 'fixed' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                GH₵
              </button>
              <button onClick={() => setDiscountType('percent')}
                className={`px-2 py-1 font-bold transition-colors ${discountType === 'percent' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                %
              </button>
            </div>
            <input
              type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
              placeholder="0" min="0"
              className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {discountAmount > 0 && (
              <span className="text-xs text-red-500 font-bold flex-shrink-0">-{formatCurrency(discountAmount)}</span>
            )}
          </div>

          {/* Grand Total */}
          <div className="flex items-center justify-between bg-orange-500 rounded-xl px-4 py-3 mt-1">
            <span className="font-black text-white text-sm">TOTAL</span>
            <span className="text-2xl font-black text-white">{formatCurrency(grandTotal)}</span>
          </div>
        </div>

        {/* Customer */}
        <div className="px-4 pb-2 grid grid-cols-2 gap-2">
          <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
            placeholder="Customer name"
            className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
          <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>

        {/* Payment method */}
        <div className="px-4 pb-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Payment Method</p>
          <div className="flex gap-1.5">
            {PAYMENT_METHODS.map(({ key, icon: Icon }) => (
              <button key={key} onClick={() => setPaymentMethod(key)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[11px] font-bold transition-all border-2
                  ${paymentMethod === key
                    ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
                  }`}>
                <Icon size={14} />
                {key}
              </button>
            ))}
          </div>
        </div>

        {/* Amount paid */}
        <div className="px-4 pb-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Amount Received</p>
          <div className="flex gap-2 items-center">
            <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
              placeholder="Enter amount paid" min="0" step="0.01"
              className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white focus:outline-none focus:border-orange-500" />
            {change > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-center flex-shrink-0">
                <p className="text-[10px] text-green-600 font-semibold leading-none mb-0.5">Change</p>
                <p className="text-sm font-black text-green-700">{formatCurrency(change)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 space-y-2">
          <button
            onClick={handleCompleteSale}
            disabled={cart.length === 0 || saleMutation.isPending}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-lg shadow-orange-200 disabled:shadow-none"
          >
            {saleMutation.isPending
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
              : <><FiCheck size={16} /> COMPLETE SALE</>
            }
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => { if (cart.length === 0) { toast.error('Cart is empty'); return }; setShowShortModal(true) }}
              disabled={cart.length === 0}
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-colors"
            >
              <FiAlertTriangle size={12} /> SHORT PAYMENT
            </button>
            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              className="flex-1 py-2.5 border-2 border-red-200 text-red-400 hover:bg-red-50 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold rounded-xl text-xs transition-colors"
            >
              CLEAR
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Products panel ──
  const ProductsPanel = (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="p-3 border-b border-gray-200 bg-white flex-shrink-0">
        {!isOnline && (
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <FiAlertTriangle size={13} /> Offline — cached products shown. Sales will sync when reconnected.
          </div>
        )}
        <div className="relative">
          <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search product or scan barcode…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {productsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array(9).fill(0).map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <FiSearch size={32} className="mb-2" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {products.map(p => <ProductCard key={p._id} product={p} onAdd={addToCart} />)}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-gray-100 overflow-hidden">

      {/* ─── MOBILE TAB BAR ─────────────────────────────────── */}
      <div className="lg:hidden flex border-b border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold border-b-2 transition-colors
            ${activeTab === 'products' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          <FiShoppingBag size={15} /> Products
        </button>
        <button
          onClick={() => setActiveTab('cart')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold border-b-2 transition-colors
            ${activeTab === 'cart' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          <FiShoppingCart size={15} />
          Cart
          {cart.length > 0 && (
            <span className="bg-orange-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
              {cart.length}
            </span>
          )}
          {cart.length > 0 && (
            <span className="text-xs text-orange-600 font-black">{formatCurrency(grandTotal)}</span>
          )}
        </button>
      </div>

      {/* ─── MOBILE CONTENT ─────────────────────────────────── */}
      <div className="lg:hidden flex-1 min-h-0 bg-white overflow-hidden">
        <div className={`h-full ${activeTab === 'products' ? 'block' : 'hidden'}`}>
          {ProductsPanel}
        </div>
        <div className={`h-full ${activeTab === 'cart' ? 'block' : 'hidden'}`}>
          {CartAndCheckout}
        </div>
      </div>

      {/* ─── DESKTOP SPLIT VIEW ─────────────────────────────── */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Products */}
        <div className="flex-1 bg-white border-r border-gray-200 min-h-0">
          {ProductsPanel}
        </div>
        {/* Right: Cart + Checkout */}
        <div className="w-[400px] flex-shrink-0 bg-white min-h-0">
          {CartAndCheckout}
        </div>
      </div>

      {/* ─── MODALS ─────────────────────────────────────────── */}
      <ShortPaymentModal
        isOpen={showShortModal}
        onClose={() => setShowShortModal(false)}
        cartTotal={grandTotal}
        onConfirm={handleShortPaymentConfirm}
        loading={shortPayMutation.isPending}
      />
      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        saleData={lastSale}
        logoUrl={settings.logo_url}
        companyName={settings.company_name}
        companyAddress={settings.company_address}
        companyPhone={settings.company_phone}
      />
    </div>
  )
}
