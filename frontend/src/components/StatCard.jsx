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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div className="w-11 h-11 rounded-xl bg-gray-200" />
          <div className="w-16 h-5 bg-gray-200 rounded" />
        </div>
        <div className="w-24 h-7 bg-gray-200 rounded mb-1" />
        <div className="w-20 h-4 bg-gray-100 rounded" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center`}>
          {Icon && <Icon size={22} className={c.icon} />}
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 px-2 py-1 rounded-full
            ${trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {trendUp ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-black text-gray-900 leading-tight">
        {prefix}{typeof value === 'number' ? value.toLocaleString('en-GH') : value}{suffix}
      </p>
      <p className="text-sm text-gray-500 mt-1 font-medium">{label}</p>
      {/* Context under a figure that would otherwise be read wrongly — most
          usefully, how many records a total was made from, so a zero can be
          told apart from a total that failed to arrive. */}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}
