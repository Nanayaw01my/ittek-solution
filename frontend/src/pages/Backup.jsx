import React, { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiDownload, FiUpload, FiDatabase, FiAlertTriangle } from 'react-icons/fi'
import { createBackup, restoreBackup, getBackupHistory } from '../api/settings'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import { formatDateTime } from '../utils/helpers'
import { saveAs } from 'file-saver'
import { format } from 'date-fns'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Backup() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const fileRef = useRef(null)

  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['backup-history'],
    queryFn: () => getBackupHistory().then(r => r.data),
  })

  const history = historyData?.history || historyData || []

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const res = await createBackup()
      const blob = new Blob([res.data], { type: 'application/json' })
      saveAs(blob, `backup-dandorsolar-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`)
      toast.success('Backup created and downloaded!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.json')) {
      toast.error('Please select a .json backup file')
      return
    }
    setSelectedFile(file)
  }

  const handleRestore = async () => {
    if (!selectedFile) return
    setRestoring(true)
    setShowConfirm(false)
    try {
      const formData = new FormData()
      formData.append('backup', selectedFile)
      await restoreBackup(formData)
      toast.success('Restore completed! Please refresh.')
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      toast.error(err.response?.data?.message || 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader title="Backup & Restore" subtitle="Protect your business data" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Backup */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <FiDatabase size={24} className="text-orange-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Create Backup</h3>
              <p className="text-sm text-gray-500">Download a full data backup</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-5 leading-relaxed">
            Creates a complete backup of all business data including products, sales, expenses, users, and settings. The backup is downloaded as a JSON file.
          </p>
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl transition-colors"
          >
            <FiDownload size={16} />
            {backingUp ? 'Creating Backup...' : 'Download Backup'}
          </button>
        </div>

        {/* Restore */}
        {isSuperAdmin ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <FiUpload size={24} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Restore Backup</h3>
                <p className="text-sm text-gray-500">Restore from backup file</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex gap-2">
              <FiAlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">
                <strong>Warning:</strong> Restoring a backup will overwrite ALL current data. This action cannot be undone. Make sure you have a current backup before proceeding.
              </p>
            </div>
            <div className="mb-4">
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
              />
              {selectedFile && (
                <p className="text-xs text-green-600 mt-2 font-medium">Selected: {selectedFile.name}</p>
              )}
            </div>
            <button
              onClick={() => selectedFile && setShowConfirm(true)}
              disabled={!selectedFile || restoring}
              className="w-full flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
            >
              <FiUpload size={16} />
              {restoring ? 'Restoring...' : 'Restore Backup'}
            </button>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center text-center">
            <FiAlertTriangle size={32} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">Only Super Admins can restore backups</p>
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Backup History</h3>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">No backup history</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.map((h, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold">{h.filename || `Backup ${i + 1}`}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(h.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{h.type || 'Manual'}</p>
                  <p className="text-xs text-green-600 font-semibold">{h.status || 'Success'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleRestore}
        title="Restore Backup"
        message={`Are you absolutely sure you want to restore from "${selectedFile?.name}"? All current data will be replaced. This cannot be undone.`}
        confirmText="Yes, Restore"
        danger
        loading={restoring}
      />
    </div>
  )
}
