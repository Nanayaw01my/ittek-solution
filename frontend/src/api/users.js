import api from './axios'

export const getUsers = (params) => api.get('/users', { params })
export const getUser = (id) => api.get(`/users/${id}`)
export const createUser = (data) => api.post('/users', data)
export const updateUser = (id, data) => api.put(`/users/${id}`, data)
export const deleteUser = (id) => api.delete(`/users/${id}`)
export const toggleUserStatus = (id) => api.put(`/users/${id}/toggle-active`)
export const resetUserPassword = (id, newPassword) => api.put(`/users/${id}/reset-password`, { new_password: newPassword })

/** A staff badge — the card they scan to sign in. */
/**
 * Give somebody a card. With `badge_code` it attaches a card that already
 * exists — scanned off one the shop printed itself; without it the server
 * mints a fresh number.
 */
export const issueBadge = (id, { pin, badge_code } = {}) =>
  api.post(`/users/${id}/badge`, { pin, badge_code })
export const revokeBadge = (id) => api.delete(`/users/${id}/badge`)
/** Whose card is this? For the checking station on the Users page. */
export const identifyBadge = (code) => api.get(`/users/badge/${encodeURIComponent(code)}`)
/** The printable cards — one person with an id, or everybody with a badge. */
export const getBadgeCards = (id) =>
  api.get('/users/badge-cards', { params: id ? { id } : undefined, responseType: 'blob' })
