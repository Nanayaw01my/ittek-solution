import api from './axios'

/** The job book: who is fitting what, where, and when. */
export const getInstallations = (params) => api.get('/installations', { params })
export const createInstallation = (data) => api.post('/installations', data)
/** Starting and finishing is the fitter's; everything else is the office's. */
export const updateInstallation = (id, data) => api.put(`/installations/${id}`, data)
export const deleteInstallation = (id) => api.delete(`/installations/${id}`)
