import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  FiSearch, FiPlus, FiMinus, FiTrash2, FiPrinter, FiX,
  FiCheck, FiAlertTriangle, FiShoppingCart, FiPackage,
  FiCreditCard, FiDollarSign, FiSmartphone, FiArrowLeft, FiUser
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
  { key: 'Cash',         label: 'Cash',  icon: FiDollarSign  },
  { key: 'Card',         label: 'Card',  icon: FiCreditCard  },
  { key: 'Mobile Money', label: 'MoMo',  icon: FiSmartphone  },
]

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, onAdd }) {
  const outOfStock = product.quantity <= 0
  const lowStock = !outOfStock && product.quantity <= (product.low_stock_level || 5)

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={`relative text-left rounded-2xl overflow-hidden transition-all duration-150
        ${outOfStock
          ? 'opacity-50 cursor-not-allowed bg-gray-50 border border-gray-200'
          : 'bg-white border border-gray-200 hover:border-orange-400 hover:shadow-xl hover:shadow-orange-100 hover:-translate-y-0.5 active:scale-95 cursor-pointer'
        }`}
    >
      <div className="w-full aspect-square bg-gradient-to-br from-orange-50 to-amber-50 relative overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><FiPackage size={28} className="text-orange-200" /></div>
        }
        {outOfStock && (
          <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center">
            <span className="text-white text-xs font-black bg-red-500 px-2 py-1 rounded-lg">OUT OF STOCK</span>
          </div>
        )}
        {lowStock && (
          <span className="absolute top-1.5 right-1.5 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">LOW</span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2 mb-1.5 min-h-[2rem]">{product.name}</p>
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-orange-500">{formatCurrency(product.selling_price)}</p>
          <span className="text-[10px] text-gray-400">x{product.quantity}</span>
        </div>
      </div>
    </button>
  )
}

// ─── Cart Item ────────────────────────────────────────────────────────────────

function CartItem({ item, index, onUpdateQty, onRemove }) {
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-gray-100 last:border-0">
      <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
        {index + 1}
      </span>
      <div className="w-9 h-9 rounded-lg overflow-hidden bg-orange-50 flex-shrink-0 border border-gray-100">
        {item.image_url
          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><FiPackage size={13} className="text-orange-200" /></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-900 truncate">{item.name}</p>
        <p className="text-[11px] text-gray-400">{formatCurrency(item.selling_price)} / unit</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onUpdateQty(item._id, item.qty - 1)}
          className="w-6 h-6 rounded-md bg-gray-100 hover:bg-orange-100 hover:text-orange-600 flex items-center justify-center transition-colors">
          <FiMinus size={10} />
        </button>
        <span className="w-6 text-center text-sm font-black text-gray-900">{item.qty}</span>
        <button onClick={() => onUpdateQty(item._id, item.qty + 1)}
          disabled={item.qty >= item.quantity}
          className="w-6 h-6 rounded-md bg-gray-100 hover:bg-orange-100 hover:text-orange-600 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <FiPlus size={10} />
        </button>
      </div>
      <p className="text-xs font-black text-gray-900 w-16 text-right flex-shrink-0">
        {formatCurrency(item.selling_price * item.qty)}
      </p>
      <button onClick={() => onRemove(item._id)}
        className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
        <FiTrash2 size={12} />
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
  const saleDate  = saleData.sale_date || saleData.createdAt
  const cashierName = saleData.user_id?.username || saleData.cashier?.username || saleData.soldBy?.username || 'Staff'
  const items       = saleData.items || []
  const subtotal    = parseFloat(saleData.subtotal || 0)
  const cartTotal   = parseFloat(saleData.cart_total || saleData.grandTotal || saleData.total_amount || 0)
  const discountAmt = Math.max(0, subtotal - cartTotal)
  const amountPaid  = parseFloat(saleData.total_amount || saleData.amountPaid || cartTotal)
  const change      = parseFloat(saleData.change || 0)
  const balanceDue  = parseFloat(saleData.debt_amount || saleData.balanceDue || 0)
  const payMethod   = (saleData.payment_method || saleData.paymentMethod || '').replace(/_/g, ' ').toUpperCase()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sale Receipt" size="md">
      <div className="p-4">
        <div ref={receiptRef} className="receipt-print-area bg-white border border-gray-200 rounded-xl p-4 font-mono text-sm">
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-14 mx-auto mb-2 object-contain" />}
            <p className="font-black text-base">{companyName || 'DAN & DOR SOLAR COMPANY LIMITED'}</p>
            <p className="text-xs text-gray-500">{companyAddress || 'Bogoso, Western Region'}</p>
            {companyPhone && <p className="text-xs text-gray-500">Tel: {companyPhone}</p>}
            {saleData.offline && (
              <p className="text-xs font-bold text-amber-600 mt-1 border border-amber-300 rounded px-2 py-0.5 inline-block">OFFLINE — Pending Sync</p>
            )}
          </div>
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
          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between"><span>Subtotal:</span><span>{cur}{subtotal.toFixed(2)}</span></div>
            {discountAmt > 0 && <div className="flex justify-between text-red-600"><span>Discount:</span><span>-{cur}{discountAmt.toFixed(2)}</span></div>}
            <div className="flex justify-between font-black text-base"><span>TOTAL:</span><span>{cur}{cartTotal.toFixed(2)}</span></div>
          </div>
          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="flex justify-between"><span>Method:</span><span className="font-bold">{payMethod}</span></div>
            <div className="flex justify-between"><span>Amount Paid:</span><span className="font-bold">{cur}{amountPaid.toFixed(2)}</span></div>
            {change > 0 && <div className="flex justify-between"><span>Change:</span><span className="font-bold">{cur}{change.toFixed(2)}</span></div>}
            {balanceDue > 0 && <div className="flex justify-between text-red-600 font-bold"><span>BALANCE DUE:</span><span>{cur}{balanceDue.toFixed(2)}</span></div>}
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

// ─── Main POS ────────────────────────────────────────────────────────────────

export default function POS() {
  const { user }        = useAuthStore()
  const queryClient     = useQueryClient()
  const searchRef       = useRef(null)
  const isOnline        = useOnlineStatus()

  // Products & search
  const [searchQuery,    setSearchQuery]    = useState('')
  const [debouncedSearch,setDebouncedSearch]= useState('')

  // Cart
  const [cart,           setCart]           = useState([])
  const [discountType,   setDiscountType]   = useState('fixed')
  const [discountValue,  setDiscountValue]  = useState('')

  // Checkout form (shown after tapping Complete Sale or Short Payment)
  // null = cart view | 'full' = complete sale | 'short' = short payment
  const [checkoutMode,   setCheckoutMode]   = useState(null)
  const [paymentMethod,  setPaymentMethod]  = useState('Cash')
  const [amountPaid,     setAmountPaid]     = useState('')
  const [customerName,   setCustomerName]   = useState('')
  const [customerPhone,  setCustomerPhone]  = useState('')
  const [shortAmount,    setShortAmount]    = useState('')
  const [dueDate,        setDueDate]        = useState(format(addDays(new Date(), 21), 'yyyy-MM-dd'))

  // Receipt
  const [showReceipt,    setShowReceipt]    = useState(false)
  const [lastSale,       setLastSale]       = useState(null)

  // Mobile tab
  const [mobileView,     setMobileView]     = useState('products')

  useEffect(() => { if (mobileView === 'products' && !checkoutMode) searchRef.current?.focus() }, [mobileView, checkoutMode])

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
    queryFn: () => getProducts({ limit: 100, ...(debouncedSearch.trim() ? { search: debouncedSearch } : {}) }).then(r => r.data),
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

  // ── Calculations
  const subtotal      = cart.reduce((s, i) => s + (i.selling_price || 0) * i.qty, 0)
  const discountAmount= discountType === 'percent'
    ? (subtotal * parseFloat(discountValue || 0)) / 100
    : parseFloat(discountValue || 0)
  const grandTotal    = Math.max(0, subtotal - discountAmount)
  const paidAmount    = parseFloat(amountPaid || 0)
  const change        = Math.max(0, paidAmount - grandTotal)
  const shortPaid     = parseFloat(shortAmount || 0)
  const shortBalance  = Math.max(0, grandTotal - shortPaid)
  const totalUnits    = cart.reduce((s, i) => s + i.qty, 0)

  // ── Cart actions
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
    setShortAmount('')
    setCustomerName('')
    setCustomerPhone('')
    setCheckoutMode(null)
  }

  const resetCheckout = () => {
    setCheckoutMode(null)
    setAmountPaid('')
    setShortAmount('')
    setCustomerName('')
    setCustomerPhone('')
    setPaymentMethod('Cash')
    setDueDate(format(addDays(new Date(), 21), 'yyyy-MM-dd'))
  }

  const buildSalePayload = (extras = {}) => ({
    cart: cart.map(i => ({ product_id: i._id, quantity: i.qty })),
    discount: parseFloat(discountValue) || 0,
    discount_type: discountType === 'percent' ? 'percentage' : 'fixed',
    payment_method: paymentMethod.toLowerCase().replace(' ', '_'),
    customer_name: customerName.trim() || undefined,
    customer_phone: customerPhone.trim() || undefined,
    ...extras,
  })

  const saleMutation = useMutation({
    mutationFn: (data) => createSale(data),
    onSuccess: (res) => {
      setLastSale(res.data); setShowReceipt(true); clearCart()
      queryClient.invalidateQueries(['pos-products'])
      queryClient.invalidateQueries(['dashboard-stats'])
      toast.success('Sale completed!')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Sale failed'),
  })

  const shortPayMutation = useMutation({
    mutationFn: (data) => createShortPayment(data),
    onSuccess: (res) => {
      setLastSale(res.data?.sale || res.data); setShowReceipt(true); clearCart()
      queryClient.invalidateQueries(['pos-products'])
      queryClient.invalidateQueries(['dashboard-stats'])
      toast.success('Short payment recorded!')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  })

  const buildOfflineReceipt = (extras = {}) => ({
    invoiceNo: `OFFLINE-${Date.now()}`,
    items: cart.map(i => ({ name: i.name, quantity: i.qty, unitPrice: i.selling_price, total: i.selling_price * i.qty })),
    subtotal, discount: discountAmount, grandTotal,
    amountPaid: extras.amountPaid ?? paidAmount, change: extras.change ?? change,
    paymentMethod, cashier: { username: user?.username },
    createdAt: new Date().toISOString(), offline: true, ...extras,
  })

  const handleCompleteSale = () => {
    if (paidAmount < grandTotal) { toast.error('Amount paid is less than total.'); return }
    const payload = buildSalePayload()
    if (!isOnline) {
      queueSale('sale', payload); setLastSale(buildOfflineReceipt()); setShowReceipt(true); clearCart()
      toast.success('Offline sale queued'); return
    }
    saleMutation.mutate(payload)
  }

  const handleShortPayment = () => {
    if (!shortAmount || shortPaid <= 0) { toast.error('Enter amount being paid'); return }
    if (shortPaid >= grandTotal) { toast.error('Use Complete Sale for full payment'); return }
    if (!customerName.trim()) { toast.error('Customer name required for short payment'); return }
    const payload = buildSalePayload({ amount_paid: shortPaid })
    if (!isOnline) {
      queueSale('short_payment', payload)
      setLastSale(buildOfflineReceipt({ amountPaid: shortPaid, change: 0, balanceDue: shortBalance }))
      setShowReceipt(true); clearCart()
      toast.success('Offline short payment queued'); return
    }
    shortPayMutation.mutate(payload)
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const exact = products.find(p => p.barcode === searchQuery.trim() || p.name.toLowerCase() === searchQuery.trim().toLowerCase())
      if (exact && exact.quantity > 0) { addToCart(exact); setSearchQuery('') }
    }
  }

  // ── Cart view (default right panel)
  const CartView = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
            <FiShoppingCart size={13} className="text-white" />
          </div>
          <div>
            <h2 className="font-black text-gray-900 text-sm">Current Order</h2>
            <p className="text-[11px] text-gray-400">
              {cart.length === 0 ? 'No items added' : `${cart.length} line${cart.length !== 1 ? 's' : ''} · ${totalUnits} unit${totalUnits !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {cart.length > 0 && (
          <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1">
            <FiTrash2 size={11} /> Clear
          </button>
        )}
      </div>

      {/* Items — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-1">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <FiShoppingCart size={26} className="text-gray-200" />
            </div>
            <p className="text-sm font-bold text-gray-400">No items yet</p>
            <p className="text-xs text-gray-300 mt-1">Tap a product to add it</p>
          </div>
        ) : (
          cart.map((item, idx) => (
            <CartItem key={item._id} item={item} index={idx} onUpdateQty={updateQty} onRemove={removeFromCart} />
          ))
        )}
      </div>

      {/* Summary + actions — pinned to bottom */}
      <div className="flex-shrink-0 border-t-2 border-gray-100 px-4 py-3 space-y-2.5 bg-white">
        {/* Subtotal */}
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Subtotal ({totalUnits} units)</span>
          <span className="font-bold text-gray-700">{formatCurrency(subtotal)}</span>
        </div>

        {/* Discount */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 flex-shrink-0">Discount</span>
          <div className="flex ml-auto rounded-lg border border-gray-200 overflow-hidden text-[11px]">
            <button onClick={() => setDiscountType('fixed')}
              className={`px-2 py-1 font-bold transition-colors ${discountType === 'fixed' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>GH₵</button>
            <button onClick={() => setDiscountType('percent')}
              className={`px-2 py-1 font-bold transition-colors ${discountType === 'percent' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>%</button>
          </div>
          <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
            placeholder="0.00" min="0"
            className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-orange-400" />
          {discountAmount > 0 && <span className="text-[11px] text-red-500 font-bold flex-shrink-0">-{formatCurrency(discountAmount)}</span>}
        </div>

        {/* Grand total */}
        <div className="flex items-center justify-between bg-gray-900 rounded-xl px-4 py-3">
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Order Total</p>
            {discountAmount > 0 && <p className="text-[10px] text-green-400">Saved {formatCurrency(discountAmount)}</p>}
          </div>
          <p className="text-2xl font-black text-white">{formatCurrency(grandTotal)}</p>
        </div>

        {/* Action buttons */}
        <button
          onClick={() => { if (cart.length === 0) { toast.error('Cart is empty'); return }; setCheckoutMode('full') }}
          disabled={cart.length === 0}
          className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-orange-200 disabled:shadow-none text-sm"
        >
          <FiCheck size={16} /> Complete Sale
        </button>
        <button
          onClick={() => { if (cart.length === 0) { toast.error('Cart is empty'); return }; setCheckoutMode('short') }}
          disabled={cart.length === 0}
          className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 disabled:opacity-40 disabled:cursor-not-allowed text-amber-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
        >
          <FiAlertTriangle size={12} /> Short / Partial Payment
        </button>
      </div>
    </div>
  )

  // ── Checkout view (full payment)
  const CheckoutFullView = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
        <button onClick={resetCheckout} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors flex-shrink-0">
          <FiArrowLeft size={15} className="text-gray-600" />
        </button>
        <div>
          <h2 className="font-black text-gray-900 text-sm">Complete Sale</h2>
          <p className="text-[11px] text-gray-400">{cart.length} item{cart.length !== 1 ? 's' : ''} · {formatCurrency(grandTotal)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-5">
        {/* Order total summary */}
        <div className="flex items-center justify-between bg-gray-900 rounded-2xl px-5 py-4">
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Total to Collect</p>
            {discountAmount > 0 && <p className="text-xs text-green-400 mt-0.5">Discount: -{formatCurrency(discountAmount)}</p>}
          </div>
          <p className="text-3xl font-black text-white">{formatCurrency(grandTotal)}</p>
        </div>

        {/* Customer details */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FiUser size={13} className="text-orange-500" />
            <p className="text-xs font-black text-gray-700 uppercase tracking-widest">Customer Details <span className="font-normal text-gray-400 normal-case tracking-normal">(optional)</span></p>
          </div>
          <div className="space-y-2">
            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 transition-colors" />
            <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Phone number (optional)"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 transition-colors" />
          </div>
        </div>

        {/* Payment method */}
        <div>
          <p className="text-xs font-black text-gray-700 uppercase tracking-widest mb-3">Payment Method</p>
          <div className="flex gap-2">
            {PAYMENT_METHODS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setPaymentMethod(key)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all border-2
                  ${paymentMethod === key
                    ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
                  }`}>
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount received */}
        <div>
          <p className="text-xs font-black text-gray-700 uppercase tracking-widest mb-3">Amount Received</p>
          <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
            placeholder="Enter amount received" min="0" step="0.01"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-black focus:outline-none focus:border-orange-500 transition-colors text-center" />
          {change > 0 && (
            <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-green-700 font-bold">Change to give</p>
              <p className="text-xl font-black text-green-600">{formatCurrency(change)}</p>
            </div>
          )}
          {paidAmount > 0 && paidAmount < grandTotal && (
            <p className="mt-2 text-xs text-red-500 font-semibold text-center">
              Short by {formatCurrency(grandTotal - paidAmount)} — use Short Payment instead
            </p>
          )}
        </div>
      </div>

      {/* Confirm button */}
      <div className="flex-shrink-0 px-4 py-4 border-t border-gray-100">
        <button onClick={handleCompleteSale}
          disabled={saleMutation.isPending || cart.length === 0}
          className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-colors flex items-center justify-center gap-2 text-sm shadow-lg shadow-orange-200 disabled:shadow-none">
          {saleMutation.isPending
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
            : <><FiCheck size={16} /> Confirm &amp; Complete Sale</>
          }
        </button>
      </div>
    </div>
  )

  // ── Checkout view (short payment)
  const CheckoutShortView = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
        <button onClick={resetCheckout} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors flex-shrink-0">
          <FiArrowLeft size={15} className="text-gray-600" />
        </button>
        <div>
          <h2 className="font-black text-gray-900 text-sm">Short Payment</h2>
          <p className="text-[11px] text-gray-400">Partial payment with balance tracked</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-5">
        {/* Total due */}
        <div className="flex items-center justify-between bg-gray-900 rounded-2xl px-5 py-4">
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Total Due</p>
          <p className="text-3xl font-black text-white">{formatCurrency(grandTotal)}</p>
        </div>

        {/* Amount being paid */}
        <div>
          <p className="text-xs font-black text-gray-700 uppercase tracking-widest mb-3">Amount Being Paid Now</p>
          <input type="number" value={shortAmount} onChange={e => setShortAmount(e.target.value)}
            placeholder="0.00" min="0" step="0.01"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-black focus:outline-none focus:border-amber-500 transition-colors text-center" />
          {shortPaid > 0 && shortPaid < grandTotal && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-red-600 font-bold">Balance owed</p>
              <p className="text-xl font-black text-red-600">{formatCurrency(shortBalance)}</p>
            </div>
          )}
        </div>

        {/* Customer details — required */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FiUser size={13} className="text-orange-500" />
            <p className="text-xs font-black text-gray-700 uppercase tracking-widest">Customer Details <span className="text-red-400">*required</span></p>
          </div>
          <div className="space-y-2">
            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer full name *"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 transition-colors" />
            <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 transition-colors" />
          </div>
        </div>

        {/* Due date */}
        <div>
          <p className="text-xs font-black text-gray-700 uppercase tracking-widest mb-3">Balance Due Date</p>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            min={format(new Date(), 'yyyy-MM-dd')}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 transition-colors" />
        </div>
      </div>

      {/* Confirm button */}
      <div className="flex-shrink-0 px-4 py-4 border-t border-gray-100">
        <button onClick={handleShortPayment}
          disabled={shortPayMutation.isPending || cart.length === 0}
          className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-colors flex items-center justify-center gap-2 text-sm">
          {shortPayMutation.isPending
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
            : <><FiCheck size={16} /> Confirm Short Payment</>
          }
        </button>
      </div>
    </div>
  )

  const activeRightView = checkoutMode === 'full' ? CheckoutFullView
    : checkoutMode === 'short' ? CheckoutShortView
    : CartView

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col lg:flex-row overflow-hidden bg-gray-50">

      {/* ── LEFT PANEL: Products ── */}
      <div className={`flex-1 flex flex-col min-h-0 ${mobileView === 'products' ? 'flex' : 'hidden'} lg:flex`}>
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
          {!isOnline && (
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <FiAlertTriangle size={13} /> Offline mode — showing cached products
            </div>
          )}
          <div className="relative">
            <FiSearch size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={searchRef} type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search product or scan barcode…"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors" />
          </div>
          {products.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {products.length} product{products.length !== 1 ? 's' : ''}
              {debouncedSearch && ` for "${debouncedSearch}"`}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {productsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array(12).fill(0).map((_, i) => <div key={i} className="rounded-2xl bg-gray-100 animate-pulse aspect-[3/4]" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-300">
              <FiSearch size={40} className="mb-3" />
              <p className="text-sm font-semibold text-gray-400">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {products.map(p => <ProductCard key={p._id} product={p} onAdd={addToCart} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Cart / Checkout ── */}
      <div className={`
        w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col overflow-hidden
        bg-white lg:border-l border-gray-200
        ${mobileView === 'cart' ? 'flex' : 'hidden'} lg:flex
      `}>
        {activeRightView}
      </div>

      {/* ── MOBILE BOTTOM TAB BAR ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-30 shadow-lg">
        <button onClick={() => setMobileView('products')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-bold transition-colors
            ${mobileView === 'products' ? 'text-orange-500' : 'text-gray-400'}`}>
          <FiPackage size={20} />
          Products
        </button>
        <div className="w-px bg-gray-200 my-3" />
        <button onClick={() => setMobileView('cart')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-bold transition-colors relative
            ${mobileView === 'cart' ? 'text-orange-500' : 'text-gray-400'}`}>
          <div className="relative">
            <FiShoppingCart size={20} />
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-orange-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </div>
          <span>{cart.length > 0 ? `Cart · ${formatCurrency(grandTotal)}` : 'Cart'}</span>
        </button>
      </div>

      <div className="lg:hidden h-16 flex-shrink-0" />

      {/* Receipt Modal */}
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
