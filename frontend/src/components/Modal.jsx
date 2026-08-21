import React, { useEffect } from 'react'
import { FiX } from 'react-icons/fi'

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  full: 'max-w-full mx-4',
}

export default function Modal({ isOpen, onClose, title, children, size = 'md', hideClose = false }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape' && onClose) onClose() }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="print-container fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="no-print absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className={`print-container relative bg-white rounded-2xl shadow-2xl w-full ${sizeMap[size] || sizeMap.md} animate-fadeIn max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-orange-500 rounded-t-2xl flex-shrink-0">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          {!hideClose && (
            <button
              onClick={onClose}
              className="text-white hover:text-orange-200 p-1 rounded-lg transition-colors"
            >
              <FiX size={20} />
            </button>
          )}
        </div>
        {/* Body */}
        <div className="print-container overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
