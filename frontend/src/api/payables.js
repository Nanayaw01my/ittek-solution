import api from './axios'

/**
 * What the shop owes, written down by the owner.
 * Nothing derives these — they are entered by hand and settled by hand.
 */
export const getPayables = (params) => api.get('/payables', { params })
export const createPayable = (data) => api.post('/payables', data)
/** Hand money over. Writes no expense — the goods already cost what they cost. */
export const payPayable = (id, data) => api.post(`/payables/${id}/pay`, data)
export const updatePayable = (id, data) => api.put(`/payables/${id}`, data)
export const deletePayable = (id) => api.delete(`/payables/${id}`)
