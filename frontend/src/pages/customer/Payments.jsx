import React, { useState, useEffect } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import LoadingSpinner from '../../components/LoadingSpinner'
import PaystackButton from '../../components/PaystackButton'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'

export default function CustomerPayments() {
  const { user } = useAuth()
  const [payments, setPayments] = useState([])
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paymentData, setPaymentData] = useState(null)
  const [initiating, setInitiating] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [paymentsRes, dashRes] = await Promise.all([
        api.get('/customer/payments'),
        api.get('/customer/dashboard'),
      ])
      setPayments(paymentsRes.data.data?.payments || [])
      setPlan(dashRes.data.data?.plan)
    } catch {
      toast.error('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const initPayment = async () => {
    setInitiating(true)
    try {
      const res = await api.post('/payment/initialize')
      setPaymentData(res.data.data)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to initialize payment')
    } finally {
      setInitiating(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>

  return (
    <div className="page-container">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Payments</h1>

      {/* Make Payment */}
      {plan && plan.status !== 'completed' && (
        <div className="card mb-5 bg-primary-800 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-200 text-sm">Next Payment</p>
              <p className="text-2xl font-bold">GHS {plan.installment_amount?.toLocaleString()}</p>
              {plan.next_due_date && (
                <p className="text-primary-300 text-xs mt-0.5">
                  Due {format(new Date(plan.next_due_date), 'EEEE, MMM d, yyyy')}
                </p>
              )}
            </div>
            <div>
              {paymentData ? (
                <PaystackButton
                  amount={plan.installment_amount}
                  email={user?.email}
                  reference={paymentData.reference}
                  authorizationUrl={paymentData.authorization_url}
                  onSuccess={() => { toast.success('Payment successful!'); fetchData(); setPaymentData(null) }}
                  onClose={() => setPaymentData(null)}
                  label="Pay"
                  white
                />
              ) : (
                <button onClick={initPayment} disabled={initiating} className="bg-white text-primary-800 font-bold py-3 px-5 rounded-2xl active:scale-95 transition-all">
                  {initiating ? <LoadingSpinner size="sm" /> : 'Pay Now'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {plan && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="card text-center">
            <p className="text-xs text-gray-500">Total Paid</p>
            <p className="font-bold text-green-700">GHS {((plan.payments_made * plan.installment_amount) + plan.down_payment).toLocaleString()}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">Remaining</p>
            <p className="font-bold text-orange-600">GHS {plan.remaining_balance?.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Payment History */}
      <h2 className="section-title">Payment History</h2>
      {payments.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No payments recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p._id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-green-700">GHS {p.amount?.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.payment_method === 'paystack' ? '📱 Mobile Money / Card' : '💵 Cash'}
                  </p>
                  {p.paystack_reference && (
                    <p className="text-xs text-gray-400 font-mono truncate">{p.paystack_reference}</p>
                  )}
                  {p.paid_by?.name && p.paid_by.name !== user?.name && (
                    <p className="text-xs text-blue-500">Paid by: {p.paid_by.name} ({p.paid_by.user_role})</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">{format(new Date(p.payment_date || p.createdAt), 'MMM d, yyyy')}</p>
                  <span className="badge bg-green-100 text-green-700 mt-1">✓ Paid</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
