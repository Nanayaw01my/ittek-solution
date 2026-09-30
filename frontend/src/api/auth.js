import api from './axios'

export const login = (credentials, config) => api.post('/auth/login', credentials, config)
export const logout = () => api.post('/auth/logout')
export const getMe = () => api.get('/auth/me')
export const changePassword = (data) => api.put('/auth/change-password', data)
export const resetPassword = (userId, data) => api.put(`/auth/reset-password/${userId}`, data)

/**
 * Signing in by scanning a staff card. A badge whose role needs a code comes
 * back with pin_required and no token, and the screen then asks for it.
 */
export const badgeLogin = (code, pin) =>
  api.post('/auth/badge-login', { code, pin })
