import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import ProgressBar from '../../components/ProgressBar'
import PaystackButton from '../../components/PaystackButton'
import { format } from 'date-fns'

export default function StaffCustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [custRes, txRes] = await Promise.allSettled([
        api.get(`/staff/customers/${id}`),
        api.get(`/staff/customers/${id}/transactions`),
      ])

      if (custRes.status === 'fulfilled') {
        const d = custRes.value.data?.data || custRes.value.data
        setCustomer(d?.customer || d)
      }
      if (txRes.status === 'fulfilled') {
        const d = txRes.value.data?.data || txRes.value.data
        setTransactions(Array.isArray(d.transactions) ? d.transactions : (Array.isArray(d.payments) ? d.payments : []))
      }
    } catch (err) {
      toast.error('Failed to load customer')
      navigate(-1)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const handlePaymentSuccess = (response) => {
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

  if (!customer) return null

  const plan = customer.payment_plan || customer.plan
  const device = customer.device

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24 pt-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-green-700 font-semibold text-sm mb-4 hover:text-green-900"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back
      </button>

      {/* Customer Profile Card */}
      <div className="bg-white rounded-2xl shadow-card p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-green-100 overflow-hidden flex-shrink-0">
            {customer.photo_url || customer.photos?.customer_photo ? (
              <img
                src={customer.photo_url || `/uploads/${customer.photos.customer_photo}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-green-800 font-black text-2xl">
                  {(customer.full_name || 'C').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-gray-900">{customer.full_name}</h2>
            <p className="text-sm font-bold text-green-700">
              {customer.account_number || customer.user_id?.account_number}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{customer.phone}</p>
            <p className="text-xs text-gray-400 truncate">{customer.email}</p>
          </div>
        </div>
      </div>

      {/* Device Info */}
      {(device || plan?.device_id) && (
        <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">Device</p>
              <p className="font-bold text-gray-800">{device?.model || plan?.device_id?.model || plan?.device_model}</p>
            </div>
            <StatusBadge status={device?.is_locked ? 'locked' : 'active'} />
          </div>
        </div>
      )}

      {/* Payment Plan */}
      {plan && (
        <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">Payment Plan</h3>
            <StatusBadge status={plan.status || 'active'} />
          </div>

          <ProgressBar
            current={plan.payments_made || 0}
            total={plan.total_payments || 1}
            height="lg"
          />

          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-green-50 rounded-xl p-2.5 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Remaining</p>
              <p className="text-sm font-bold text-green-800">
                GHS {Number(plan.remaining_balance || 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Installment</p>
              <p className="text-sm font-bold text-gray-800">
                GHS {Number(plan.installment_amount || 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-orange-50 rounded-xl p-2.5 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Next Due</p>
              <p className="text-xs font-bold text-orange-700">
                {plan.next_due_date ? format(new Date(plan.next_due_date), 'dd MMM') : 'N/A'}
              </p>
            </div>
          </div>

          {/* Make Payment */}
          {plan.status === 'active' && (
            <div className="mt-4">
              <PaystackButton
                amount={plan.installment_amount || 0}
                email={customer.email}
                planId={plan.id || plan._id}
                label={`Make Payment for Customer`}
                onSuccess={handlePaymentSuccess}
                onClose={() => {}}
                metadata={{ customer_id: id, is_staff_initiated: true }}
              />
            </div>
          )}
        </div>
      )}

      {/* Payment History */}
      <div className="bg-white rounded-2xl shadow-card p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">Payment History</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No payments recorded yet</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {transactions.map((tx) => (
              <div key={tx.id || tx._id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    GHS {Number(tx.amount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {tx.created_at || tx.payment_date || tx.createdAt
                      ? format(new Date(tx.created_at || tx.payment_date || tx.createdAt), 'dd MMM yyyy')
                      : ''}{' '}
                    • {tx.payment_method || tx.method || 'Mobile Money'}
                  </p>
                  {(tx.reference || tx.paystack_reference) && (
                    <p className="text-xs font-mono text-gray-400 truncate max-w-[180px]">
                      {(tx.reference || tx.paystack_reference).slice(0, 20)}...
                    </p>
                  )}
                </div>
                <StatusBadge status={tx.status || 'paid'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
