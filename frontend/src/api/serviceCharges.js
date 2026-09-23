import api from './axios'

export const getServiceCharges = (params) => api.get('/service-charges', { params })
export const createServiceCharge = (data) => api.post('/service-charges', data)

/** Removes the sale behind it too, so it stays with CEO and above. */
export const deleteServiceCharge = (id) => api.delete(`/service-charges/${id}`)
