import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import ProgressBar from '../../components/ProgressBar'
import ConfirmModal from '../../components/ConfirmModal'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function AdminCustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [lockModal, setLockModal] = useState(false)
  const [lockAction, setLockAction] = useState('')
  const [lockLoading, setLockLoading] = useState(false)
  const [resetModal, setResetModal] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [imageModal, setImageModal] = useState(null)

  const fetchCustomer = async () => {
    try {
      const [custRes, txRes] = await Promise.all([
        api.get(`/admin/customers/${id}`),
        api.get(`/admin/customers/${id}/transactions`),
      ])
      setCustomer(custRes.data?.customer || custRes.data)
      setTransactions(txRes.data?.transactions || txRes.data || [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load customer details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomer()
  }, [id])

  const handleLockToggle = async () => {
    setLockLoading(true)
    try {
      const endpoint = lockAction === 'lock'
        ? `/admin/customers/${id}/lock`
        : `/admin/customers/${id}/unlock`
      await api.post(endpoint)
      toast.success(`Device ${lockAction === 'lock' ? 'locked' : 'unlocked'} successfully!`)
      setLockModal(false)
      fetchCustomer()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Action failed')
    } finally {
      setLockLoading(false)
    }
  }

  const handleResetPassword = async () => {
    setResetLoading(true)
    try {
      await api.post(`/admin/customers/${id}/reset-password`)
      toast.success('Password reset email sent to customer!')
      setResetModal(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to reset password')
    } finally {
      setResetLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="xl" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-gray-500 text-lg">Customer not found</p>
        <button onClick={() => navigate(-1)} className="text-green-700 font-semibold">Go Back</button>
      </div>
    )
  }

  const plan = customer.payment_plan || customer.plan
  const device = customer.device

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24 pt-4">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-green-700 font-semibold text-sm mb-4 hover:text-green-900"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Customers
      </button>

      {/* Customer Info Card */}
      <div className="bg-white rounded-2xl shadow-card p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-2xl bg-green-100 overflow-hidden flex-shrink-0">
            {customer.photo_url ? (
              <img
                src={customer.photo_url}
                alt={customer.full_name}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setImageModal(customer.photo_url)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-green-800 font-black text-3xl">
                  {(customer.full_name || 'C').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-gray-900">{customer.full_name}</h1>
            <p className="text-sm font-bold text-green-700 mt-0.5">{customer.account_number}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <StatusBadge status={plan?.status || customer.plan_status || 'active'} />
              {device?.is_locked && <StatusBadge status="locked" />}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {customer.email}
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {customer.phone}
          </div>
          {customer.ghana_card_id && (
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
              </svg>
              Ghana Card: {customer.ghana_card_id}
            </div>
          )}
          {customer.location && (
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {[customer.location, customer.district, customer.region].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Ghana Card Photos */}
      {(customer.ghana_card_front_url || customer.ghana_card_back_url) && (
        <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Ghana Card</h3>
          <div className="grid grid-cols-2 gap-3">
            {customer.ghana_card_front_url && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Front</p>
                <img
                  src={customer.ghana_card_front_url}
                  alt="Ghana Card Front"
                  className="w-full h-28 object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setImageModal(customer.ghana_card_front_url)}
                />
              </div>
            )}
            {customer.ghana_card_back_url && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Back</p>
                <img
                  src={customer.ghana_card_back_url}
                  alt="Ghana Card Back"
                  className="w-full h-28 object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setImageModal(customer.ghana_card_back_url)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Device Info */}
      {device && (
        <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">Device</h3>
            <div className="flex gap-2">
              {device.is_locked ? (
                <button
                  onClick={() => { setLockAction('unlock'); setLockModal(true) }}
                  className="px-3 py-1.5 bg-green-100 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-200 transition-colors"
                >
                  Unlock Device
                </button>
              ) : (
                <button
                  onClick={() => { setLockAction('lock'); setLockModal(true) }}
                  className="px-3 py-1.5 bg-red-100 text-red-700 rounded-xl text-xs font-semibold hover:bg-red-200 transition-colors"
                >
                  Lock Device
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Model</span>
              <span className="font-semibold text-gray-800">{device.model || device.device_model}</span>
            </div>
            {device.serial_number && (
              <div className="flex justify-between">
                <span className="text-gray-500">Serial</span>
                <span className="font-mono text-xs text-gray-700">{device.serial_number}</span>
              </div>
            )}
            {device.udid && (
              <div className="flex justify-between">
                <span className="text-gray-500">UDID/IMEI</span>
                <span className="font-mono text-xs text-gray-700 truncate max-w-[150px]">{device.udid}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Lock Status</span>
              <StatusBadge status={device.is_locked ? 'locked' : 'unlocked'} />
            </div>
          </div>
        </div>
      )}

      {/* Payment Plan */}
      {plan && (
        <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Payment Plan</h3>
          <ProgressBar
            current={plan.payments_made || 0}
            total={plan.total_payments || 1}
            height="lg"
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Device Price</p>
              <p className="font-bold text-gray-800">GHS {Number(plan.total_price || plan.device_price || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Down Payment</p>
              <p className="font-bold text-gray-800">GHS {Number(plan.down_payment || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Installment</p>
              <p className="font-bold text-gray-800">GHS {Number(plan.installment_amount || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Frequency</p>
              <p className="font-bold text-gray-800 capitalize">{plan.payment_frequency || plan.frequency}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Remaining</p>
              <p className="font-bold text-red-600">GHS {Number(plan.remaining_balance || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Next Due</p>
              <p className="font-bold text-gray-800">
                {plan.next_due_date ? format(new Date(plan.next_due_date), 'dd MMM yyyy') : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Admin Actions */}
      <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">Admin Actions</h3>
        <button
          onClick={() => setResetModal(true)}
          className="w-full py-3 px-4 rounded-xl border-2 border-orange-200 text-orange-700 font-semibold text-sm
                     hover:bg-orange-50 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Reset Customer Password
        </button>
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl shadow-card p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">Payment History</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No payments yet</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    GHS {Number(tx.amount).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {tx.created_at ? format(new Date(tx.created_at), 'dd MMM yyyy, HH:mm') : ''} • {tx.payment_method || tx.method}
                  </p>
                </div>
                <StatusBadge status={tx.status || 'paid'} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lock/Unlock Modal */}
      <ConfirmModal
        isOpen={lockModal}
        onClose={() => setLockModal(false)}
        onConfirm={handleLockToggle}
        title={lockAction === 'lock' ? 'Lock Device' : 'Unlock Device'}
        message={
          lockAction === 'lock'
            ? `This will remotely lock ${customer.full_name}'s iPhone. They won't be able to use it until unlocked.`
            : `This will unlock ${customer.full_name}'s iPhone and restore access.`
        }
        confirmText={lockAction === 'lock' ? 'Lock Device' : 'Unlock Device'}
        confirmVariant={lockAction === 'lock' ? 'danger' : 'primary'}
        loading={lockLoading}
      />

      {/* Reset Password Modal */}
      <ConfirmModal
        isOpen={resetModal}
        onClose={() => setResetModal(false)}
        onConfirm={handleResetPassword}
        title="Reset Password"
        message={`Send a password reset link to ${customer.email}?`}
        confirmText="Send Reset Link"
        confirmVariant="primary"
        loading={resetLoading}
      />

      {/* Image Viewer Modal */}
      {imageModal && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => setImageModal(null)}
        >
          <img
            src={imageModal}
            alt="Full view"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setImageModal(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-white hover:bg-opacity-30"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
