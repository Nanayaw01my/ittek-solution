import api from './axios'

export const getCreditAgreements = (params) => api.get('/credit-agreements', { params })
export const getCreditAgreement = (id) => api.get(`/credit-agreements/${id}`)
export const createCreditAgreement = (data) => api.post('/credit-agreements', data)
export const updateCreditAgreement = (id, data) => api.put(`/credit-agreements/${id}`, data)
export const deleteCreditAgreement = (id) => api.delete(`/credit-agreements/${id}`)
export const recordCreditPayment = (id, data) => api.post(`/credit-agreements/${id}/payment`, data)
export const getCreditPayments = (id) => api.get(`/credit-agreements/${id}/payments`)
export const generateCreditPDF = (id) => api.get(`/credit-agreements/${id}/pdf`, { responseType: 'blob' })

/** Swap the goods on a signed agreement, and the paper that goes with it. */
export const exchangeCreditProduct = (id, data) => api.post(`/credit-agreements/${id}/exchange`, data)
export const getExchangeNote = (id, exchangeId) =>
  api.get(`/credit-agreements/${id}/exchange/${exchangeId}/pdf`, { responseType: 'blob' })
