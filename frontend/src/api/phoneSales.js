import api from './axios'

export const getPhoneSales = (params) => api.get('/phone-sales', { params })
export const getPhoneSale = (id) => api.get(`/phone-sales/${id}`)
export const createPhoneSale = (data) => api.post('/phone-sales', data)

/** Owners only — the server refuses everyone else. */
export const approvePhoneSale = (id, payment_method = 'cash') =>
  api.put(`/phone-sales/${id}/approve`, { payment_method })
/** An instalment coming in. Open to whoever can see the application. */
export const payPhoneSale = (id, payload) => api.post(`/phone-sales/${id}/pay`, payload)

export const rejectPhoneSale = (id, reason) => api.put(`/phone-sales/${id}/reject`, { reason })
export const deletePhoneSale = (id) => api.delete(`/phone-sales/${id}`)
