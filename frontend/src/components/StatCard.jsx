import React from 'react'

export default function StatCard({ icon: Icon, value, label, trend, trendUp, color = 'orange', prefix = '', suffix = '', loading = false, hint = null }) {
  const colorMap = {
    orange: { bg: 'bg-orange-100', icon: 'text-orange-500', border: 'border-orange-200' },
    green: { bg: 'bg-green-100', icon: 'text-green-500', border: 'border-green-200' },
    blue: { bg: 'bg-blue-100', icon: 'text-blue-500', border: 'border-blue-200' },
    red: { bg: 'bg-red-100', icon: 'text-red-500', border: 'border-red-200' },
    purple: { bg: 'bg-purple-100', icon: 'text-purple-500', border: 'border-purple-200' },
    yellow: { bg: 'bg-yellow-100', icon: 'text-yellow-600', border: 'border-yellow-200' },
  }
  const c = colorMap[color] || colorMap.orange

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3.5 sm:p-5 animate-pulse">
        <div className="flex items-start justify-between mb-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gray-200" />
          <div className="w-12 h-5 bg-gray-200 rounded" />
        </div>
        <div className="w-20 h-6 bg-gray-200 rounded mb-1" />
        <div className="w-16 h-4 bg-gray-100 rounded" />
      </div>
    )
  }

  /**
   * Sized so a phone shows the business, not two tiles of it.
   *
   * At the old size one tile stood 175px tall, so a 390px screen held two
   * rows and the rest of the day's figures were below the fold — on the one
   * screen whose entire job is to be taken in at a glance. Everything here
   * is smaller on a phone and unchanged on a desktop: the padding, the icon,
   * and the figure itself.
   *
   * The figure is tabular-nums so a column of amounts lines up on the
   * decimal point instead of wandering, and it is allowed to shrink rather
   * than wrap — "GH₵ 12,480.00" breaking across two lines reads as two
   * numbers.
   */
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3.5 sm:p-5
                    hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2.5 sm:mb-3">
        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
          {Icon && <Icon className={`${c.icon} w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]`} />}
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`text-[11px] font-semibold flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full
            ${trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {trendUp ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-lg sm:text-2xl font-black text-gray-900 leading-tight tabular-nums truncate">
        {prefix}{typeof value === 'number' ? value.toLocaleString('en-GH') : value}{suffix}
      </p>
      <p className="text-[13px] sm:text-sm text-gray-500 mt-0.5 sm:mt-1 font-medium leading-snug">{label}</p>
      {/* Context under a figure that would otherwise be read wrongly — most
          usefully, how many records a total was made from, so a zero can be
          told apart from a total that failed to arrive. */}
      {hint && <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}
