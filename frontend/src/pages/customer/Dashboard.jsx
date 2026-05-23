import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import ProgressBar from '../../components/ProgressBar'
import PaystackButton from '../../components/PaystackButton'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'

export default function CustomerDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paymentData, setPaymentData] = useState(null)
  const [initiatingPayment, setInitiatingPayment] = useState(false)

  useEffect(() => { fetchDashboard() }, [])

  const fetchDashboard = async () => {
    setLoading(true)
    try {
      const res = await api.get('/customer/dashboard')
      setData(res.data.data)
    } catch {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const initPayment = async () => {
    setInitiatingPayment(true)
    try {
      const res = await api.post('/payment/initialize')
      setPaymentData(res.data.data)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to initialize payment')
    } finally {
      setInitiatingPayment(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>

  const plan = data?.plan
  const device = data?.device
  const progress = plan ? Math.round((plan.payments_made / plan.total_payments) * 100) : 0
  const isLocked = device?.lock_status === 'locked'
  const isOverdue = plan?.status === 'defaulted'

  return (
    <div className="pb-24">
      {/* Header */}
      <div className={`px-4 pt-6 pb-8 rounded-b-3xl ${isLocked ? 'bg-red-600' : 'bg-primary-800'}`}>
        <p className="text-white text-opacity-80 text-sm">Welcome back,</p>
        <h1 className="text-white text-2xl font-bold">{user?.name?.split(' ')[0]}</h1>
        {user?.account_number && <p className="text-white text-opacity-60 text-xs mt-0.5">{user.account_number}</p>}
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Device Status Card */}
        {device && plan ? (
          <div className="card-lg shadow-card-hover">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-lg text-gray-900">{device.model}</h2>
                <p className="text-xs text-gray-500">Serial: {device.serial_number || 'N/A'}</p>
              </div>
              <div className="text-right">
                <StatusBadge status={isLocked ? 'locked' : plan.status} />
                {isLocked && <p className="text-xs text-red-500 mt-1 font-semibold pulse-red">🔒 LOCKED</p>}
              </div>
            </div>

            {/* Progress */}
            <ProgressBar progress={progress} label={`${plan.payments_made} of ${plan.total_payments} payments`} />

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-green-50 rounded-xl p-2.5 text-center">
                <p className="text-xs text-gray-500">Paid</p>
                <p className="font-bold text-green-700 text-sm">GHS {(plan.down_payment + (plan.payments_made * plan.installment_amount)).toLocaleString()}</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-2.5 text-center">
                <p className="text-xs text-gray-500">Remaining</p>
                <p className="font-bold text-orange-600 text-sm">GHS {plan.remaining_balance?.toLocaleString()}</p>
              </div>
              <div className={`rounded-xl p-2.5 text-center ${isOverdue ? 'bg-red-50' : 'bg-blue-50'}`}>
                <p className="text-xs text-gray-500">Next Due</p>
                <p className={`font-bold text-sm ${isOverdue ? 'text-red-600' : 'text-blue-600'}`}>
                  {plan.next_due_date ? format(new Date(plan.next_due_date), 'MMM d') : 'N/A'}
                </p>
              </div>
            </div>

            {/* Next Payment Amount */}
            <div className={`mt-3 rounded-xl p-3 ${isOverdue ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">{isOverdue ? 'OVERDUE PAYMENT' : 'Next Installment'}</p>
                  <p className={`text-xl font-bold ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                    GHS {plan.installment_amount?.toLocaleString()}
                  </p>
                  {plan.next_due_date && (
                    <p className={`text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
                      {isOverdue ? `Was due ${format(new Date(plan.next_due_date), 'MMM d, yyyy')}` : `Due ${format(new Date(plan.next_due_date), 'EEEE, MMM d, yyyy')}`}
                    </p>
                  )}
                </div>
                {plan.status !== 'completed' && (
                  <div>
                    {paymentData ? (
                      <PaystackButton
                        amount={plan.installment_amount}
                        email={user?.email}
                        reference={paymentData.reference}
                        authorizationUrl={paymentData.authorization_url}
                        onSuccess={() => { toast.success('Payment successful! Your device will unlock shortly.'); fetchDashboard(); setPaymentData(null) }}
                        onClose={() => setPaymentData(null)}
                        label="Pay Now"
                        compact
                      />
                    ) : (
                      <button onClick={initPayment} disabled={initiatingPayment} className="btn-primary py-2 px-4 text-sm">
                        {initiatingPayment ? <LoadingSpinner size="sm" color="white" /> : 'Pay Now'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {plan.status === 'completed' && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-green-700 font-bold">🎉 Fully Paid!</p>
                <p className="text-green-600 text-sm">Your {device.model} is yours!</p>
              </div>
            )}
          </div>
        ) : (
          <div className="card text-center py-8">
            <p className="text-gray-500">No active installment plan.</p>
            <p className="text-sm text-gray-400 mt-1">Contact Tritech Hub iOS to get started.</p>
          </div>
        )}

        {/* Lock Warning */}
        {isLocked && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <h3 className="font-bold text-red-700 flex items-center gap-2">🔒 Device Locked</h3>
            <p className="text-sm text-red-600 mt-1">Your device has been locked due to an overdue payment. Make a payment to unlock it automatically within minutes.</p>
          </div>
        )}

        {/* Recent Payments */}
        {data?.recentPayments?.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="section-title mb-0">Recent Payments</h3>
              <button onClick={() => navigate('/customer/payments')} className="text-sm text-primary-700 font-semibold">View All</button>
            </div>
            <div className="space-y-2">
              {data.recentPayments.slice(0, 5).map(p => (
                <div key={p._id} className="card">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-green-700">GHS {p.amount?.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">{p.payment_method === 'paystack' ? 'Mobile Money / Card' : 'Cash'}</p>
                    </div>
                    <p className="text-xs text-gray-500">{format(new Date(p.payment_date || p.createdAt), 'MMM d, yyyy')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
