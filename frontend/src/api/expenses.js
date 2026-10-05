import api from './axios'

export const getExpenses = (params) => api.get('/expenses', { params })
export const getExpense = (id) => api.get(`/expenses/${id}`)
export const createExpense = (data) => api.post('/expenses', data)
export const updateExpense = (id, data) => api.put(`/expenses/${id}`, data)
export const deleteExpense = (id) => api.delete(`/expenses/${id}`)
export const getExpenseSummary = (params) => api.get('/expenses/summary', { params })
export const getExpenseCategories = () => api.get('/expenses/categories')

/** An owner lets the money count. Until then it is only a request. */
export const approveExpense = (id) => api.put(`/expenses/${id}/approve`)
export const rejectExpense = (id, reason) => api.put(`/expenses/${id}/reject`, { reason })
