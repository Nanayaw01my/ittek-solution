import api from './axios'

export const getDispatches = (params) => api.get('/dispatches', { params })
export const getDispatch = (id) => api.get(`/dispatches/${id}`)
export const createDispatch = (data) => api.post('/dispatches', data)
export const returnDispatchItems = (id, data) => api.put(`/dispatches/${id}/return`, data)
export const closeDispatch = (id) => api.put(`/dispatches/${id}/close`)
export const deleteDispatch = (id) => api.delete(`/dispatches/${id}`)

/** The sheet the agent carries out. Blob, so it can be opened in a new tab. */
export const getDispatchSheet = (id) =>
  api.get(`/dispatches/${id}/sheet`, { responseType: 'blob' })
