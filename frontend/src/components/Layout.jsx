import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ConfirmModal from './ConfirmModal'

const ADMIN_NAV = [
  {
    to: '/admin/dashboard',
    label: 'Home',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/admin/customers',
    label: 'Customers',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/admin/transactions',
    label: 'Payments',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    to: '/admin/settings',
    label: 'Settings',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

const STAFF_NAV = [
  {
    to: '/staff/dashboard',
    label: 'Home',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/staff/customers',
    label: 'Customers',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/staff/customers/add',
    label: 'Add',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
  },
]

const CUSTOMER_NAV = [
  {
    to: '/customer/dashboard',
    label: 'Home',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/customer/payments',
    label: 'Payments',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    to: '/customer/profile',
    label: 'Profile',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

const ADMIN_SIDEBAR = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/admin/customers', label: 'Customers', icon: '👥' },
  { to: '/admin/staff', label: 'Staff', icon: '👤' },
  { to: '/admin/devices', label: 'Devices', icon: '📱' },
  { to: '/admin/transactions', label: 'Transactions', icon: '💳' },
  { to: '/admin/reports', label: 'Reports', icon: '📊' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: '📋' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙️' },
]

export default function Layout({ role }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [logoutModal, setLogoutModal] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = role === 'admin' ? ADMIN_NAV : role === 'staff' ? STAFF_NAV : CUSTOMER_NAV

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  const getRoleLabel = () => {
    if (role === 'admin') return 'Admin Portal'
    if (role === 'staff') return 'Staff Portal'
    return 'My Account'
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Nav Bar */}
      <header className="bg-green-800 text-white sticky top-0 z-40 shadow-lg">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Hamburger for admin desktop sidebar */}
          {role === 'admin' && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-green-700 transition-colors mr-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-green-800 font-black text-xs">TH</span>
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">Tritech Hub iOS</p>
              <p className="text-green-200 text-xs leading-tight">{getRoleLabel()}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold leading-tight">
                {user?.full_name || user?.name || 'User'}
              </p>
              {user?.staff_id && (
                <p className="text-green-200 text-xs">{user.staff_id}</p>
              )}
              {user?.account_number && (
                <p className="text-green-200 text-xs">{user.account_number}</p>
              )}
            </div>

            <button
              onClick={() => setLogoutModal(true)}
              className="p-2 rounded-lg hover:bg-green-700 transition-colors ml-1"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Admin Sidebar - Desktop */}
        {role === 'admin' && (
          <>
            {/* Mobile overlay */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            <aside className={`
              fixed lg:static top-14 left-0 h-[calc(100vh-56px)] lg:h-auto
              w-64 bg-white shadow-lg z-30
              transition-transform duration-300
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
              flex flex-col
            `}>
              <nav className="flex-1 py-4 overflow-y-auto">
                {ADMIN_SIDEBAR.map((item) => {
                  const isActive = location.pathname === item.to ||
                    (item.to !== '/admin/dashboard' && location.pathname.startsWith(item.to))
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors
                        ${isActive
                          ? 'bg-green-50 text-green-800 border-r-4 border-green-800'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                      <span className="text-lg">{item.icon}</span>
                      {item.label}
                    </NavLink>
                  )
                })}
              </nav>

              <div className="p-4 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-green-800 font-bold text-sm">
                      {(user?.full_name || user?.name || 'A').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {user?.full_name || user?.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  </div>
                </div>
              </div>
            </aside>
          </>
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0 overflow-x-hidden pb-20 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Bottom Navigation - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 bottom-nav lg:hidden">
        <div className="flex items-stretch h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to ||
              (item.to !== `/${role}/dashboard` && location.pathname.startsWith(item.to) && item.to !== `/${role}/customers/add`)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors
                  ${isActive ? 'text-green-800' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <div className={`p-1 rounded-xl transition-colors ${isActive ? 'bg-green-50' : ''}`}>
                  {item.icon}
                </div>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>

      <ConfirmModal
        isOpen={logoutModal}
        onClose={() => setLogoutModal(false)}
        onConfirm={handleLogout}
        title="Sign Out"
        message="Are you sure you want to sign out of Tritech Hub iOS?"
        confirmText="Sign Out"
        cancelText="Cancel"
        confirmVariant="danger"
        loading={loggingOut}
      />
    </div>
  )
}
