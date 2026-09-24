import api from './axios'

export const getSettings = () => api.get('/settings')
export const updateSettings = (data) => api.put('/settings', data)
export const testEmail = (data) => api.post('/settings/test-email', data)
export const getAuditLogs = (params) => api.get('/audit-logs', { params })
/** The whole database, as a file. Long-running on a big shop, so no timeout. */
export const createBackup = () =>
  api.post('/backup/create', null, { responseType: 'blob', timeout: 0 })

/**
 * The backup file's own text, posted as JSON.
 *
 * It used to be sent as multipart/form-data, which the server never unpacked —
 * so the body arrived empty and a restore silently did nothing.
 */
export const restoreBackup = (jsonText) =>
  api.post('/backup/restore', jsonText, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 0,
    transformRequest: [(d) => d],   // already a string; do not re-encode it
  })

export const getBackupHistory = () => api.get('/backup/history')

/** What a backup would hold, so the screen can say so before you take one. */
export const getBackupSummary = () => api.get('/backup/summary')
export const globalSearch = (body) => api.post('/search', body)
