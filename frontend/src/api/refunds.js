import api from './axios'

export const getRefunds = (params) => api.get('/refunds', { params })
export const lookupSaleByInvoice = (invoiceNo) => api.get(`/refunds/lookup/${invoiceNo}`)
export const createRefund = (data) => api.post('/refunds', data)
export const approveRefund = (id) => api.put(`/refunds/${id}/approve`)
export const rejectRefund = (id, reason) => api.put(`/refunds/${id}/reject`, { reason })
export const updateRefund = (id, data) => api.put(`/refunds/${id}`, data)
export const deleteRefund = (id) => api.delete(`/refunds/${id}`)
