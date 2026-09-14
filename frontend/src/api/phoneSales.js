import api from './axios'

export const getPhoneSales = (params) => api.get('/phone-sales', { params })
export const getPhoneSale = (id) => api.get(`/phone-sales/${id}`)
export const createPhoneSale = (data) => api.post('/phone-sales', data)

/** Owners only — the server refuses everyone else. */
export const approvePhoneSale = (id) => api.put(`/phone-sales/${id}/approve`)
export const rejectPhoneSale = (id, reason) => api.put(`/phone-sales/${id}/reject`, { reason })
