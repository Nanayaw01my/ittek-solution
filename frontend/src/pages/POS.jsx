import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiSearch, FiPlus, FiMinus, FiTrash2, FiPrinter, FiDownload, FiX, FiCheck, FiAlertTriangle, FiShoppingCart } from 'react-icons/fi'
import { getProducts, searchProducts } from '../api/products'
import { createSale, createShortPayment } from '../api/pos'
import useAuthStore from '../store/authStore'
import { formatCurrency, formatDate } from '../utils/helpers'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { queueSale, saveProductsCache, getCachedProducts } from '../utils/offlineQueue'
import Modal from '../components/Modal'
import { format, addDays } from 'date-fns'

const PAYMENT_METHODS = ['Cash', 'Card', 'Mobile Money']

function ProductCard({ product, onAdd }) {
  const outOfStock = product.quantity <= 0
  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={`text-left p-3 rounded-xl border transition-all group
        ${outOfStock
          ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
          : 'bg-white border-gray-200 hover:border-orange-400 hover:shadow-md hover:shadow-orange-100 cursor-pointer active:scale-95'
        }`}
    >
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2 group-hover:text-orange-700">{product.name}</p>
        {outOfStock && (
          <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold flex-shrink-0 ml-1">OUT</span>
        )}
      </div>
      <p className="text-xs text-gray-400 font-mono mb-2">{product.barcode || '—'}</p>
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-orange-600">{formatCurrency(product.selling_price)}</p>
        <p className={`text-xs font-semibold ${product.quantity <= (product.low_stock_level || 5) ? 'text-orange-500' : 'text-gray-400'}`}>
          Qty: {product.quantity}
        </p>
      </div>
    </button>
  )
}

function CartItem({ item, onUpdateQty, onRemove }) {
  return (
    <div className="flex items-center gap-2 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-orange-600 font-medium">{formatCurrency(item.selling_price)} each</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdateQty(item._id, item.qty - 1)}
          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-orange-100 hover:text-orange-600 flex items-center justify-center transition-colors"
        >
          <FiMinus size={13} />
        </button>
        <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
        <button
          onClick={() => onUpdateQty(item._id, item.qty + 1)}
          disabled={item.qty >= item.quantity}
          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-orange-100 hover:text-orange-600 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FiPlus size={13} />
        </button>
      </div>
      <p className="text-sm font-bold text-gray-900 w-20 text-right">{formatCurrency(item.selling_price * item.qty)}</p>
      <button
        onClick={() => onRemove(item._id)}
        className="text-red-400 hover:text-red-600 p-1 rounded transition-colors"
      >
        <FiTrash2 size={14} />
      </button>
    </div>
  )
}

function ReceiptModal({ isOpen, onClose, saleData }) {
  const receiptRef = useRef(null)

  const handlePrint = () => {
    window.print()
  }

  if (!saleData) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sale Receipt" size="md">
      <div className="p-4">
        <div ref={receiptRef} className="receipt-print-area bg-white border border-gray-200 rounded-xl p-4 font-mono text-sm">
          {/* Header */}
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            <p className="font-black text-base">DAN & DOR SOLAR</p>
            <p className="font-bold">COMPANY LIMITED</p>
            <p className="text-xs text-gray-500">Accra, Ghana</p>
            <p className="text-xs text-gray-500">Tel: +233 XXX XXX XXX</p>
            {saleData.offline && (
              <p className="text-xs font-bold text-amber-600 mt-1 border border-amber-300 rounded px-2 py-0.5 inline-block">
                OFFLINE — Pending Sync
              </p>
            )}
          </div>

          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between">
              <span>Invoice #:</span>
              <span className="font-bold">{saleData.invoiceNo || saleData._id?.slice(-8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{format(new Date(saleData.createdAt || new Date()), 'dd/MM/yyyy HH:mm')}</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>{saleData.cashier?.username || saleData.soldBy?.username || 'Staff'}</span>
            </div>
            {saleData.customer?.name && (
              <div className="flex justify-between">
                <span>Customer:</span>
                <span>{saleData.customer.name}</span>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between text-xs font-bold mb-2">
              <span className="flex-1">Item</span>
              <span className="w-8 text-center">Qty</span>
              <span className="w-16 text-right">Price</span>
              <span className="w-20 text-right">Total</span>
            </div>
            {saleData.items?.map((item, i) => (
              <div key={i} className="text-xs mb-1">
                <p className="font-medium">{item.product?.name || item.name}</p>
                <div className="flex justify-between text-gray-600">
                  <span className="flex-1"></span>
                  <span className="w-8 text-center">{item.quantity}</span>
                  <span className="w-16 text-right">₵{parseFloat(item.unitPrice || item.selling_price).toFixed(2)}</span>
                  <span className="w-20 text-right font-bold">₵{parseFloat(item.total || (item.quantity * item.unitPrice)).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>₵{parseFloat(saleData.subtotal || 0).toFixed(2)}</span>
            </div>
            {saleData.discount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discount:</span>
                <span>-₵{parseFloat(saleData.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-base">
              <span>TOTAL:</span>
              <span>₵{parseFloat(saleData.grandTotal).toFixed(2)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between">
              <span>Method:</span>
              <span className="font-bold">{saleData.paymentMethod}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount Paid:</span>
              <span className="font-bold">₵{parseFloat(saleData.amountPaid || saleData.grandTotal).toFixed(2)}</span>
            </div>
            {saleData.change > 0 && (
              <div className="flex justify-between">
                <span>Change:</span>
                <span className="font-bold">₵{parseFloat(saleData.change).toFixed(2)}</span>
              </div>
            )}
            {saleData.balanceDue > 0 && (
              <div className="flex justify-between text-red-600 font-bold">
                <span>BALANCE DUE:</span>
                <span>₵{parseFloat(saleData.balanceDue).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-gray-500">
            <p className="font-semibold">Thank you for your business!</p>
            <p>Powered by ITTEK Solution</p>
          </div>
        </div>

        <div className="flex gap-3 mt-4 no-print">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            <FiPrinter size={16} /> Print
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ShortPaymentModal({ isOpen, onClose, cartTotal, onConfirm, loading }) {
  const [amountPaid, setAmountPaid] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 21), 'yyyy-MM-dd'))

  const balance = cartTotal - parseFloat(amountPaid || 0)

  const handleConfirm = () => {
    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      toast.error('Enter amount being paid')
      return
    }
    if (parseFloat(amountPaid) >= cartTotal) {
      toast.error('For full payment, use Complete Sale instead')
      return
    }
    if (!customerName.trim()) {
      toast.error('Customer name is required for short payment')
      return
    }
    onConfirm({ amountPaid: parseFloat(amountPaid), customerName, customerPhone, dueDate, balance })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Short Payment / Partial Payment" size="md">
      <div className="p-5 space-y-4">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-sm text-orange-700">Total Amount Due</p>
          <p className="text-3xl font-black text-orange-600">{formatCurrency(cartTotal)}</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Amount Being Paid (GH₵) *</label>
          <input
            type="number"
            value={amountPaid}
            onChange={e => setAmountPaid(e.target.value)}
            placeholder="0.00"
            min="0"
            max={cartTotal - 0.01}
            step="0.01"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {amountPaid && parseFloat(amountPaid) > 0 && parseFloat(amountPaid) < cartTotal && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-700 font-semibold">
              Balance to be owed: <span className="text-lg font-black">{formatCurrency(balance)}</span>
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Customer Name *</label>
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Full name of customer"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Customer Phone</label>
          <input
            type="tel"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="+233 XXX XXX XXX"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            min={format(new Date(), 'yyyy-MM-dd')}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-60 text-white rounded-xl font-bold text-sm transition-colors"
          >
            {loading ? 'Processing...' : 'Confirm Short Payment'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function POS() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const searchRef = useRef(null)
  const isOnline = useOnlineStatus()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [cart, setCart] = useState([])
  const [discountType, setDiscountType] = useState('fixed') // 'fixed' or 'percent'
  const [discountValue, setDiscountValue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [showShortModal, setShowShortModal] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastSale, setLastSale] = useState(null)

  // Auto-focus search
  useEffect(() => { searchRef.current?.focus() }, [])

  // Debounce search to avoid firing on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['pos-products', debouncedSearch],
    queryFn: () => {
      if (debouncedSearch.trim()) {
        return searchProducts(debouncedSearch).then(r => r.data)
      }
      return getProducts({ limit: 50, sort: 'name' }).then(r => r.data)
    },
    // Seed the query with localStorage data so it shows immediately on offline refresh
    initialData: () => (!debouncedSearch.trim() ? getCachedProducts() || undefined : undefined),
    initialDataUpdatedAt: () => parseInt(localStorage.getItem('ittek_products_cache_time') || '0'),
    staleTime: 30000,
    enabled: isOnline,  // Don't fire API calls when offline — use stale / initial data
    retry: false,
    refetchOnWindowFocus: false,
  })

  // When online and no search: keep the products cache fresh for offline use
  const rawProducts = Array.isArray(productsData) ? productsData : (productsData?.products || [])
  useEffect(() => {
    if (isOnline && !debouncedSearch && rawProducts.length > 0) {
      saveProductsCache(rawProducts)
    }
  }, [rawProducts, isOnline, debouncedSearch])

  // When offline, filter the localStorage cache client-side instead of querying the API
  const offlineCache = !isOnline ? (getCachedProducts() || []) : null
  const products = offlineCache !== null
    ? (debouncedSearch.trim()
        ? offlineCache.filter(p => {
            const q = debouncedSearch.toLowerCase()
            return p.name?.toLowerCase().includes(q) || p.barcode?.includes(q)
          })
        : offlineCache)
    : rawProducts

  // Cart calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.selling_price || 0) * item.qty, 0)
  const discountAmount = discountType === 'percent'
    ? (subtotal * parseFloat(discountValue || 0)) / 100
    : parseFloat(discountValue || 0)
  const grandTotal = Math.max(0, subtotal - discountAmount)
  const paidAmount = parseFloat(amountPaid || 0)
  const change = Math.max(0, paidAmount - grandTotal)

  const addToCart = useCallback((product) => {
    setCart(prev => {
      const exists = prev.find(i => i._id === product._id)
      if (exists) {
        if (exists.qty >= product.quantity) {
          toast.error('Not enough stock')
          return prev
        }
        return prev.map(i => i._id === product._id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { ...product, qty: 1 }]
    })
  }, [])

  const updateQty = (id, newQty) => {
    if (newQty <= 0) {
      removeFromCart(id)
      return
    }
    setCart(prev => prev.map(i => {
      if (i._id === id) {
        if (newQty > i.quantity) { toast.error('Not enough stock'); return i }
        return { ...i, qty: newQty }
      }
      return i
    }))
  }

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(i => i._id !== id))
  }

  const clearCart = () => {
    setCart([])
    setDiscountValue('')
    setAmountPaid('')
    setCustomerName('')
    setCustomerPhone('')
  }

  const buildSalePayload = (extras = {}) => ({
    cart: cart.map(i => ({
      product_id: i._id,
      quantity: i.qty,
    })),
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
      setLastSale(res.data?.sale || res.data)
      setShowReceipt(true)
      clearCart()
      queryClient.invalidateQueries(['pos-products'])
      queryClient.invalidateQueries(['dashboard-stats'])
      toast.success('Sale completed!')
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Sale failed')
    },
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
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to process short payment')
    },
  })

  const buildOfflineReceipt = (extras = {}) => ({
    invoiceNo: `OFFLINE-${Date.now()}`,
    items: cart.map(i => ({ name: i.name, quantity: i.qty, unitPrice: i.selling_price, total: i.selling_price * i.qty })),
    subtotal,
    discount: discountAmount,
    grandTotal,
    amountPaid: extras.amountPaid ?? paidAmount,
    change: extras.change ?? change,
    paymentMethod,
    cashier: { username: user?.username },
    createdAt: new Date().toISOString(),
    offline: true,
    ...extras,
  })

  const handleCompleteSale = () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return }
    if (paidAmount < grandTotal) {
      toast.error('Amount paid is less than total. Use Short Payment instead.')
      return
    }
    const payload = buildSalePayload()
    if (!isOnline) {
      queueSale('sale', payload)
      setLastSale(buildOfflineReceipt())
      setShowReceipt(true)
      clearCart()
      toast.success('Offline sale queued — will sync when connected')
      return
    }
    saleMutation.mutate(payload)
  }

  const handleShortPaymentConfirm = ({ amountPaid: ap, customerName: cn, customerPhone: cp }) => {
    const payload = buildSalePayload({
      amount_paid: parseFloat(ap),
      customer_name: cn,
      customer_phone: cp || undefined,
    })
    if (!isOnline) {
      queueSale('short_payment', payload)
      const paid = parseFloat(ap)
      setLastSale(buildOfflineReceipt({ amountPaid: paid, change: 0, balanceDue: grandTotal - paid }))
      setShowShortModal(false)
      setShowReceipt(true)
      clearCart()
      toast.success('Offline short payment queued — will sync when connected')
      return
    }
    shortPayMutation.mutate(payload)
  }

  // Barcode search: if searchQuery has no space and is 8+ chars, treat as barcode
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const exact = products.find(p =>
        p.barcode === searchQuery.trim() ||
        p.name.toLowerCase() === searchQuery.trim().toLowerCase()
      )
      if (exact && exact.quantity > 0) {
        addToCart(exact)
        setSearchQuery('')
      }
    }
  }

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col lg:flex-row bg-gray-100 overflow-hidden">
      {/* LEFT PANEL - Products */}
      <div className="flex-1 flex flex-col lg:max-w-[60%] min-h-0 bg-white border-r border-gray-200">
        {/* Search */}
        <div className="p-3 border-b border-gray-200 bg-white flex-shrink-0">
          {!isOnline && (
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <FiAlertTriangle size={13} />
              Offline — showing cached products. Sales will sync when reconnected.
            </div>
          )}
          <div className="relative">
            <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search product or scan barcode (Enter to add)..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50"
            />
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {productsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array(9).fill(0).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <FiSearch size={32} className="mb-2" />
              <p className="text-sm">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {products.map(p => (
                <ProductCard key={p._id} product={p} onAdd={addToCart} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL - Cart */}
      <div className="flex flex-col w-full lg:w-[40%] lg:max-w-sm min-h-0 bg-white">
        {/* Cart header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h2 className="font-black text-gray-900">Cart ({cart.length} items)</h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1">
              <FiX size={13} /> Clear
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-4 min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-300">
              <FiShoppingCart size={32} className="mb-2" />
              <p className="text-sm">Cart is empty</p>
            </div>
          ) : (
            cart.map(item => (
              <CartItem
                key={item._id}
                item={item}
                onUpdateQty={updateQty}
                onRemove={removeFromCart}
              />
            ))
          )}
        </div>

        {/* Cart Footer */}
        <div className="border-t border-gray-200 p-4 space-y-3 flex-shrink-0">
          {/* Subtotal */}
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span className="font-semibold">{formatCurrency(subtotal)}</span>
          </div>

          {/* Discount */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setDiscountType('fixed')}
                className={`px-2 py-1.5 font-semibold transition-colors ${discountType === 'fixed' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >GH₵</button>
              <button
                onClick={() => setDiscountType('percent')}
                className={`px-2 py-1.5 font-semibold transition-colors ${discountType === 'percent' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >%</button>
            </div>
            <input
              type="number"
              value={discountValue}
              onChange={e => setDiscountValue(e.target.value)}
              placeholder="Discount"
              min="0"
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {discountAmount > 0 && (
              <span className="text-xs text-red-500 font-semibold">-{formatCurrency(discountAmount)}</span>
            )}
          </div>

          {/* Grand Total */}
          <div className="flex justify-between items-center bg-orange-50 rounded-xl px-4 py-3">
            <span className="font-bold text-orange-800">TOTAL</span>
            <span className="text-2xl font-black text-orange-600">{formatCurrency(grandTotal)}</span>
          </div>

          {/* Customer */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className="px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Payment Method */}
          <div className="flex gap-1">
            {PAYMENT_METHODS.map(m => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors
                  ${paymentMethod === m ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-orange-50'}`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Amount Paid & Change */}
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <input
                type="number"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                placeholder="Amount paid"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            {change > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Change</p>
                <p className="text-sm font-black text-green-600">{formatCurrency(change)}</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || saleMutation.isPending}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {saleMutation.isPending ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
              ) : (
                <><FiCheck size={18} /> COMPLETE SALE</>
              )}
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (cart.length === 0) { toast.error('Cart is empty'); return }
                  setShowShortModal(true)
                }}
                disabled={cart.length === 0}
                className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-1"
              >
                <FiAlertTriangle size={14} /> SHORT PAY
              </button>
              <button
                onClick={clearCart}
                disabled={cart.length === 0}
                className="flex-1 py-2.5 border-2 border-red-300 text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold rounded-xl transition-colors text-sm"
              >
                CLEAR
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Short Payment Modal */}
      <ShortPaymentModal
        isOpen={showShortModal}
        onClose={() => setShowShortModal(false)}
        cartTotal={grandTotal}
        onConfirm={handleShortPaymentConfirm}
        loading={shortPayMutation.isPending}
      />

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        saleData={lastSale}
      />
    </div>
  )
}
