import api from './axios'

export const getQuotations = (params) => api.get('/quotations', { params })
export const getQuotation = (id) => api.get(`/quotations/${id}`)
export const createQuotation = (data) => api.post('/quotations', data)
export const updateQuotation = (id, data) => api.put(`/quotations/${id}`, data)
/** The customer said yes: writes the sale and moves the stock. */
export const acceptQuotation = (id, data) => api.post(`/quotations/${id}/accept`, data)
export const deleteQuotation = (id) => api.delete(`/quotations/${id}`)
