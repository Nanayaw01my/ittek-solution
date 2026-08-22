import api from './axios'

export const login = (credentials, config) => api.post('/auth/login', credentials, config)
export const logout = () => api.post('/auth/logout')
export const getMe = () => api.get('/auth/me')
export const changePassword = (data) => api.put('/auth/change-password', data)
export const resetPassword = (userId, data) => api.put(`/auth/reset-password/${userId}`, data)
