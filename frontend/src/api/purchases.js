import api from './axios'

export const getPurchases = (params) => api.get('/purchases', { params })
export const getPurchase = (id) => api.get(`/purchases/${id}`)
export const createPurchase = (data) => api.post('/purchases', data)
export const updatePurchase = (id, data) => api.put(`/purchases/${id}`, data)
export const deletePurchase = (id) => api.delete(`/purchases/${id}`)

