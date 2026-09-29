import api from './axios'

/** Everyone worth chasing — worked out from what is owed, plus hand-written ones. */
export const getReminders = (params) => api.get('/reminders', { params })
export const createReminder = (data) => api.post('/reminders', data)
/** Writes down that somebody actually reached out, and how. */
export const logReminderSent = (data) => api.post('/reminders/sent', data)
export const updateReminder = (id, data) => api.put(`/reminders/${id}`, data)
export const deleteReminder = (id) => api.delete(`/reminders/${id}`)
