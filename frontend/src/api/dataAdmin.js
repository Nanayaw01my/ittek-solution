import api from './axios'

export const getDeletableTypes = () => api.get('/data-admin/types')
export const getDeletableRecords = (type, params) => api.get(`/data-admin/${type}`, { params })
export const deleteRecords = (type, ids) => api.post(`/data-admin/${type}/delete`, { ids })
