import api from './axios'

export const getRefunds = (params) => api.get('/refunds', { params })
export const lookupSaleByInvoice = (invoiceNo) => api.get(`/refunds/lookup/${invoiceNo}`)
// Recent sales to pick from, so a refund does not depend on the customer
// still having the printed invoice code.
export const searchSales = (q) => api.get('/refunds/sale-search', { params: { q } })
export const createRefund = (data) => api.post('/refunds', data)
export const approveRefund = (id) => api.put(`/refunds/${id}/approve`)
export const rejectRefund = (id, reason) => api.put(`/refunds/${id}/reject`, { reason })
export const updateRefund = (id, data) => api.put(`/refunds/${id}`, data)
export const deleteRefund = (id) => api.delete(`/refunds/${id}`)
