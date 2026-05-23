import React from 'react'

const STATUS_CONFIG = {
  active: { label: 'Active', classes: 'bg-green-100 text-green-800' },
  overdue: { label: 'Overdue', classes: 'bg-red-100 text-red-800' },
  locked: { label: 'Locked', classes: 'bg-red-100 text-red-800' },
  completed: { label: 'Completed', classes: 'bg-blue-100 text-blue-800' },
  available: { label: 'Available', classes: 'bg-green-100 text-green-800' },
  sold: { label: 'Sold', classes: 'bg-gray-100 text-gray-700' },
  pending: { label: 'Pending', classes: 'bg-yellow-100 text-yellow-800' },
  suspended: { label: 'Suspended', classes: 'bg-orange-100 text-orange-800' },
  paid: { label: 'Paid', classes: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', classes: 'bg-red-100 text-red-800' },
  unlocked: { label: 'Unlocked', classes: 'bg-green-100 text-green-800' },
}

export default function StatusBadge({ status, customLabel, size = 'sm' }) {
  const config = STATUS_CONFIG[status?.toLowerCase()] || {
    label: status || 'Unknown',
    classes: 'bg-gray-100 text-gray-700',
  }

  const sizeClasses = size === 'sm'
    ? 'px-2.5 py-0.5 text-xs'
    : 'px-3 py-1 text-sm'

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${sizeClasses} ${config.classes}`}>
      {customLabel || config.label}
    </span>
  )
}
