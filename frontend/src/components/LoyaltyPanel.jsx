import React, { useEffect, useState } from 'react'
import { FiAward, FiX } from 'react-icons/fi'
import { useTranslation } from '../i18n'
import { formatCurrency } from '../utils/helpers'
import { lookupLoyalty } from '../api/loyalty'
import { isValidGhanaPhone } from '../utils/phone'

/**
 * Loyalty strip in the POS sidebar.
 *
 * Looks the customer up by phone as it is typed, shows their balance, and lets
 * the cashier apply points to the current cart. Redemption is capped
 * server-side too — this only makes the cap visible.
 */
export default function LoyaltyPanel({ phone, cartTotal, redeemPoints, onRedeemChange }) {
  const { t } = useTranslation()
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isValidGhanaPhone(phone)) {
      setAccount(null)
      onRedeemChange(0)
      return
    }

    let cancelled = false
    setLoading(true)

    // Debounced so we aren't querying on every keystroke.
    const timer = setTimeout(() => {
      lookupLoyalty(phone, cartTotal)
        .then((res) => { if (!cancelled) setAccount(res.data) })
        .catch(() => { if (!cancelled) setAccount(null) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 400)

    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, cartTotal])

  if (!isValidGhanaPhone(phone)) return null

  if (loading && !account) {
    return <div className="text-xs text-gray-400 px-1 py-2">{t('common.loading')}</div>
  }

  if (!account) return null

  if (!account.exists) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
        <FiAward size={14} className="text-gray-400 flex-shrink-0" />
        <p className="text-xs text-gray-500">{t('loyalty.notMember')}</p>
      </div>
    )
  }

  const redeemable = account.redeemable || { points: 0, amount: 0 }
  const canRedeem = redeemable.points > 0
  const applied = redeemPoints > 0

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FiAward size={14} className="text-amber-600" />
          <span className="text-xs font-bold text-amber-800">{account.name || t('loyalty.member')}</span>
        </div>
        <span className="text-xs font-black text-amber-700">
          {account.points_balance} {t('loyalty.points')}
        </span>
      </div>

      <p className="text-[11px] text-amber-700">
        {t('loyalty.value')}: {formatCurrency(account.points_value || 0)} · {t('loyalty.visits')}: {account.visits}
      </p>

      {applied ? (
        <div className="flex items-center justify-between bg-white border border-amber-300 rounded-lg px-2 py-1.5">
          <span className="text-xs font-bold text-amber-800">
            −{formatCurrency(redeemable.amount)} ({redeemPoints} pts)
          </span>
          <button
            onClick={() => onRedeemChange(0)}
            className="text-amber-600 hover:text-amber-800"
            aria-label="Remove points discount"
          >
            <FiX size={14} />
          </button>
        </div>
      ) : canRedeem ? (
        <button
          onClick={() => onRedeemChange(redeemable.points)}
          className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors"
        >
          {t('loyalty.redeem')} — {formatCurrency(redeemable.amount)}
        </button>
      ) : (
        <p className="text-[11px] text-amber-600">
          {t('loyalty.minRequired', { min: account.settings?.min_points_to_redeem ?? 100 })}
        </p>
      )}
    </div>
  )
}
