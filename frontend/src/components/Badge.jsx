import React from 'react'

const BADGE_STYLES = {
  paid: 'bg-green-100 text-green-700 border-green-200',
  full: 'bg-green-100 text-green-700 border-green-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  active: 'bg-blue-100 text-blue-700 border-blue-200',
  partial: 'bg-orange-100 text-orange-700 border-orange-200',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  inactive: 'bg-gray-100 text-gray-500 border-gray-200',
  disabled: 'bg-gray-100 text-gray-500 border-gray-200',
  void: 'bg-red-100 text-red-700 border-red-200',
  super_admin: 'bg-purple-100 text-purple-700 border-purple-200',
  ceo: 'bg-blue-100 text-blue-700 border-blue-200',
  manager: 'bg-green-100 text-green-700 border-green-200',
  sales: 'bg-orange-100 text-orange-700 border-orange-200',
}

const BADGE_LABELS = {
  super_admin: 'Super Admin',
  paid: 'Paid',
  full: 'Paid',
  completed: 'Completed',
  approved: 'Approved',
  active: 'Active',
  partial: 'Partial',
  pending: 'Pending',
  overdue: 'Overdue',
  rejected: 'Rejected',
  inactive: 'Inactive',
  disabled: 'Disabled',
  void: 'Void',
  ceo: 'CEO',
  manager: 'Manager',
  sales: 'Sales',
  engineer: 'Engineer',
}

export default function Badge({ status, label, size = 'sm' }) {
  const key = (status || '').toLowerCase()
  const style = BADGE_STYLES[key] || 'bg-gray-100 text-gray-600 border-gray-200'
  const displayLabel = label || BADGE_LABELS[key] || status

  const sizeClass = size === 'xs'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-xs px-2.5 py-1'

  return (
    <span className={`inline-flex items-center font-semibold rounded-full border ${style} ${sizeClass} whitespace-nowrap`}>
      {displayLabel}
    </span>
  )
}
