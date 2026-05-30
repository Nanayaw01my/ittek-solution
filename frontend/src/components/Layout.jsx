import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useNotificationStore from '../store/notificationStore'
import { getRoleLabel, getRoleLevel } from '../utils/helpers'
import {
  FiHome, FiShoppingCart, FiPackage, FiTag, FiTruck, FiDollarSign,
  FiAlertCircle, FiUsers, FiShoppingBag, FiInbox, FiFileText,
  FiBarChart2, FiSettings, FiDatabase, FiBell, FiSearch, FiLogOut,
  FiMenu, FiX, FiCreditCard, FiUser, FiTrendingUp, FiRotateCcw, FiList
} from 'react-icons/fi'
import { logout as apiLogout } from '../api/auth'
import toast from 'react-hot-toast'
import OfflineBanner from './OfflineBanner'

const NAV_ITEMS = [
  // All logged-in users
  { to: '/dashboard', label: 'Dashboard', icon: FiHome, minLevel: 1 },
  { to: '/expenses', label: 'Expenses', icon: FiDollarSign, minLevel: 1 },
  { to: '/notifications', label: 'Notifications', icon: FiBell, minLevel: 1 },
  // Sales+ (all logged-in users)
  { to: '/pos', label: 'Point of Sale', icon: FiShoppingCart, minLevel: 1 },
  { to: '/refunds', label: 'Refunds', icon: FiRotateCcw, minLevel: 1 },
  // CEO+ only
  { to: '/debts', label: 'Debts', icon: FiAlertCircle, minLevel: 2 },
  { to: '/stock-requests', label: 'Stock Requests', icon: FiInbox, minLevel: 2 },
  { to: '/credit-agreements', label: 'Credit Agreements', icon: FiCreditCard, minLevel: 2 },
  { to: '/products', label: 'Products', icon: FiPackage, minLevel: 3 },
  { to: '/categories', label: 'Categories', icon: FiTag, minLevel: 3 },
  { to: '/suppliers', label: 'Suppliers', icon: FiTruck, minLevel: 3 },
  { to: '/purchases', label: 'Purchases', icon: FiShoppingBag, minLevel: 3 },
  { to: '/workers', label: 'Worker Payments', icon: FiUsers, minLevel: 3 },
  { to: '/financial', label: 'Financial', icon: FiTrendingUp, minLevel: 3 },
  { to: '/reports', label: 'Reports', icon: FiBarChart2, minLevel: 3 },
  { to: '/sales-history', label: 'Sales History', icon: FiList, minLevel: 3 },
  { to: '/search', label: 'Search', icon: FiSearch, minLevel: 3 },
  { to: '/users', label: 'User Management', icon: FiUser, minLevel: 3 },
  { to: '/audit-logs', label: 'Audit Logs', icon: FiFileText, minLevel: 3 },
  { to: '/backup', label: 'Backup & Restore', icon: FiDatabase, minLevel: 3 },
  { to: '/settings', label: 'Settings', icon: FiSettings, minLevel: 3 },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const userLevel = getRoleLevel(user?.role)

  const visibleNavItems = NAV_ITEMS.filter(item => userLevel >= item.minLevel)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await apiLogout()
    } catch {}
    logout()
    navigate('/login')
    toast.success('Logged out successfully')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white shadow-xl z-40 flex flex-col
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:shadow-none lg:border-r lg:border-gray-200
      `}>
        {/* Logo */}
        <div className="bg-orange-500 px-5 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white font-black text-lg leading-tight tracking-wide">ITTEK SOLUTION</h1>
            <p className="text-orange-100 text-xs font-medium leading-tight">DAN & DOR SOLAR</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white hover:text-orange-200 p-1"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.to
            const isNotif = item.to === '/notifications'
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all group relative
                  ${isActive
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                  }`}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {isNotif && unreadCount > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center
                    ${isActive ? 'bg-white text-orange-500' : 'bg-orange-500 text-white'}`}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User info at bottom */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <span className="text-orange-600 font-bold text-sm">
                {(user?.username || user?.name || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.username || user?.name}
              </p>
              <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                {getRoleLabel(user?.role)}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors font-medium"
          >
            <FiLogOut size={16} />
            {loggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top navbar */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
              >
                <FiMenu size={20} />
              </button>
              <div className="hidden lg:block">
                <h2 className="text-sm font-semibold text-gray-700">
                  {visibleNavItems.find(n => n.to === location.pathname)?.label || 'Dashboard'}
                </h2>
              </div>
              {/* Mobile brand */}
              <div className="lg:hidden">
                <span className="font-black text-orange-500 text-base">ITTEK</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Search icon */}
              <NavLink
                to="/search"
                className="p-2 rounded-lg text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
              >
                <FiSearch size={18} />
              </NavLink>

              {/* Notification bell */}
              <NavLink
                to="/notifications"
                className="p-2 rounded-lg text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors relative"
              >
                <FiBell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </NavLink>

              {/* User avatar */}
              <div className="flex items-center gap-2 ml-1">
                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">
                    {(user?.username || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{user?.username}</p>
                  <p className="text-xs text-gray-500">{getRoleLabel(user?.role)}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Offline banner */}
        <OfflineBanner />

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
