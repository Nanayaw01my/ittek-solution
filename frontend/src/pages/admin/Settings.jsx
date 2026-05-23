import React, { useState, useEffect } from 'react'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    business_name: 'Tritech Hub iOS',
    contact_email: '',
    contact_phone: '',
    contact_address: '',
    whatsapp_number: '',
    currency: 'GHS',
    payment_reminder_days: 1,
    auto_lock_days: 3,
  })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)

  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwErrors, setPwErrors] = useState({})

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/admin/settings')
        setSettings(prev => ({ ...prev, ...(res.data?.data || res.data) }))
      } catch {
        // Use defaults
      } finally {
        setSettingsLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSettingsSaving(true)
    try {
      await api.put('/admin/settings', settings)
      toast.success('Settings saved successfully!')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  const validatePassword = () => {
    const e = {}
    if (!passwordForm.current_password) e.current_password = 'Current password required'
    if (!passwordForm.new_password || passwordForm.new_password.length < 6) e.new_password = 'Min 6 characters'
    if (passwordForm.new_password !== passwordForm.confirm_password) e.confirm_password = 'Passwords do not match'
    setPwErrors(e)
    return Object.keys(e).length === 0
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!validatePassword()) return
    setPwLoading(true)
    try {
      await api.post('/admin/change-password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      })
      toast.success('Password changed successfully!')
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
      setPwErrors({})
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to change password')
    } finally {
      setPwLoading(false)
    }
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24 pt-4">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure app settings</p>
      </div>

      {/* Business Settings */}
      <div className="bg-white rounded-2xl shadow-card p-5 mb-4">
        <h2 className="text-base font-bold text-gray-800 mb-4">Business Information</h2>
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Business Name</label>
            <input
              type="text"
              value={settings.business_name}
              onChange={(e) => setSettings(s => ({ ...s, business_name: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contact Email</label>
            <input
              type="email"
              value={settings.contact_email}
              onChange={(e) => setSettings(s => ({ ...s, contact_email: e.target.value }))}
              placeholder="info@tritechhub.com"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contact Phone</label>
            <input
              type="tel"
              value={settings.contact_phone}
              onChange={(e) => setSettings(s => ({ ...s, contact_phone: e.target.value }))}
              placeholder="0244000000"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">WhatsApp Number</label>
            <input
              type="tel"
              value={settings.whatsapp_number}
              onChange={(e) => setSettings(s => ({ ...s, whatsapp_number: e.target.value }))}
              placeholder="+233244000000"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Business Address</label>
            <textarea
              value={settings.contact_address}
              onChange={(e) => setSettings(s => ({ ...s, contact_address: e.target.value }))}
              placeholder="Physical address"
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Payment Reminder <span className="text-gray-400 font-normal">(days before)</span>
              </label>
              <input
                type="number"
                min="1" max="7"
                value={settings.payment_reminder_days}
                onChange={(e) => setSettings(s => ({ ...s, payment_reminder_days: Number(e.target.value) }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Auto-lock After <span className="text-gray-400 font-normal">(days overdue)</span>
              </label>
              <input
                type="number"
                min="1" max="30"
                value={settings.auto_lock_days}
                onChange={(e) => setSettings(s => ({ ...s, auto_lock_days: Number(e.target.value) }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-green-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={settingsSaving}
            className="w-full py-3.5 bg-green-800 text-white font-bold rounded-2xl
                       hover:bg-green-900 disabled:opacity-60 flex items-center justify-center gap-2
                       active:scale-95 transition-all"
          >
            {settingsSaving && <LoadingSpinner size="sm" color="white" />}
            Save Settings
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl shadow-card p-5">
        <h2 className="text-base font-bold text-gray-800 mb-4">Change Admin Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPw ? 'text' : 'password'}
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm(f => ({ ...f, current_password: e.target.value }))}
                placeholder="Enter current password"
                className={`w-full px-4 py-3 pr-12 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600
                  ${pwErrors.current_password ? 'border-red-400' : 'border-gray-200'}`}
              />
              <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                {showCurrentPw ? '🙈' : '👁'}
              </button>
            </div>
            {pwErrors.current_password && <p className="text-xs text-red-500 mt-1">{pwErrors.current_password}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNewPw ? 'text' : 'password'}
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm(f => ({ ...f, new_password: e.target.value }))}
                placeholder="Min 6 characters"
                className={`w-full px-4 py-3 pr-12 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600
                  ${pwErrors.new_password ? 'border-red-400' : 'border-gray-200'}`}
              />
              <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                {showNewPw ? '🙈' : '👁'}
              </button>
            </div>
            {pwErrors.new_password && <p className="text-xs text-red-500 mt-1">{pwErrors.new_password}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={passwordForm.confirm_password}
              onChange={(e) => setPasswordForm(f => ({ ...f, confirm_password: e.target.value }))}
              placeholder="Confirm new password"
              className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600
                ${pwErrors.confirm_password ? 'border-red-400' : 'border-gray-200'}`}
            />
            {pwErrors.confirm_password && <p className="text-xs text-red-500 mt-1">{pwErrors.confirm_password}</p>}
          </div>

          <button
            type="submit"
            disabled={pwLoading}
            className="w-full py-3.5 bg-gray-800 text-white font-bold rounded-2xl
                       hover:bg-gray-900 disabled:opacity-60 flex items-center justify-center gap-2
                       active:scale-95 transition-all"
          >
            {pwLoading && <LoadingSpinner size="sm" color="white" />}
            Change Password
          </button>
        </form>
      </div>
    </div>
  )
}
