import React, { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import ConfirmModal from '../../components/ConfirmModal'
import toast from 'react-hot-toast'

const IPHONE_MODELS = [
  { model: 'iPhone 14', price: 8500 },
  { model: 'iPhone 14 Pro', price: 11000 },
  { model: 'iPhone 14 Pro Max', price: 12500 },
  { model: 'iPhone 15', price: 10500 },
  { model: 'iPhone 15 Pro', price: 14000 },
  { model: 'iPhone 15 Pro Max', price: 16000 },
  { model: 'iPhone 16', price: 18000 },
]

export default function AdminDevices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [lockFilter, setLockFilter] = useState('')
  const [lockModal, setLockModal] = useState(null)
  const [lockLoading, setLockLoading] = useState(false)
  const [form, setForm] = useState({ model: '', price: '', serial_number: '', udid: '' })
  const [errors, setErrors] = useState({})

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        ...(statusFilter && { status: statusFilter }),
        ...(lockFilter && { is_locked: lockFilter }),
      })
      const res = await api.get(`/admin/devices?${params}`)
      const d = res.data?.data || res.data
      setDevices(Array.isArray(d.devices) ? d.devices : [])
    } catch (err) {
      toast.error('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, lockFilter])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const handleModelChange = (model) => {
    const found = IPHONE_MODELS.find(m => m.model === model)
    setForm(f => ({ ...f, model, price: found ? String(found.price) : '' }))
  }

  const validateForm = () => {
    const e = {}
    if (!form.model) e.model = 'Select a model'
    if (!form.serial_number.trim()) e.serial_number = 'Serial number required'
    if (!form.udid.trim()) e.udid = 'UDID/IMEI required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleAddDevice = async (ev) => {
    ev.preventDefault()
    if (!validateForm()) return
    setAddLoading(true)
    try {
      await api.post('/admin/devices', form)
      toast.success('Device added successfully!')
      setShowAddModal(false)
      setForm({ model: '', price: '', serial_number: '', udid: '' })
      setErrors({})
      fetchDevices()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add device')
    } finally {
      setAddLoading(false)
    }
  }

  const handleLockToggle = async () => {
    setLockLoading(true)
    try {
      const endpoint = lockModal.is_locked
        ? `/admin/devices/${lockModal.id}/unlock`
        : `/admin/devices/${lockModal.id}/lock`
      await api.post(endpoint)
      toast.success(`Device ${lockModal.is_locked ? 'unlocked' : 'locked'}!`)
      setLockModal(null)
      fetchDevices()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Action failed')
    } finally {
      setLockLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 pt-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Devices</h1>
          <p className="text-sm text-gray-500 mt-0.5">{devices.length} devices in inventory</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-800 text-white font-semibold text-sm rounded-2xl
                     hover:bg-green-900 active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Device
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex-1 px-3 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600 bg-white"
        >
          <option value="">All Devices</option>
          <option value="available">Available</option>
          <option value="sold">Sold</option>
        </select>
        <select
          value={lockFilter}
          onChange={(e) => setLockFilter(e.target.value)}
          className="flex-1 px-3 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600 bg-white"
        >
          <option value="">All Lock Status</option>
          <option value="false">Unlocked</option>
          <option value="true">Locked</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : devices.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-card">
          <svg className="w-14 h-14 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-500 font-medium">No devices found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card divide-y divide-gray-50">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-4">
              <div className="w-11 h-11 rounded-2xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{d.model || d.device_model}</p>
                <p className="text-xs text-gray-500 font-mono truncate">SN: {d.serial_number}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <StatusBadge status={d.status || 'available'} />
                  {d.is_locked && <StatusBadge status="locked" />}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-gray-800">GHS {Number(d.price || 0).toLocaleString()}</p>
                <button
                  onClick={() => setLockModal(d)}
                  className={`mt-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors
                    ${d.is_locked
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                >
                  {d.is_locked ? 'Unlock' : 'Lock'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900">Add Device</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddDevice} className="space-y-4" noValidate>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">iPhone Model</label>
                <select
                  value={form.model}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600
                    ${errors.model ? 'border-red-400' : 'border-gray-200'}`}
                >
                  <option value="">Select model</option>
                  {IPHONE_MODELS.map(m => (
                    <option key={m.model} value={m.model}>{m.model}</option>
                  ))}
                </select>
                {errors.model && <p className="text-xs text-red-500 mt-1">{errors.model}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Price (GHS)</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="Auto-filled from model"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Serial Number</label>
                <input
                  type="text"
                  value={form.serial_number}
                  onChange={(e) => setForm(f => ({ ...f, serial_number: e.target.value }))}
                  placeholder="e.g. F2LW2ABCDEF"
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600 font-mono
                    ${errors.serial_number ? 'border-red-400' : 'border-gray-200'}`}
                />
                {errors.serial_number && <p className="text-xs text-red-500 mt-1">{errors.serial_number}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">UDID / IMEI</label>
                <input
                  type="text"
                  value={form.udid}
                  onChange={(e) => setForm(f => ({ ...f, udid: e.target.value }))}
                  placeholder="Device UDID or IMEI"
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600 font-mono
                    ${errors.udid ? 'border-red-400' : 'border-gray-200'}`}
                />
                {errors.udid && <p className="text-xs text-red-500 mt-1">{errors.udid}</p>}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 border-2 border-gray-200 rounded-2xl text-gray-700 font-semibold text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 py-3 bg-green-800 text-white font-semibold text-sm rounded-2xl
                             hover:bg-green-900 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {addLoading && <LoadingSpinner size="sm" color="white" />}
                  Add Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!lockModal}
        onClose={() => setLockModal(null)}
        onConfirm={handleLockToggle}
        title={lockModal?.is_locked ? 'Unlock Device' : 'Lock Device'}
        message={`${lockModal?.is_locked ? 'Unlock' : 'Lock'} ${lockModal?.model}? SN: ${lockModal?.serial_number}`}
        confirmText={lockModal?.is_locked ? 'Unlock' : 'Lock'}
        confirmVariant={lockModal?.is_locked ? 'primary' : 'danger'}
        loading={lockLoading}
      />
    </div>
  )
}
