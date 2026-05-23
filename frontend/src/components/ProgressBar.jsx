import React from 'react'

export default function ProgressBar({ current, total, showLabel = true, height = 'md', color = 'green' }) {
  const percentage = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0

  const heights = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
    xl: 'h-5',
  }

  const colors = {
    green: 'bg-green-600',
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
  }

  const bgColors = {
    green: 'bg-green-100',
    blue: 'bg-blue-100',
    red: 'bg-red-100',
    orange: 'bg-orange-100',
  }

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-600">
            {current} of {total} payments
          </span>
          <span className="text-xs font-bold text-green-800">{percentage}%</span>
        </div>
      )}
      <div className={`w-full ${bgColors[color] || bgColors.green} rounded-full overflow-hidden ${heights[height] || heights.md}`}>
        <div
          className={`${heights[height] || heights.md} ${colors[color] || colors.green} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
