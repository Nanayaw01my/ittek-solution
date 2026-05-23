import React, { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_your_key_here'

export default function PaystackButton({
  amount,
  email,
  onSuccess,
  onClose,
  planId,
  label = 'Make Payment',
  disabled = false,
  className = '',
  metadata = {},
}) {
  const paystackLoaded = useRef(false)

  useEffect(() => {
    if (!paystackLoaded.current && !window.PaystackPop) {
      const script = document.createElement('script')
      script.src = 'https://js.paystack.co/v1/inline.js'
      script.async = true
      script.onload = () => { paystackLoaded.current = true }
      document.head.appendChild(script)
    } else {
      paystackLoaded.current = true
    }
  }, [])

  const handlePayment = () => {
    if (!email) {
      toast.error('Customer email is required for payment')
      return
    }

    if (!amount || amount <= 0) {
      toast.error('Invalid payment amount')
      return
    }

    const amountInPesewas = Math.round(amount * 100)

    // Try @paystack/inline-js approach first
    try {
      if (window.PaystackPop) {
        const handler = window.PaystackPop.setup({
          key: PAYSTACK_PUBLIC_KEY,
          email,
          amount: amountInPesewas,
          currency: 'GHS',
          channels: ['mobile_money', 'card'],
          metadata: {
            plan_id: planId,
            ...metadata,
          },
          callback: (response) => {
            if (onSuccess) onSuccess(response)
          },
          onClose: () => {
            if (onClose) onClose()
          },
        })
        handler.openIframe()
      } else {
        toast.error('Payment system not loaded. Please refresh and try again.')
      }
    } catch (err) {
      console.error('Paystack error:', err)
      toast.error('Payment initialization failed. Please try again.')
    }
  }

  const defaultClassName = `w-full py-4 px-6 rounded-2xl bg-green-800 text-white font-bold text-base
    min-h-[56px] flex items-center justify-center gap-3
    active:scale-95 transition-all duration-150
    disabled:opacity-50 disabled:cursor-not-allowed
    hover:bg-green-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${className}`

  return (
    <button
      type="button"
      onClick={handlePayment}
      disabled={disabled}
      className={defaultClassName}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
      {label}
      {amount > 0 && (
        <span className="ml-1 opacity-90">
          (GHS {Number(amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })})
        </span>
      )}
    </button>
  )
}
