import api from './axios'

export const createLayaway = (data) => api.post('/layaways', data)
export const getLayaways = (params) => api.get('/layaways', { params })
export const getLayaway = (id) => api.get(`/layaways/${id}`)
export const addLayawayPayment = (id, data) => api.post(`/layaways/${id}/payments`, data)
export const collectLayaway = (id) => api.post(`/layaways/${id}/collect`)
export const cancelLayaway = (id, data) => api.post(`/layaways/${id}/cancel`, data)

/** Printable agreement. Returned as a blob so it can be opened in a new tab. */
export const getLayawayAgreement = (id) =>
  api.get(`/layaways/${id}/agreement`, { responseType: 'blob' })
