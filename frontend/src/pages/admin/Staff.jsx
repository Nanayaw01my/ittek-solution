import React, { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function AdminStaff() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [deleteModal, setDeleteModal] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState({})

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/staff')
      const d = res.data?.data || res.data
      setStaff(Array.isArray(d.staff) ? d.staff : [])
    } catch (err) {
      toast.error('Failed to load staff')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  const validateForm = () => {
    const e = {}
    if (!form.full_name.trim()) e.full_name = 'Name is required'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required'
    if (!form.phone.trim()) e.phone = 'Phone is required'
    if (!form.password || form.password.length < 4) e.password = 'Password must be at least 4 characters'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleAddStaff = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    setAddLoading(true)
    try {
      await api.post('/admin/staff', form)
      toast.success('Staff member added successfully!')
      setShowAddModal(false)
      setForm({ full_name: '', email: '', phone: '', password: '' })
      setErrors({})
      fetchStaff()
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to add staff member'
      toast.error(msg)
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await api.delete(`/admin/staff/${deleteModal.id}`)
      toast.success('Staff member removed')
      setDeleteModal(null)
      fetchStaff()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to remove staff')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500 mt-0.5">{staff.length} team members</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-800 text-white font-semibold text-sm rounded-2xl
                     hover:bg-green-900 active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Staff
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : staff.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-card">
          <svg className="w-14 h-14 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-gray-500 font-medium">No staff members yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card divide-y divide-gray-50">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-4">
              <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-bold">
                  {(s.full_name || s.name || 'S').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{s.full_name || s.name}</p>
                <p className="text-xs text-gray-500 truncate">{s.email}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {s.staff_id && (
                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">{s.staff_id}</span>
                  )}
                  {s.customers_count !== undefined && (
                    <span className="text-xs text-gray-400">{s.customers_count} customers</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.phone && <p className="text-xs text-gray-400 hidden sm:block">{s.phone}</p>}
                <button
                  onClick={() => setDeleteModal(s)}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  title="Remove staff"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900">Add Staff Member</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">A Staff ID will be auto-generated.</p>

            <form onSubmit={handleAddStaff} className="space-y-4" noValidate>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Enter full name"
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600
                    ${errors.full_name ? 'border-red-400' : 'border-gray-200'}`}
                />
                {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="staff@example.com"
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600
                    ${errors.email ? 'border-red-400' : 'border-gray-200'}`}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="0244000000"
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600
                    ${errors.phone ? 'border-red-400' : 'border-gray-200'}`}
                />
                {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Password <span className="text-gray-400 font-normal text-xs">(max 5 characters for simplicity)</span>
                </label>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value.slice(0, 20) }))}
                  placeholder="Set password"
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600
                    ${errors.password ? 'border-red-400' : 'border-gray-200'}`}
                />
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
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
                  Add Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        title="Remove Staff Member"
        message={`Are you sure you want to remove ${deleteModal?.full_name || deleteModal?.name}? This action cannot be undone.`}
        confirmText="Remove"
        confirmVariant="danger"
        loading={deleteLoading}
      />
    </div>
  )
}
