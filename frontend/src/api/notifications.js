import api from './axios'

export const getNotifications = (params) => api.get('/notifications', { params })
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`)
// The route is PUT /notifications/read-all. This asked for
// /notifications/mark-all-read, which matched nothing and 404'd, so
// "Mark All Read" had never once worked.
export const markAllNotificationsRead = () => api.put('/notifications/read-all')
export const deleteNotification = (id) => api.delete(`/notifications/${id}`)
export const getUnreadCount = () => api.get('/notifications/unread-count')

/** Who a message can be addressed to: names and roles, nothing more. */
export const getRecipients = () => api.get('/notifications/recipients')

/**
 * An owner writing to the staff. `audience` is 'everyone', 'roles' or
 * 'people'; the last two carry `roles` or `user_ids`.
 */
export const sendStaffMessage = (data) => api.post('/notifications/message', data)
