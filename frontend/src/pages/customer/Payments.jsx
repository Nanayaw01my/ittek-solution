import React, { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import PaystackButton from '../../components/PaystackButton'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'

export default function CustomerPayments() {
  const { user } = useAuth()
  const [payments, setPayments] = useState([])
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const PER_PAGE = 20

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [paymentsRes, dashRes] = await Promise.allSettled([
        api.get(`/customer/payments?page=${page}&limit=${PER_PAGE}`),
        api.get('/customer/dashboard'),
      ])

      if (paymentsRes.status === 'fulfilled') {
        const d = paymentsRes.value.data?.data || paymentsRes.value.data
        setPayments(Array.isArray(d.payments) ? d.payments : [])
        setTotalPages(d.totalPages || Math.ceil((d.total || 0) / PER_PAGE))
      }
      if (dashRes.status === 'fulfilled') {
        const d = dashRes.value.data?.data || dashRes.value.data
        setPlan(d?.plan || null)
      }
    } catch {
      toast.error('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchData() }, [fetchData])

  const handlePaymentSuccess = () => {
    toast.success('Payment successful!')
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="xl" />
      </div>
    )
  }

  const paidAmount = (plan?.down_payment || 0) + ((plan?.payments_made || 0) * (plan?.installment_amount || 0))

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24 pt-4">
      <h1 className="text-2xl font-black text-gray-900 mb-4">Payments</h1>

      {/* Make Payment CTA */}
      {plan && plan.status !== 'completed' && (
        <div className="bg-green-800 rounded-3xl p-5 mb-4 text-white">
          <p className="text-green-200 text-xs font-semibold mb-0.5">
            {plan.status === 'overdue' || plan.status === 'defaulted' ? 'OVERDUE PAYMENT' : 'Next Installment'}
          </p>
          <p className="text-3xl font-black">
            GHS {Number(plan.installment_amount || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
          </p>
          {plan.next_due_date && (
            <p className="text-green-300 text-xs mt-1">
              Due {format(new Date(plan.next_due_date), 'EEEE, dd MMM yyyy')}
            </p>
          )}
          <div className="mt-4">
            <PaystackButton
              amount={plan.installment_amount || 0}
              email={user?.email}
              planId={plan.id || plan._id}
              label="Pay Now"
              onSuccess={handlePaymentSuccess}
              onClose={() => {}}
              className="bg-white text-green-800 hover:bg-green-50"
            />
          </div>
        </div>
      )}

      {/* Plan Summary */}
      {plan && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white rounded-2xl shadow-card p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Total Paid</p>
            <p className="text-lg font-black text-green-700">
              GHS {paidAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-card p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Remaining</p>
            <p className="text-lg font-black text-orange-600">
              GHS {Number(plan.remaining_balance || 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="bg-white rounded-2xl shadow-card p-4">
        <h2 className="text-base font-bold text-gray-800 mb-4">Payment History</h2>

        {payments.length === 0 ? (
          <div className="text-center py-10">
            <svg className="w-14 h-14 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className="text-gray-500 font-medium">No payments yet</p>
            <p className="text-sm text-gray-400 mt-1">Your payment history will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {payments.map((p) => (
              <div key={p.id || p._id} className="flex items-start gap-3 py-3.5">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-bold text-green-700">
                      GHS {Number(p.amount || 0).toLocaleString()}
                    </p>
                    <StatusBadge status={p.status || 'paid'} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.payment_method === 'paystack' ? 'Mobile Money / Card' : p.payment_method || 'Mobile Money'}
                  </p>
                  {(p.reference || p.paystack_reference) && (
                    <p className="text-xs font-mono text-gray-400 truncate mt-0.5">
                      Ref: {(p.reference || p.paystack_reference || '').slice(0, 24)}
                    </p>
                  )}
                  {p.paid_by_name && p.paid_by_name !== (user?.full_name || user?.name) && (
                    <p className="text-xs text-blue-500 mt-0.5">Processed by: {p.paid_by_name}</p>
                  )}
                </div>
                <p className="text-xs text-gray-400 flex-shrink-0">
                  {(p.created_at || p.payment_date || p.createdAt)
                    ? format(new Date(p.created_at || p.payment_date || p.createdAt), 'dd MMM\nyyyy')
                    : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl bg-gray-100 text-sm font-medium disabled:opacity-40 hover:bg-gray-200"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl bg-gray-100 text-sm font-medium disabled:opacity-40 hover:bg-gray-200"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
