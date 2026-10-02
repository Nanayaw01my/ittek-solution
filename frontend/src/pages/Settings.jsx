import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiSettings, FiBell, FiMail, FiSave, FiTrash2, FiAlertTriangle, FiX, FiMessageSquare, FiSend, FiCheckCircle } from 'react-icons/fi'
import { getSettings, updateSettings, testEmail, updateSmsConfig, testSms, getSmsBalance } from '../api/settings'
import api from '../api/axios'
import { clearAllOfflineData } from '../utils/offlineQueue'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import ImageUpload from '../components/ImageUpload'

const TABS = ['Company', 'Notifications', 'Text messages', 'Email Config']

/**
 * The API speaks snake_case; these forms were written in camelCase, so every
 * field arrived as undefined and nothing but the logo (which was already
 * snake_case) was ever saved. Map explicitly in both directions.
 */
const COMPANY_FIELDS = {
  companyName: 'company_name',
  companyAddress: 'company_address',
  companyPhone: 'company_phone',
  companyEmail: 'company_email',
  receiptHeader: 'receipt_header',
  receiptFooter: 'receipt_footer',
  lowStockThreshold: 'low_stock_alert',
  taxRate: 'tax_rate',
}

const toFormValues = (settings, map) =>
  Object.entries(map).reduce((acc, [formKey, apiKey]) => {
    acc[formKey] = settings?.[apiKey] ?? ''
    return acc
  }, {})

const toApiPayload = (data, map) =>
  Object.entries(map).reduce((acc, [formKey, apiKey]) => {
    if (data[formKey] !== undefined && data[formKey] !== '') acc[apiKey] = data[formKey]
    return acc
  }, {})

function CompanyTab({ settings, onSave, loading }) {
  const [logoUrl, setLogoUrl] = useState(settings?.logo_url || null)
  const [logoInput, setLogoInput] = useState(settings?.logo_url || '')
  const { register, handleSubmit } = useForm({
    defaultValues: {
      ...toFormValues(settings, COMPANY_FIELDS),
      receipt_width_mm: settings?.receipt_width_mm ?? 80,
    },
  })

  const handleLogoChange = (url) => {
    setLogoUrl(url || null)
    setLogoInput(url || '')
  }

  return (
    <form
      onSubmit={handleSubmit((data) => onSave({
        ...toApiPayload(data, COMPANY_FIELDS),
        // Numbers come back from the form as strings.
        tax_rate: data.taxRate === '' ? undefined : Number(data.taxRate),
        low_stock_alert: data.lowStockThreshold === '' ? undefined : Number(data.lowStockThreshold),
        receipt_width_mm: Number(data.receipt_width_mm) || 80,
        logo_url: logoUrl,
      }))}
      className="space-y-4 max-w-lg"
    >
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Company Logo</label>
        <ImageUpload
          value={logoUrl}
          onChange={handleLogoChange}
          folder="logo"
          size="lg"
        />
        <div className="mt-2">
          <label className="block text-xs text-gray-500 mb-1">Or paste a direct image URL</label>
          <input
            type="url"
            value={logoInput}
            onChange={e => { setLogoInput(e.target.value); setLogoUrl(e.target.value || null) }}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-600"
            placeholder="https://example.com/logo.png"
          />
          <p className="text-xs text-gray-400 mt-1">This URL is used as the watermark on credit agreement PDFs</p>
        </div>
      </div>
      {[
        { name: 'companyName', label: 'Company Name', placeholder: 'DAN & DOR SOLAR COMPANY LIMITED' },
        { name: 'companyAddress', label: 'Address', placeholder: 'Bogoso, Western Region' },
        { name: 'companyPhone', label: 'Phone', placeholder: '+233 595413632' },
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
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Receipt Paper Width</label>
        <select {...register('receipt_width_mm')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value={80}>80mm — standard thermal roll</option>
          <option value={58}>58mm — narrow thermal roll</option>
          <option value={76}>76mm</option>
          <option value={82}>82mm — widest this printer takes</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">
          The printed receipt scales to this width. Measure your roll if you are unsure — printing at
          the wrong width slices off the right-hand edge.
        </p>
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
  const { register, handleSubmit } = useForm({
    defaultValues: {
      largeSaleThreshold: settings?.notification_settings?.large_sale_threshold ?? '',
      expenseThreshold: settings?.notification_settings?.expense_threshold ?? '',
      activityAlerts: settings?.notification_settings?.activity_alerts ?? 'important',
      saleAlerts: settings?.notification_settings?.sale_alerts ?? 'all',
      expenseAlerts: settings?.notification_settings?.expense_alerts ?? 'all',
    },
  })
  return (
    <form
      onSubmit={handleSubmit((data) => onSave({
        notification_settings: {
          large_sale_threshold: Number(data.largeSaleThreshold) || 0,
          expense_threshold: Number(data.expenseThreshold) || 0,
          activity_alerts: data.activityAlerts,
          sale_alerts: data.saleAlerts,
          expense_alerts: data.expenseAlerts,
        },
      }))}
      className="space-y-5 max-w-lg"
    >
      {/* What staff do, and how much of it reaches the phone. */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Tell me what staff are doing
        </label>
        <select {...register('activityAlerts')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="important">Everything in the app — important things on my phone</option>
          <option value="all">Everything, on my phone too</option>
          <option value="off">Nothing</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Every action is recorded either way. This only decides how much of it
          interrupts you. "Everything on my phone" means a buzz for each sale —
          useful for a week away, heavy for every day.
        </p>
      </div>

      {/* Sales and expenses happen all day, so they get their own dial. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Sales on my phone</label>
          <select {...register('saleAlerts')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
            <option value="all">Every sale</option>
            <option value="large">Only large ones</option>
            <option value="off">None — app only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Large sale is over (GH₵)</label>
          <input type="number" min="0" step="0.01" {...register('largeSaleThreshold')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="5000" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Expenses on my phone</label>
          <select {...register('expenseAlerts')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
            <option value="all">Every expense</option>
            <option value="large">Only large ones</option>
            <option value="off">None — app only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Large expense is over (GH₵)</label>
          <input type="number" min="0" step="0.01" {...register('expenseThreshold')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="1000" />
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-2">
        A large one is announced as large whichever setting you choose, so it stands
        out from the ordinary run of the day.
      </p>
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


/**
 * Arkesel: the key, the sender ID, and proof that it works.
 *
 * The key is never sent to this screen — only whether one is set and its last
 * four characters — so the box is left blank to keep the key that is there
 * and filled in only to replace it. A blank box on save would otherwise wipe
 * a working key every time the sender ID was touched.
 */
function SmsConfigTab({ settings }) {
  const queryClient = useQueryClient()
  const cfg = settings?.sms_config || {}
  const [apiKey, setApiKey] = useState('')
  const [senderId, setSenderId] = useState(cfg.sender_id || '')
  const [enabled, setEnabled] = useState(cfg.enabled !== false)
  const [testNumber, setTestNumber] = useState('')

  const { data: credits, refetch: refetchCredits, isFetching: checkingCredits } = useQuery({
    queryKey: ['sms-balance'],
    queryFn: () => getSmsBalance().then((r) => r.data),
    retry: false,
    enabled: !!cfg.api_key_set,
  })

  const save = useMutation({
    mutationFn: () => updateSmsConfig({
      api_key: apiKey.trim() || undefined,
      sender_id: senderId,
      enabled,
    }),
    onSuccess: () => {
      toast.success('SMS settings saved.')
      setApiKey('')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['sms-balance'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save'),
  })

  const test = useMutation({
    mutationFn: () => testSms(testNumber),
    onSuccess: (res) => toast.success(res.data?.message || 'Sent.', { duration: 7000 }),
    onError: (err) => toast.error(err.response?.data?.message || 'Could not send', { duration: 9000 }),
  })

  const field = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
      <div className="flex items-start gap-3">
        <FiMessageSquare className="text-orange-500 mt-0.5 flex-shrink-0" size={18} />
        <div>
          <h3 className="font-black text-gray-900">Sending text messages</h3>
          <p className="text-xs text-gray-500">
            Reminders go out as real text messages through Arkesel, instead of
            opening WhatsApp and trusting somebody to press send.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-orange-500" />
        <span>
          <span className="font-bold">Texting is on</span>
          <span className="block text-xs text-gray-500">
            Turn this off to stop every Text button at once, without deleting the key.
          </span>
        </span>
      </label>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Arkesel API key
          {cfg.api_key_set && (
            <span className="ml-2 inline-flex items-center gap-1 font-normal text-green-700">
              <FiCheckCircle size={11} /> set, ending {cfg.api_key_tail}
            </span>
          )}
        </label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder={cfg.api_key_set ? 'Leave blank to keep the key you have' : 'Paste the key from your Arkesel dashboard'}
          className={field} autoComplete="new-password" />
        <p className="mt-1 text-[11px] text-gray-400">
          Nobody can read it back out afterwards, including this screen.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Sender ID <span className="font-normal text-gray-400">— what the customer sees it from</span>
        </label>
        <input value={senderId} onChange={(e) => setSenderId(e.target.value.slice(0, 11))}
          placeholder="e.g. DANDOR" maxLength={11} className={field} />
        <p className="mt-1 text-[11px] text-gray-400">
          {senderId.length}/11 characters. It has to be one Arkesel has registered
          for you, or every message is refused.
        </p>
      </div>

      {cfg.api_key_set && (
        <div className="flex items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-orange-700 font-semibold">Credits left</p>
            <p className="text-xl font-black text-orange-600">
              {checkingCredits ? '…' : credits?.balance ?? '—'}
            </p>
          </div>
          <button onClick={() => refetchCredits()} disabled={checkingCredits}
            className="px-3 py-1.5 text-xs font-bold text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-100 disabled:opacity-50">
            Check again
          </button>
        </div>
      )}

      <button onClick={() => save.mutate()} disabled={save.isPending}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2">
        <FiSave size={15} /> {save.isPending ? 'Saving…' : 'Save SMS settings'}
      </button>

      {/* A wrong key, an unregistered sender ID and an empty account all look
          the same from the Reminders screen — nobody replies. This tells them
          apart before a whole list is sent into nothing. */}
      <div className="border-t border-gray-100 pt-5">
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Send a test message to a phone you are holding
        </label>
        <div className="flex gap-2">
          <input value={testNumber} onChange={(e) => setTestNumber(e.target.value)}
            placeholder="0244…" className={field} />
          <button onClick={() => test.mutate()} disabled={!testNumber.trim() || test.isPending}
            className="px-4 py-2.5 bg-gray-900 hover:bg-black disabled:opacity-40 text-white rounded-xl font-bold text-sm inline-flex items-center gap-1.5 flex-shrink-0">
            <FiSend size={14} /> {test.isPending ? 'Sending…' : 'Test'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">
          Save the key first. This spends one credit.
        </p>
      </div>
    </div>
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
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [clearing, setClearing] = useState(false)

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

  const isSuperAdmin = user?.role === 'Super Admin'
  const tabs = isSuperAdmin ? TABS : TABS.slice(0, 3)

  const handleClearData = async () => {
    if (confirmText !== 'CLEAR') return
    setClearing(true)
    try {
      await api.delete('/settings/clear-data')
      clearAllOfflineData()
      toast.success('All business data and offline cache cleared!')
      queryClient.invalidateQueries()
      setShowClearConfirm(false)
      setConfirmText('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to clear data')
    } finally {
      setClearing(false)
    }
  }

  if (isLoading) return (
    <div className="p-6 flex justify-center">
      <LoadingSpinner text="Loading settings..." />
    </div>
  )

  const settings = data || {}

  const tabComponents = [
    <CompanyTab key="company" settings={settings} onSave={d => updateMutation.mutate(d)} loading={updateMutation.isPending} />,
    <NotificationsTab key="notif" settings={settings} onSave={d => updateMutation.mutate(d)} loading={updateMutation.isPending} />,
    <SmsConfigTab key="sms" settings={settings} />,
    <EmailConfigTab key="email" settings={settings} onSave={d => updateMutation.mutate(d)} loading={updateMutation.isPending} />,
  ]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title="Settings" subtitle="Configure system preferences" />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
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

      {/* Danger Zone — Super Admin only */}
      {isSuperAdmin && (
        <div className="bg-white rounded-xl border-2 border-red-200 overflow-hidden">
          <div className="bg-red-50 px-6 py-4 border-b border-red-200 flex items-center gap-3">
            <FiAlertTriangle size={18} className="text-red-500" />
            <h3 className="font-bold text-red-700">Danger Zone</h3>
          </div>
          <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900 text-sm">Clear All Business Data</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Permanently deletes all sales, debts, products, expenses, credit agreements and other records.
                Your account and settings are kept.
              </p>
            </div>
            <button
              onClick={() => { setShowClearConfirm(true); setConfirmText('') }}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-sm whitespace-nowrap transition-colors flex-shrink-0"
            >
              <FiTrash2 size={15} /> Clear All Data
            </button>
          </div>
        </div>
      )}

      {/* Clear Data Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowClearConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-red-500 rounded-t-2xl">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <FiAlertTriangle size={18} /> Confirm Clear Data
              </h3>
              <button onClick={() => setShowClearConfirm(false)} className="text-white hover:text-red-200 p-1">
                <FiX size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">
                <p className="font-bold">This will permanently delete:</p>
                <p>• All sales records &amp; receipts</p>
                <p>• All products, categories &amp; suppliers</p>
                <p>• All debts &amp; credit agreements</p>
                <p>• All expenses, purchases &amp; worker payments</p>
                <p>• All notifications &amp; audit logs</p>
                <p className="font-bold mt-2">Your account and settings will NOT be deleted.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Type <span className="font-black text-red-600">CLEAR</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="Type CLEAR here"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearData}
                  disabled={confirmText !== 'CLEAR' || clearing}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-colors"
                >
                  {clearing ? 'Clearing...' : 'Clear All Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
