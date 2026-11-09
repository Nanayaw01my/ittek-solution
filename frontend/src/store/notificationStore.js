import { create } from 'zustand'

/**
 * What the bell in the header is counting.
 *
 * Two things were wrong here, and between them they made every message
 * an owner sent look as though it had vanished.
 *
 * The server calls the flag `is_read`; this file read `read`, which no
 * notification carries, so the count was the total number of rows and
 * marking one read never lowered it. And rows are keyed by `_id`, not
 * `id`, so marking one read or deleting it matched nothing in the list.
 *
 * Both are handled by the two helpers below rather than by trusting
 * either spelling, because notifications arrive from the API with
 * `is_read` and from addNotification() — a local, optimistic insert —
 * with `read`.
 */
const unread = (n) => !(n?.is_read ?? n?.read)
const sameRow = (n, id) => String(n?._id ?? n?.id) === String(id)

const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications) => {
    const list = Array.isArray(notifications) ? notifications : []
    set({ notifications: list, unreadCount: list.filter(unread).length })
  },

  /**
   * The count on its own, from GET /notifications/unread-count.
   *
   * The header polls this on every screen. Before, the count was only
   * ever set by the notifications page itself, so the badge appeared
   * only once you were already looking at the list — which is the one
   * place you no longer need telling.
   */
  setUnreadCount: (count) => set({ unreadCount: Number(count) || 0 }),

  addNotification: (notification) => {
    set((state) => ({
      notifications: [
        { ...notification, id: notification.id || Date.now(), is_read: false, createdAt: new Date().toISOString() },
        ...state.notifications,
      ],
      unreadCount: state.unreadCount + 1,
    }))
  },

  markRead: (id) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        sameRow(n, id) ? { ...n, is_read: true, read: true } : n)
      return { notifications, unreadCount: notifications.filter(unread).length }
    })
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true, read: true })),
      unreadCount: 0,
    }))
  },

  removeNotification: (id) => {
    set((state) => {
      const notifications = state.notifications.filter((n) => !sameRow(n, id))
      return { notifications, unreadCount: notifications.filter(unread).length }
    })
  },
}))

export default useNotificationStore
