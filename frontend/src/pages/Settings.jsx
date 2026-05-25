import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiSettings, FiBell, FiMail, FiSave } from 'react-icons/fi'
import { getSettings, updateSettings, testEmail } from '../api/settings'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'

const TABS = ['Company', 'Notifications', 'Email Config']

function CompanyTab({ settings, onSave, loading }) {
  const { register, handleSubmit } = useForm({ defaultValues: settings })
  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4 max-w-lg">
      {[
        { name: 'companyName', label: 'Company Name', placeholder: 'DAN & DOR SOLAR COMPANY LIMITED' },
        { name: 'companyAddress', label: 'Address', placeholder: 'Accra, Ghana' },
        { name: 'companyPhone', label: 'Phone', placeholder: '+233 XXX XXX XXX' },
        { name: 'companyEmail', label: 'Email', placeholder: 'info@company.com' },
      ].map(f => (
        <div key={f.name}>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{f.label}</label>
          <input {...register(f.name)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder={f.placeholder} />
        </div>
      ))}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Receipt Header</label>
        <textarea {...register('receiptHeader')} rows={2}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          placeholder="Text to appear at the top of receipts" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Receipt Footer</label>
        <textarea {...register('receiptFooter')} rows={2}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          placeholder="e.g. Thank you for your business!" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Low Stock Threshold</label>
          <input type="number" min="1" {...register('lowStockThreshold')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="5" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Tax Rate (%)</label>
          <input type="number" min="0" max="100" step="0.1" {...register('taxRate')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="0" />
        </div>
      </div>
      <button type="submit" disabled={loading}
        className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        <FiSave size={15} /> {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  )
}

function NotificationsTab({ settings, onSave, loading }) {
  const { register, handleSubmit } = useForm({ defaultValues: settings })
  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-5 max-w-lg">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Large Sale Alert Threshold (GH₵)</label>
        <input type="number" min="0" step="0.01" {...register('largeSaleThreshold')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="10000" />
        <p className="text-xs text-gray-500 mt-1">Alert when a single sale exceeds this amount</p>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Expense Alert Threshold (GH₵)</label>
        <input type="number" min="0" step="0.01" {...register('expenseThreshold')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="5000" />
      </div>
      <div className="space-y-3">
        {[
          { name: 'notifyOnLargeSale', label: 'Notify on large sales' },
          { name: 'notifyOnLowStock', label: 'Notify on low stock' },
          { name: 'notifyOnDebtOverdue', label: 'Notify on overdue debts' },
          { name: 'emailNotifications', label: 'Enable email notifications' },
        ].map(f => (
          <label key={f.name} className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" {...register(f.name)}
              className="w-4 h-4 accent-orange-500" />
            <span className="text-sm text-gray-700">{f.label}</span>
          </label>
        ))}
      </div>
      <button type="submit" disabled={loading}
        className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        <FiSave size={15} /> {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  )
}

function EmailConfigTab({ settings, onSave, loading }) {
  const { register, handleSubmit, getValues } = useForm({ defaultValues: settings })
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    try {
      await testEmail({ to: getValues('testEmail') || getValues('smtpFrom') })
      toast.success('Test email sent!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test email failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">SMTP Host</label>
          <input {...register('smtpHost')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="smtp.gmail.com" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">SMTP Port</label>
          <input type="number" {...register('smtpPort')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="587" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">SMTP Username</label>
        <input {...register('smtpUser')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="your@email.com" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">SMTP Password</label>
        <input type="password" {...register('smtpPassword')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="••••••••" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">From Email</label>
        <input type="email" {...register('smtpFrom')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="noreply@dandorsolar.com" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Test Email Address</label>
        <div className="flex gap-2">
          <input {...register('testEmail')}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="test@example.com" />
          <button type="button" onClick={handleTest} disabled={testing}
            className="px-4 py-2.5 border border-orange-500 text-orange-600 rounded-xl text-sm font-semibold hover:bg-orange-50 disabled:opacity-60">
            {testing ? 'Sending...' : 'Test'}
          </button>
        </div>
      </div>
      <button type="submit" disabled={loading}
        className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        <FiSave size={15} /> {loading ? 'Saving...' : 'Save Email Config'}
      </button>
    </form>
  )
}

export default function Settings() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      toast.success('Settings saved!')
      queryClient.invalidateQueries(['settings'])
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to save settings'),
  })

  const isSuperAdmin = user?.role === 'super_admin'
  const tabs = isSuperAdmin ? TABS : TABS.slice(0, 2)

  if (isLoading) return (
    <div className="p-6 flex justify-center">
      <LoadingSpinner text="Loading settings..." />
    </div>
  )

  const settings = data?.settings || data || {}

  const tabComponents = [
    <CompanyTab key="company" settings={settings} onSave={d => updateMutation.mutate(d)} loading={updateMutation.isPending} />,
    <NotificationsTab key="notif" settings={settings} onSave={d => updateMutation.mutate(d)} loading={updateMutation.isPending} />,
    <EmailConfigTab key="email" settings={settings} onSave={d => updateMutation.mutate(d)} loading={updateMutation.isPending} />,
  ]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader title="Settings" subtitle="Configure system preferences" />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((tab, i) => {
          const icons = [FiSettings, FiBell, FiMail]
          const Icon = icons[i]
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                ${activeTab === i ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
            >
              <Icon size={14} /> {tab}
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {tabComponents[activeTab]}
      </div>
    </div>
  )
}
