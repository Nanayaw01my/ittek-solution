import api from './axios'

export const getComplaints = (params) => api.get('/complaints', { params })
export const raiseComplaint = (data) => api.post('/complaints', data)
export const resolveComplaint = (id, data) => api.put(`/complaints/${id}/resolve`, data)
