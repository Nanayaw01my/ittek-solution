import api from './axios'

export const getSettings = () => api.get('/settings')
export const updateSettings = (data) => api.put('/settings', data)
export const testEmail = (data) => api.post('/settings/test-email', data)
export const getAuditLogs = (params) => api.get('/audit-logs', { params })
export const createBackup = () => api.get('/backup/create', { responseType: 'blob' })
export const restoreBackup = (formData) => api.post('/backup/restore', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getBackupHistory = () => api.get('/backup/history')
export const globalSearch = (body) => api.post('/search', body)
