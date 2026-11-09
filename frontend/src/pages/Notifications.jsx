import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiBell, FiAlertTriangle, FiDollarSign, FiPackage, FiUser, FiCheck, FiTrash2, FiInfo, FiSend } from 'react-icons/fi'
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../api/notifications'
import useNotificationStore from '../store/notificationStore'
import { formatDateTime } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import StaffMessageModal from '../components/StaffMessageModal'
import useAuthStore from '../store/authStore'
import { isOwner } from '../config/pageAccess'

/**
 * Read or unread, whatever shape the row arrives in.
 *
 * The server stores `is_read`. This screen was written against `read`,
 * which no notification has ever carried, so every message rendered as
 * unread for ever: the orange dot never went out, the unread tab counted
 * everything, and marking one read changed nothing on screen.
 */
const isUnread = (n) => !(n?.is_read ?? n?.read)

const NOTIF_ICONS = {
  // What the staff messages and the system's own alerts actually arrive
  // as. Without these three every notification fell through to the grey
  // default bell, so a message from the CEO looked identical to a
  // low-stock warning.
  critical: { icon: FiAlertTriangle, bg: 'bg-red-100', color: 'text-red-600' },
  important: { icon: FiAlertTriangle, bg: 'bg-amber-100', color: 'text-amber-600' },
  info: { icon: FiInfo, bg: 'bg-blue-100', color: 'text-blue-600' },
  low_stock: { icon: FiPackage, bg: 'bg-orange-100', color: 'text-orange-600' },
  large_sale: { icon: FiDollarSign, bg: 'bg-green-100', color: 'text-green-600' },
  overdue_debt: { icon: FiAlertTriangle, bg: 'bg-red-100', color: 'text-red-600' },
  new_user: { icon: FiUser, bg: 'bg-blue-100', color: 'text-blue-600' },
  system: { icon: FiInfo, bg: 'bg-gray-100', color: 'text-gray-600' },
  expense: { icon: FiDollarSign, bg: 'bg-yellow-100', color: 'text-yellow-600' },
  default: { icon: FiBell, bg: 'bg-gray-100', color: 'text-gray-600' },
}

const ROUTE_MAP = {
  low_stock: '/products',
  large_sale: '/pos',
  overdue_debt: '/debts',
  expense: '/expenses',
  new_user: '/users',
}

export default function Notifications() {
  const { user } = useAuthStore()
  // Writing to the staff is an owner's to do; everyone else only reads.
  const canMessage = isOwner(user?.role)
  const [composing, setComposing] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setNotifications, markRead, markAllRead, removeNotification } = useNotificationStore()
  const [activeTab, setActiveTab] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications().then(r => r.data),
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (Array.isArray(data)) setNotifications(data)
  }, [data])

  const markReadMutation = useMutation({
    mutationFn: (id) => markNotificationRead(id),
    onSuccess: (_, id) => {
      markRead(id)
      queryClient.invalidateQueries(['notifications'])
    },
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      markAllRead()
      queryClient.invalidateQueries(['notifications'])
      toast.success('All notifications marked as read')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteNotification(id),
    onSuccess: (_, id) => {
      removeNotification(id)
      queryClient.invalidateQueries(['notifications'])
    },
  })

  /**
   * The whole screen was empty, for everybody.
   *
   * The axios layer unwraps { success, data, … } and hands back only
   * `data`, which for this endpoint is the array of notifications
   * itself. This read `data.notifications` — a field that does not
   * exist on an array — so the list was always empty and every message
   * an owner sent looked as though it had never arrived. It had: the
   * rows were in the database the whole time.
   */
  const notifications = Array.isArray(data) ? data : (data?.notifications || [])

  const filtered = notifications.filter(n => {
    if (activeTab === 'unread') return isUnread(n)
    // 'critical' now means what the server calls critical, plus the
    // system's own two urgent kinds.
    if (activeTab === 'critical') {
      return ['critical', 'overdue_debt', 'low_stock'].includes(n.type)
    }
    return true
  })

  const handleClick = (notif) => {
    if (isUnread(notif)) {
      markReadMutation.mutate(notif._id || notif.id)
    }
    const route = ROUTE_MAP[notif.type]
    if (route) navigate(route)
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {composing && <StaffMessageModal onClose={() => setComposing(false)} />}
      <PageHeader
        title="Notifications"
        action={
          <div className="flex items-center gap-2">
            {canMessage && (
              <button
                onClick={() => setComposing(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-colors"
              >
                <FiSend size={14} /> Message the staff
              </button>
            )}
            {notifications.some(isUnread) && (
              <button
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-50 transition-colors"
              >
                <FiCheck size={14} /> Mark All Read
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {['all', 'unread', 'critical'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors
              ${activeTab === tab ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            {tab}
            {tab === 'unread' && notifications.filter(isUnread).length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {notifications.filter(isUnread).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FiBell size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          filtered.map(notif => {
            // A person writing to you outranks what kind of alert it is.
            const typeConfig = notif.is_message
              ? { icon: FiSend, bg: 'bg-blue-100', color: 'text-blue-700' }
              : (NOTIF_ICONS[notif.type] || NOTIF_ICONS.default)
            const Icon = typeConfig.icon
            return (
              <div
                key={notif._id || notif.id}
                onClick={() => handleClick(notif)}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md
                  ${isUnread(notif)
                    ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl ${typeConfig.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={typeConfig.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isUnread(notif) ? 'text-gray-900' : 'text-gray-700'}`}>
                    {notif.title}
                  </p>
                  {/* A person speaking reads differently from the system
                      reporting, so it says which this is. On its own line:
                      inline, it broke the heading in half on a phone. */}
                  {notif.is_message && (
                    <p className="mt-1">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">
                        FROM {String(notif.from_name || 'THE OFFICE').toUpperCase()}
                      </span>
                    </p>
                  )}
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDateTime(notif.createdAt || notif.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isUnread(notif) && (
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); deleteMutation.mutate(notif._id || notif.id) }}
                    className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
