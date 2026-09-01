import api from './axios'

export const getDebts = (params) => api.get('/debts', { params })
export const getDebt = (id) => api.get(`/debts/${id}`)
export const recordDebtPayment = (id, data) => api.post(`/debts/${id}/payment`, data)
export const getDebtSummary = () => api.get('/debts/summary')
export const deleteDebt = (id) => api.delete(`/debts/${id}`)
export const getDebtPayments = (id) => api.get(`/debts/${id}/payments`)
