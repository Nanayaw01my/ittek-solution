import api from './axios'

export const getReceiptApprovals = (params) => api.get('/receipt-approvals', { params })
/** Sends the sheet up. Nothing prints and no money moves until it comes back. */
export const requestReceiptApproval = (payload) => api.post('/receipt-approvals', { payload })
export const approveReceipt = (id) => api.put(`/receipt-approvals/${id}/approve`)
export const rejectReceipt = (id, reason) => api.put(`/receipt-approvals/${id}/reject`, { reason })
export const deleteReceiptApproval = (id) => api.delete(`/receipt-approvals/${id}`)
