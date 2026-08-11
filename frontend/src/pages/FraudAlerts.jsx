import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { FiShield, FiRefreshCw, FiCheck, FiX, FiAlertTriangle } from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import { useTranslation } from '../i18n'
import { formatCurrency } from '../utils/helpers'
import { getFraudAlerts, reviewFraudAlert, runFraudScan } from '../api/fraud'

const SEVERITY_STYLES = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
}

const TYPE_LABELS = {
  excessive_discount: 'Excessive discount',
  after_hours_sale: 'After-hours sale',
  refund_spike: 'Refund spike',
  void_spike: 'Void spike',
  high_discount_rate: 'High discount rate',
  large_cash_sale: 'Large cash sale',
  rapid_sales: 'Rapid sales',
  price_override: 'Price override',
}

function DismissModal({ alert, onClose }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')

  const mutation = useMutation({
    mutationFn: () => reviewFraudAlert(alert._id, { status: 'dismissed', note }),
    onSuccess: () => {
      toast.success('Alert dismissed')
      queryClient.invalidateQueries({ queryKey: ['fraud-alerts'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not dismiss'),
  })

  return (
    <Modal isOpen onClose={onClose} title={t('fraud.dismiss')} size="sm">
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-600">{alert.title}</p>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('fraud.dismissReason')}</label>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="e.g. Approved by manager — bulk order for a regular customer"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            The reason is stored with the alert so the decision can be reviewed later.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!note.trim() || mutation.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm"
          >
            {mutation.isPending ? '…' : t('fraud.dismiss')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function FraudAlerts() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('open')
  const [dismissing, setDismissing] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['fraud-alerts', statusFilter],
    queryFn: () => getFraudAlerts({ status: statusFilter }),
    keepPreviousData: true,
  })

  const alerts = data?.data?.data || data?.data || []
  const summary = data?.data?.summary || {}

  const reviewMutation = useMutation({
    mutationFn: (id) => reviewFraudAlert(id, { status: 'reviewed' }),
    onSuccess: () => {
      toast.success('Marked reviewed')
      queryClient.invalidateQueries({ queryKey: ['fraud-alerts'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  })

  const scanMutation = useMutation({
    mutationFn: () => runFraudScan(),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Scan complete')
      queryClient.invalidateQueries({ queryKey: ['fraud-alerts'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Scan failed'),
  })

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title={t('fraud.title')} subtitle="Unusual till activity worth a second look" icon={FiShield} />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
        These are signals, not accusations. A heavy discount or a late sale usually has an innocent explanation —
        the point is that someone senior sees it and records the decision.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">{t('fraud.open')}</p>
          <p className="text-2xl font-black text-orange-600">{summary.open ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">{t('fraud.high')} {t('fraud.severity').toLowerCase()}</p>
          <p className="text-2xl font-black text-red-600">{summary.high ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">Last 24h</p>
          <p className="text-2xl font-black text-gray-800">{summary.last_24h ?? 0}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {['open', 'reviewed', 'dismissed', 'all'].map((s) => (
          <button
            key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
              statusFilter === s ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-orange-50'
            }`}
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-60"
        >
          <FiRefreshCw size={13} className={scanMutation.isPending ? 'animate-spin' : ''} /> {t('fraud.runScan')}
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FiShield size={36} className="mx-auto mb-2" />
          <p className="text-sm">{t('fraud.noAlerts')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div key={alert._id} className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-3">
              <div className={`w-1 rounded-full flex-shrink-0 ${
                alert.severity === 'high' ? 'bg-red-500' : alert.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${SEVERITY_STYLES[alert.severity]}`}>
                    {alert.severity}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {TYPE_LABELS[alert.type] || alert.type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {alert.createdAt ? formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true }) : ''}
                  </span>
                </div>
                <p className="font-bold text-sm text-gray-800">{alert.title}</p>
                <p className="text-xs text-gray-600 mt-0.5">{alert.detail}</p>

                <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gray-500">
                  {alert.user_id?.username && <span>Staff: <b>{alert.user_id.username}</b></span>}
                  {alert.evidence?.invoice_no && <span>Invoice: <b>{alert.evidence.invoice_no}</b></span>}
                  {alert.evidence?.amount != null && <span>Amount: <b>{formatCurrency(alert.evidence.amount)}</b></span>}
                </div>

                {alert.status !== 'open' && (
                  <p className="text-[11px] text-gray-400 italic mt-2">
                    {alert.status} by {alert.reviewed_by?.username || '—'}
                    {alert.review_note ? ` — "${alert.review_note}"` : ''}
                  </p>
                )}
              </div>

              {alert.status === 'open' && (
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => reviewMutation.mutate(alert._id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-bold"
                  >
                    <FiCheck size={12} /> {t('fraud.review')}
                  </button>
                  <button
                    onClick={() => setDismissing(alert)}
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50"
                  >
                    <FiX size={12} /> {t('fraud.dismiss')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {dismissing && <DismissModal alert={dismissing} onClose={() => setDismissing(null)} />}
    </div>
  )
}
