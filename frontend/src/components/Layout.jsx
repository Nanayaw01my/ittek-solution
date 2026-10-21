import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { canAccessPage } from '../config/pageAccess'
import { getMe } from '../api/auth'
import useNotificationStore from '../store/notificationStore'
import { getRoleLabel, getRoleLevel } from '../utils/helpers'
import {
  FiHome, FiShoppingCart, FiPackage, FiTag, FiTruck, FiDollarSign,
  FiAlertCircle, FiUsers, FiShoppingBag, FiInbox, FiFileText,
  FiBarChart2, FiSettings, FiDatabase, FiBell, FiSearch, FiLogOut,
  FiMenu, FiX, FiCreditCard, FiUser, FiTrendingUp, FiRotateCcw, FiList,
  FiArchive, FiShield, FiGlobe, FiTrash2, FiClipboard, FiSend, FiSmartphone, FiTool, FiAlertTriangle, FiLock, FiCheckSquare, FiPhone, FiUserCheck
} from 'react-icons/fi'
import { logout as apiLogout } from '../api/auth'
import toast from 'react-hot-toast'
import OfflineBanner from './OfflineBanner'
import LocaleSwitcher from './LocaleSwitcher'
import HelpAssistant from './HelpAssistant'
import InstallAppButton from './InstallAppButton'

/** The only screens a DSR out on the field ever sees. */
export const FIELD_AGENT_PAGES = ['/field-dispatch', '/phone-sales', '/notifications']

/** Where a field agent lands after signing in, instead of the dashboard. */
export const FIELD_AGENT_HOME = '/field-dispatch'

/**
 * The sidebar, in groups.
 *
 * Forty entries in one flat list is three screens of scrolling on a phone to
 * reach Settings, and no way to guess where anything is — Refunds sat
 * between Point of Sale and Field Dispatch for no reason a person could
 * name. Grouping is the whole fix: a heading tells you which handful to read
 * and lets you skip the rest.
 *
 * The order of the groups follows the day: selling first, then stock, then
 * money, then the things looked at once a week.
 */
const SECTIONS = [
  { key: 'selling', label: 'Selling' },
  { key: 'customers', label: 'Customers & credit' },
  { key: 'stock', label: 'Stock' },
  { key: 'money', label: 'Money' },
  { key: 'admin', label: 'Admin' },
];

const NAV_ITEMS = [
  // All logged-in users
  { to: '/dashboard', label: 'Dashboard', icon: FiHome, minLevel: 1, section: 'selling' },
  { to: '/expenses', label: 'Expenses', icon: FiDollarSign, minLevel: 1, section: 'money' },
  { to: '/notifications', label: 'Notifications', icon: FiBell, minLevel: 1, section: 'selling' },
  // Sales+ (all logged-in users)
  { to: '/pos', label: 'Point of Sale', icon: FiShoppingCart, minLevel: 1, section: 'selling' },
  { to: '/refunds', label: 'Refunds', icon: FiRotateCcw, minLevel: 1, section: 'selling' },
  { to: '/field-dispatch', label: 'Field Dispatch', icon: FiSend, minLevel: 1, section: 'selling' },
  { to: '/phone-sales', label: 'Phone Credit Sales', icon: FiSmartphone, minLevel: 1, section: 'selling' },
  { to: '/service-charges', label: 'Service Charges', icon: FiTool, minLevel: 1, section: 'selling' },
  { to: '/damaged-goods', label: 'Damaged & Faulty', icon: FiAlertTriangle, minLevel: 1, section: 'stock' },
  { to: '/cash-up', label: 'Cash Up', icon: FiLock, minLevel: 2, section: 'money' },
  { to: '/customers', label: 'Customers', icon: FiUsers, minLevel: 2, section: 'customers' },
  { to: '/warranties', label: 'Warranties', icon: FiShield, minLevel: 1, section: 'customers' },
  { to: '/quotations', label: 'Quotations', icon: FiFileText, minLevel: 1, section: 'selling' },
  { to: '/reorder', label: 'What to Order', icon: FiTrendingUp, minLevel: 2, section: 'stock' },
  { to: '/receipt-approvals', label: 'Receipt Approvals', icon: FiCheckSquare, minLevel: 2, section: 'selling' },
  { to: '/reminders', label: 'Reminders', icon: FiBell, minLevel: 2, section: 'customers' },
  { to: '/contacts', label: 'Contact Book', icon: FiPhone, minLevel: 2, section: 'customers' },
  { to: '/installations', label: 'Installations', icon: FiTool, minLevel: 1, section: 'customers' },
  { to: '/payables', label: 'What We Owe', icon: FiTruck, minLevel: 3, section: 'money' },
  { to: '/margins', label: 'Margin Watch', icon: FiTrendingUp, minLevel: 3, page: 'reports', section: 'money' },
  { to: '/system-health', label: 'System Health', icon: FiShield, minLevel: 3, section: 'admin' },
  { to: '/packages-receipt', label: 'Packages Receipt', icon: FiFileText, minLevel: 2, section: 'selling' },
  // CEO+ only
  { to: '/debts', label: 'Debts', icon: FiAlertCircle, minLevel: 2, section: 'customers' },
  { to: '/stock-requests', label: 'Stock Requests', icon: FiInbox, minLevel: 2, section: 'stock' },
  { to: '/credit-agreements', label: 'Credit Agreements', icon: FiCreditCard, minLevel: 2, section: 'customers' },
  { to: '/layaways', label: 'Layaways', icon: FiArchive, minLevel: 2, section: 'customers' },
  { to: '/documents', label: 'Documents', icon: FiClipboard, minLevel: 2, section: 'admin' },
  { to: '/fraud-alerts', label: 'Fraud Alerts', icon: FiShield, minLevel: 3, section: 'admin' },
  { to: '/products', label: 'Products', icon: FiPackage, minLevel: 3, section: 'stock' },
  { to: '/categories', label: 'Categories', icon: FiTag, minLevel: 3, section: 'stock' },
  { to: '/suppliers', label: 'Suppliers', icon: FiTruck, minLevel: 3, section: 'stock' },
  { to: '/purchases', label: 'Purchases', icon: FiShoppingBag, minLevel: 2, section: 'stock' },
  { to: '/workers', label: 'Worker Payments', icon: FiUsers, minLevel: 3, section: 'money' },
  { to: '/financial', label: 'Financial', icon: FiTrendingUp, minLevel: 3, section: 'money' },
  { to: '/reports', label: 'Reports', icon: FiBarChart2, minLevel: 3, section: 'money' },
  { to: '/sales-history', label: 'Sales History', icon: FiList, minLevel: 3, section: 'money' },
  { to: '/staff-sales', label: 'Who Sold What', icon: FiUserCheck, minLevel: 3, section: 'money' },
  { to: '/search', label: 'Search', icon: FiSearch, minLevel: 3, section: 'admin' },
  { to: '/users', label: 'User Management', icon: FiUser, minLevel: 3, section: 'admin' },
  { to: '/audit-logs', label: 'Audit Logs', icon: FiFileText, minLevel: 3, section: 'admin' },
  { to: '/backup', label: 'Backup & Restore', icon: FiDatabase, minLevel: 3, section: 'admin' },
  { to: '/delete-records', label: 'Delete Records', icon: FiTrash2, minLevel: 3, section: 'admin' },
  { to: '/settings', label: 'Settings', icon: FiSettings, minLevel: 3, section: 'admin' },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  // Forty-two screens is more than anybody scrolls through. Typing three
  // letters is faster than finding "Delete Records" by eye.
  const [navFilter, setNavFilter] = useState('')

  // The stored user is written at login and never again, so a page the CEO
  // grants mid-shift would not appear in the sidebar until the next login.
  // Re-read it once per mount; a failure (offline, for one) leaves the stored
  // copy in place rather than logging anyone out.
  const updateUser = useAuthStore(s => s.updateUser)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getMe()
      .then(r => {
        const fresh = r.data?.data || r.data
        if (cancelled || !fresh) return
        updateUser({
          role: fresh.role,
          // Carried through so a photo added by an owner appears on this
          // person's next page load rather than only after they sign in again.
          avatar_url: fresh.avatar_url,
          assigned_categories: (fresh.assigned_categories || []).map(c => String(c?._id || c)),
          page_access: fresh.page_access || {},
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const userLevel = getRoleLevel(user?.role)

  // A screen shows when the role reaches it, or when the CEO granted this user
  // that page individually. The page id is the route without its slash.
  //
  // A field agent is the exception: they get the one screen and nothing else,
  // listed rather than filtered so a page added later does not quietly appear
  // on a rep's phone. The server enforces the same list.
  const visibleNavItems = user?.role === 'Field Agent'
    ? NAV_ITEMS.filter(item => FIELD_AGENT_PAGES.includes(item.to))
    : NAV_ITEMS.filter(item =>
      userLevel >= item.minLevel || canAccessPage(user, item.to.slice(1))
    )

  useEffect(() => { if (!sidebarOpen) setNavFilter('') }, [sidebarOpen])

  // Matched on the label and on the address, so "stock" finds Stock
  // Requests and "backup" finds Backup & Restore however it is spelt.
  const needle = navFilter.trim().toLowerCase()
  const matchedNav = needle
    ? visibleNavItems.filter((i) =>
      i.label.toLowerCase().includes(needle) || i.to.toLowerCase().includes(needle))
    : visibleNavItems

  // The page's own name, for the bar at the top of a phone.
  const currentPage = visibleNavItems.find((n) => n.to === location.pathname)

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
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 flex">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {/*
        On a desktop this is a column as tall as the window and no taller.

        It used to be `lg:static h-full`, and h-full has nothing to resolve
        against in a min-height container — so instead of the nav scrolling
        inside itself, the whole sidebar grew to fit all forty-two entries.
        At 2,119px in a 900px window that put Settings a thousand pixels
        below the fold, reachable only by scrolling the entire page, and on
        a short page not reachable at all. Grouping the menu added the
        headings that tipped it over.

        Sticky rather than static: the column stays put while the page
        scrolls, and h-screen gives the nav inside it a height to scroll
        against.
      */}
      <aside className={`
        fixed top-0 left-0 h-full w-[17rem] bg-white shadow-xl z-40 flex flex-col
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:self-start
        lg:shadow-none lg:border-r lg:border-gray-200
      `}>
        {/* Logo. The top padding clears a phone's notch when the app is
            installed and draws under the status bar. */}
        <div className="bg-orange-500 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] flex items-start justify-between">
          <div>
            <h1 className="text-white font-black text-lg leading-tight tracking-wide">ITTEK SOLUTION</h1>
            <p className="text-orange-100 text-xs font-medium leading-tight">DAN & DOR SOLAR</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="lg:hidden -mr-2 -mt-1 text-white/90 hover:text-white p-2"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Nav items, in groups. A heading tells you which handful to read
            and lets you skip the other thirty. */}
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              placeholder="Find a screen…"
              aria-label="Find a screen"
              className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white"
            />
            {navFilter && (
              <button
                onClick={() => setNavFilter('')}
                aria-label="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <FiX size={14} />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 py-1 overflow-y-auto overscroll-contain">
          {matchedNav.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">
              Nothing here matches “{navFilter}”.
            </p>
          )}
          {SECTIONS.map((section) => {
            const items = matchedNav.filter((i) => i.section === section.key)
            if (items.length === 0) return null
            return (
              <div key={section.key} className="pb-1">
                <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-[0.08em] text-gray-400">
                  {section.label}
                </p>
                {items.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.to
                  const isNotif = item.to === '/notifications'
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors
                        ${isActive
                          ? 'bg-orange-500 text-white font-bold shadow-sm'
                          : 'text-gray-600 font-medium hover:bg-orange-50 hover:text-orange-600'
                        }`}
                    >
                      <Icon size={17} className="flex-shrink-0" />
                      <span className="flex-1 leading-snug">{item.label}</span>
                      {isNotif && unreadCount > 0 && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center
                          ${isActive ? 'bg-white text-orange-500' : 'bg-orange-500 text-white'}`}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}

        </nav>

        {/* The two controls that used to crowd the top bar on a phone. They
            belong to the person, not to the page, so they sit with the
            account — and outside the nav, so filtering never hides them. */}
        <div className="lg:hidden border-t border-gray-100 px-4 py-2.5 flex items-center gap-2">
          <LocaleSwitcher />
          <InstallAppButton compact />
        </div>

        {/* User info at bottom */}
        <div className="border-t border-gray-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
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
        <header className="bg-white/95 backdrop-blur border-b border-gray-200 sticky top-0 z-20
                           pt-[env(safe-area-inset-top,0px)]">
          <div className="flex items-center justify-between gap-2 px-2 sm:px-4 h-14">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                className="lg:hidden p-2.5 rounded-xl text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
              >
                <FiMenu size={20} />
              </button>
              {/* Which page this is.
                  The phone used to show only the word ITTEK, so the only
                  thing naming the screen was the heading below — and a toast
                  landing over it left nothing at all. */}
              <h2 className="text-[15px] font-bold text-gray-800 truncate">
                {currentPage?.label || 'Dashboard'}
              </h2>
            </div>

            <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
              {/* Ask the system how to do something. On every screen, because
                  the question is always asked mid-task. */}
              <HelpAssistant />

              {/* Search icon */}
              <NavLink
                to="/search"
                aria-label="Search"
                className="p-2.5 rounded-xl text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
              >
                <FiSearch size={18} />
              </NavLink>

              {/* Installing the app and switching currency are settings, not
                  page controls. On a phone they moved into the menu, where
                  they stop competing with the page's own buttons; on a wide
                  screen there is room for them here. */}
              <div className="hidden lg:flex items-center gap-2">
                <InstallAppButton compact />
                <LocaleSwitcher />
              </div>

              {/* Notification bell */}
              <NavLink
                to="/notifications"
                aria-label="Notifications"
                className="p-2.5 rounded-xl text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors relative"
              >
                <FiBell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </NavLink>

              {/* User avatar */}
              <div className="flex items-center gap-2 ml-0.5 sm:ml-1">
                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
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
