import api from './axios'

export const getPackagePlans = (params) => api.get('/package-plans', { params })
export const createPackagePlan = (data) => api.post('/package-plans', data)
export const getPackagePlan = (id) => api.get(`/package-plans/${id}`)

/**
 * `portion` is 'full', 'half' or 'part'. Only 'part' carries an amount —
 * what a full or a half comes to is worked out on the server from the plan,
 * so the two buttons mean the same thing on every till.
 */
export const recordPackagePayment = (id, data) => api.post(`/package-plans/${id}/payments`, data)
export const cancelPackagePlan = (id, data) => api.delete(`/package-plans/${id}`, { data })
