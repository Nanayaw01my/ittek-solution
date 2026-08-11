import React, { useState, useMemo } from 'react'
import { FiPlus, FiTrash2, FiCheck } from 'react-icons/fi'
import Modal from './Modal'
import { useTranslation } from '../i18n'
import { formatCurrency } from '../utils/helpers'

const METHODS = [
  { value: 'cash', labelKey: 'pos.cash' },
  { value: 'card', labelKey: 'pos.card' },
  { value: 'mobile_money', labelKey: 'pos.mobileMoney' },
]

/**
 * Settle one sale with several tenders — e.g. GHC200 cash + GHC300 MoMo.
 * Confirmation stays disabled until the splits add up to the amount due, so a
 * mismatched sale can never reach the server.
 */
export default function SplitPaymentModal({ isOpen, onClose, total, onConfirm, loading }) {
  const { t } = useTranslation()
  const [splits, setSplits] = useState([{ method: 'cash', amount: '', reference: '' }])

  const allocated = useMemo(
    () => splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0),
    [splits]
  )
  const remaining = Number((total - allocated).toFixed(2))
  const balanced = Math.abs(remaining) < 0.01
  const overpaid = remaining < -0.01

  const update = (index, field, value) => {
    setSplits((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  const addSplit = () => {
    // Pre-fill the new line with whatever is still owed — the common case.
    const rest = remaining > 0 ? remaining.toFixed(2) : ''
    setSplits((prev) => [...prev, { method: 'cash', amount: rest, reference: '' }])
  }

  const removeSplit = (index) => {
    setSplits((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const handleConfirm = () => {
    if (!balanced) return
    onConfirm(
      splits
        .filter((s) => parseFloat(s.amount) > 0)
        .map((s) => ({
          method: s.method,
          amount: parseFloat(s.amount),
          reference: s.reference?.trim() || undefined,
        }))
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('split.title')} size="md">
      <div className="p-5 space-y-4">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-baseline justify-between">
          <span className="text-sm text-orange-700">{t('common.total')}</span>
          <span className="text-3xl font-black text-orange-600">{formatCurrency(total)}</span>
        </div>

        <div className="space-y-3">
          {splits.map((split, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <select
                  value={split.method}
                  onChange={(e) => update(i, 'method', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={split.amount}
                  onChange={(e) => update(i, 'amount', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  onClick={() => removeSplit(i)}
                  disabled={splits.length === 1}
                  className="px-2 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Remove payment line"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
              {split.method !== 'cash' && (
                <input
                  type="text"
                  value={split.reference}
                  onChange={(e) => update(i, 'reference', e.target.value)}
                  placeholder={t('split.reference')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addSplit}
          className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-xl text-sm font-semibold hover:border-orange-400 hover:text-orange-600 transition-colors"
        >
          <FiPlus size={15} /> {t('split.addMethod')}
        </button>

        <div
          className={`rounded-xl p-3 text-sm font-bold flex items-center justify-between ${
            balanced
              ? 'bg-green-50 text-green-700 border border-green-200'
              : overpaid
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}
        >
          <span>
            {balanced ? t('split.balanced') : overpaid ? t('split.overpaid') : t('split.remaining')}
          </span>
          <span>{balanced ? <FiCheck size={18} /> : formatCurrency(Math.abs(remaining))}</span>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!balanced || loading}
            title={!balanced ? t('split.mustMatch') : undefined}
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors"
          >
            {loading ? '…' : t('common.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
