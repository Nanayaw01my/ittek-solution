import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiBell, FiAlertTriangle, FiDollarSign, FiPackage, FiUser, FiCheck, FiTrash2, FiInfo } from 'react-icons/fi'
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../api/notifications'
import useNotificationStore from '../store/notificationStore'
import { formatDateTime } from '../utils/helpers'
import PageHeader from '../components/PageHeader'

const NOTIF_ICONS = {
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
    if (data?.notifications) {
      setNotifications(data.notifications)
    }
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

  const notifications = data?.notifications || []

  const filtered = notifications.filter(n => {
    if (activeTab === 'unread') return !n.read
    if (activeTab === 'critical') return n.type === 'overdue_debt' || n.type === 'low_stock'
    return true
  })

  const handleClick = (notif) => {
    if (!notif.read) {
      markReadMutation.mutate(notif._id || notif.id)
    }
    const route = ROUTE_MAP[notif.type]
    if (route) navigate(route)
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Notifications"
        action={
          notifications.some(n => !n.read) && (
            <button
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-50 transition-colors"
            >
              <FiCheck size={14} /> Mark All Read
            </button>
          )
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
            {tab === 'unread' && notifications.filter(n => !n.read).length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {notifications.filter(n => !n.read).length}
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
            const typeConfig = NOTIF_ICONS[notif.type] || NOTIF_ICONS.default
            const Icon = typeConfig.icon
            return (
              <div
                key={notif._id || notif.id}
                onClick={() => handleClick(notif)}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md
                  ${!notif.read
                    ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl ${typeConfig.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={typeConfig.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${!notif.read ? 'text-gray-900' : 'text-gray-700'}`}>
                    {notif.title}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(notif.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!notif.read && (
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
