import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const STATUS_STYLES = {
  paid: 'bg-green-100 text-green-700 border-green-200',
  partial: 'bg-amber-100 text-amber-700 border-amber-200',
  debt_payment: 'bg-blue-100 text-blue-700 border-blue-200',
}

/**
 * Public, login-free receipt page — this is what the receipt QR code opens.
 * It only renders what /api/public/receipt/:token returns, which never
 * includes cost prices or profit.
 */
export default function PublicReceipt() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false

    // Plain fetch — no auth header, no axios interceptors: this page is public.
    fetch(`${API_BASE}/public/receipt/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || 'Receipt not found.')
        }
        return body.data
      })
      .then((data) => { if (!cancelled) setState({ loading: false, error: null, data }) })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, data: null }) })

    return () => { cancelled = true }
  }, [token])

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading receipt…</p>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center max-w-sm w-full">
          <p className="text-3xl mb-2">🧾</p>
          <p className="font-bold text-gray-800 mb-1">Receipt not found</p>
          <p className="text-sm text-gray-500">{state.error}</p>
        </div>
      </div>
    )
  }

  const { shop, receipt } = state.data
  const cur = shop.currency_symbol || 'GH₵'
  const money = (n) => `${cur}${Number(n || 0).toFixed(2)}`

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Shop header */}
        <div className="text-center px-5 pt-6 pb-4 border-b border-dashed border-gray-200">
          {shop.logo_url && (
            <img src={shop.logo_url} alt={shop.name} className="h-16 mx-auto mb-3 object-contain" />
          )}
          <h1 className="font-black text-lg text-gray-900 leading-tight">{shop.name}</h1>
          {shop.address && <p className="text-xs text-gray-500 mt-0.5">{shop.address}</p>}
          {shop.phone && <p className="text-xs text-gray-500">Tel: {shop.phone}</p>}
        </div>

        {/* Invoice info */}
        <div className="px-5 py-4 text-xs space-y-1.5 border-b border-dashed border-gray-200">
          <div className="flex justify-between">
            <span className="text-gray-500">Invoice #</span>
            <span className="font-bold text-gray-900">{receipt.invoice_no}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Date</span>
            <span className="text-gray-800">
              {receipt.sale_date ? format(new Date(receipt.sale_date), 'dd/MM/yyyy HH:mm') : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Served by</span>
            <span className="text-gray-800">{receipt.served_by}</span>
          </div>
          {receipt.customer_name && (
            <div className="flex justify-between">
              <span className="text-gray-500">Customer</span>
              <span className="text-gray-800">{receipt.customer_name}</span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="px-5 py-4 border-b border-dashed border-gray-200">
          <div className="flex justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
            <span className="flex-1">Item</span>
            <span className="w-10 text-center">Qty</span>
            <span className="w-24 text-right">Amount</span>
          </div>
          {receipt.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
              <div className="flex-1 pr-2">
                <p className="font-medium text-gray-800">
                  {item.product_name}
                  {item.variant_name ? <span className="text-gray-500"> — {item.variant_name}</span> : null}
                </p>
                <p className="text-gray-400">{money(item.unit_price)} each</p>
              </div>
              <span className="w-10 text-center text-gray-700">{item.quantity}</span>
              <span className="w-24 text-right font-bold text-gray-900">{money(item.total)}</span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="px-5 py-4 text-xs space-y-1.5 border-b border-dashed border-gray-200">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-800">{money(receipt.subtotal)}</span>
          </div>
          {receipt.discount_amount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount</span>
              <span>-{money(receipt.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-base text-gray-900 pt-1">
            <span>TOTAL</span>
            <span>{money(receipt.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Amount paid</span>
            <span className="text-gray-800">{money(receipt.amount_paid)}</span>
          </div>
          {receipt.loyalty_discount > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>Points discount</span>
              <span>-{money(receipt.loyalty_discount)}</span>
            </div>
          )}
          {(receipt.payment_splits || []).length > 1 && (receipt.payment_splits || []).map((p, i) => (
            <div key={i} className="flex justify-between text-gray-500 pl-3">
              <span className="capitalize">{(p.method || '').replace(/_/g, ' ')}</span>
              <span>{money(p.amount)}</span>
            </div>
          ))}
          {receipt.balance_due > 0 && (
            <div className="flex justify-between font-bold text-red-600">
              <span>Balance due</span>
              <span>{money(receipt.balance_due)}</span>
            </div>
          )}
          {receipt.points_earned > 0 && (
            <div className="flex justify-between text-amber-700 font-semibold">
              <span>Points earned</span>
              <span>+{receipt.points_earned}</span>
            </div>
          )}
        </div>

        {/* Payment status */}
        <div className="px-5 py-4 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Paid by {(receipt.payment_method || '').replace(/_/g, ' ')}
          </span>
          <span
            className={`text-xs font-bold px-3 py-1 rounded-full border uppercase ${
              STATUS_STYLES[receipt.payment_status] || 'bg-gray-100 text-gray-600 border-gray-200'
            }`}
          >
            {(receipt.payment_status || '').replace(/_/g, ' ')}
          </span>
        </div>

        <div className="px-5 pb-6 text-center text-xs text-gray-400">
          <p className="font-semibold text-gray-500">Thank you for your business!</p>
          <p>Powered by ITTEK Solution</p>
        </div>
      </div>
    </div>
  )
}
