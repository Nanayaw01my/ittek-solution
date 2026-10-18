import api from './axios'

export const getSettings = () => api.get('/settings')
export const updateSettings = (data) => api.put('/settings', data)
/** The mail account. The password is write-only — it never comes back. */
export const updateEmailConfig = (data) => api.put('/settings/email', data)
export const testEmail = (data) => api.post('/settings/test-email', data)

/** Arkesel: the key, the sender ID, and the switch. The key never comes back. */
export const updateSmsConfig = (data) => api.put('/settings/sms', data)
export const testSms = (to) => api.post('/settings/sms/test', { to })
export const getSmsBalance = () => api.get('/settings/sms/balance')
export const getAuditLogs = (params) => api.get('/audit-logs', { params })
/**
 * The whole database, as a file. Long-running on a big shop, so no timeout.
 *
 * Asked for with GET, carrying nothing. It used to POST a body of `null`,
 * which axios faithfully sent as the four characters "null" under a JSON
 * content type — and Express refuses that outright, because a bare value is
 * not an object. So every single press of Download Backup was answered 400
 * before it reached the backup code at all, on every device, and the screen
 * had no way to say so. Nothing is being sent here, so there is nothing to
 * refuse.
 */
export const createBackup = () =>
  api.get('/backup/create', { responseType: 'blob', timeout: 0 })

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

/**
 * The copies that are off this server.
 *
 * The history list is kept on the container's disk, which the host wipes on
 * every deploy — so it can say "no backup history" while months of backups
 * sit safely off-site. This reads the files themselves.
 */
export const getCloudBackups = () => api.get('/backup/cloud')
export const globalSearch = (body) => api.post('/search', body)
