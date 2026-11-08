import api from './axios'

export const getNotifications = (params) => api.get('/notifications', { params })
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.put('/notifications/mark-all-read')
export const deleteNotification = (id) => api.delete(`/notifications/${id}`)
export const getUnreadCount = () => api.get('/notifications/unread-count')

/** Who a message can be addressed to: names and roles, nothing more. */
export const getRecipients = () => api.get('/notifications/recipients')

/**
 * An owner writing to the staff. `audience` is 'everyone', 'roles' or
 * 'people'; the last two carry `roles` or `user_ids`.
 */
export const sendStaffMessage = (data) => api.post('/notifications/message', data)
