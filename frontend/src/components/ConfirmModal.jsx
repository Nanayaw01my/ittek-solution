import React from 'react'
import LoadingSpinner from './LoadingSpinner'

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  loading = false,
}) {
  if (!isOpen) return null

  const confirmClasses = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    primary: 'bg-green-800 hover:bg-green-900 text-white',
    warning: 'bg-orange-500 hover:bg-orange-600 text-white',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={!loading ? onClose : undefined}
      />
      <div className="relative bg-white rounded-3xl shadow-xl p-6 w-full max-w-sm">
        <div className="text-center">
          {confirmVariant === 'danger' && (
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
          )}
          {confirmVariant === 'primary' && (
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
          <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600 mb-6">{message}</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-sm
                       hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3 px-4 rounded-2xl font-semibold text-sm
                       transition-colors disabled:opacity-50 flex items-center justify-center gap-2
                       ${confirmClasses[confirmVariant] || confirmClasses.primary}`}
          >
            {loading && <LoadingSpinner size="sm" color="white" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
