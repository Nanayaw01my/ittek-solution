import api from './axios'

export const getPurchases = (params) => api.get('/purchases', { params })
export const getPurchase = (id) => api.get(`/purchases/${id}`)
export const createPurchase = (data) => api.post('/purchases', data)
export const updatePurchase = (id, data) => api.put(`/purchases/${id}`, data)
export const deletePurchase = (id) => api.delete(`/purchases/${id}`)

/** What the shop owes, grouped by the supplier who gets paid. */
export const getPayables = () => api.get('/purchases/payables')
/** Hand money to a supplier. Writes no expense — the goods already cost what they cost. */
export const payPurchase = (id, data) => api.post(`/purchases/${id}/pay`, data)
/** When the supplier expects to be paid. */
export const setPurchaseTerms = (id, data) => api.put(`/purchases/${id}/terms`, data)
