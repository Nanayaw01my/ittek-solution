import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import useAuthStore from './store/authStore'
import useDocumentTitle from './hooks/useDocumentTitle'
import { canAccessPage, ROLE_LEVELS } from './config/pageAccess'
import Layout, { FIELD_AGENT_PAGES, FIELD_AGENT_HOME } from './components/Layout'
import LoadingSpinner from './components/LoadingSpinner'

// Pages
import Login from './pages/Login'
import Welcome from './pages/Welcome'
import Dashboard from './pages/Dashboard'
import POS from './pages/POS'
import Products from './pages/Products'
import Categories from './pages/Categories'
import Suppliers from './pages/Suppliers'
import Expenses from './pages/Expenses'
import Debts from './pages/Debts'
import Workers from './pages/Workers'
import Purchases from './pages/Purchases'
import StockRequests from './pages/StockRequests'
import CreditAgreements from './pages/CreditAgreements'
import Financial from './pages/Financial'
import Reports from './pages/Reports'
import Users from './pages/Users'
import AuditLogs from './pages/AuditLogs'
import Backup from './pages/Backup'
import Settings from './pages/Settings'
import Notifications from './pages/Notifications'
import Search from './pages/Search'
import Refunds from './pages/Refunds'
import SalesHistory from './pages/SalesHistory'
import PublicReceipt from './pages/PublicReceipt'
import Layaways from './pages/Layaways'
import FieldDispatch from './pages/FieldDispatch'
import PhoneSales from './pages/PhoneSales'
import FraudAlerts from './pages/FraudAlerts'
import DeleteRecords from './pages/DeleteRecords'
import ReceiptForms from './pages/ReceiptForms'


/**
 * `page` names a grantable screen (see config/pageAccess). When given, a user
 * the CEO granted that page reaches the route even if their role level is
 * below minLevel. The server checks again on every request.
 */
function ProtectedRoute({ children, minLevel = 1, allowedRoles = null, page = null, path = null }) {
  const { user, token } = useAuthStore()
  const location = useLocation()
  const isAuthenticated = !!token && !!user

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // A field agent is confined to their own screen. Typing another route into
  // the address bar lands them back on it rather than on the dashboard, which
  // they are not allowed to see either.
  if (user?.role === 'Field Agent') {
    const here = path || location.pathname
    if (!FIELD_AGENT_PAGES.some(p => here === p || here.startsWith(p + '/'))) {
      return <Navigate to="/field-dispatch" replace />
    }
  }

  const userLevel = ROLE_LEVELS[user?.role] || 0

  // Turned away? Go to THIS user's own home, not a hardcoded /dashboard.
  // Sending someone to a page they are also barred from is what turns one
  // wrong permission into an endless redirect loop and a frozen white screen.
  const home = homeFor(user)
  // Barred from their own home page? Say so on screen. Rendering nothing would
  // be a white page, which is the same failure this guard exists to prevent —
  // it just looks like the app is broken rather than like a permission.
  const turnAway = location.pathname === home
    ? <NoAccess role={user?.role} />
    : <Navigate to={home} replace />

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return turnAway
  }

  if (minLevel && userLevel < minLevel && !(page && canAccessPage(user, page))) {
    return turnAway
  }

  return children
}

/** Shown instead of a blank screen when someone has nowhere they may go. */
function NoAccess({ role }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-black text-gray-900">No screens are open to you</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your account is set to <span className="font-bold">{role || 'an unknown role'}</span>,
          which has no pages enabled. Ask the CEO to check your role.
        </p>
        <a href="/login" className="inline-block mt-4 px-4 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl">
          Back to sign in
        </a>
      </div>
    </div>
  )
}

/** Where a signed-in user belongs when no particular page was asked for. */
function homeFor(user) {
  return user?.role === 'Field Agent' ? FIELD_AGENT_HOME : '/dashboard'
}

function RootRedirect() {
  const { user, token } = useAuthStore()
  const isAuthenticated = !!token && !!user
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to={homeFor(user)} replace />
}

export default function App() {
  // Window/tab title follows the current screen
  useDocumentTitle()

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      {/* Public receipt — what the QR code on a receipt opens. No login. */}
      <Route path="/r/:token" element={<PublicReceipt />} />

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* The greeting after signing in. Outside Layout because it is a full
          screen with no sidebar, but still behind the guard — it shows the
          person's own name and photo. */}
      <Route
        path="/welcome"
        element={<ProtectedRoute path="/welcome"><Welcome /></ProtectedRoute>}
      />

      {/* Protected routes inside Layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="pos" element={<ProtectedRoute minLevel={1}><POS /></ProtectedRoute>} />
        <Route path="refunds" element={<ProtectedRoute minLevel={1}><Refunds /></ProtectedRoute>} />
        {/* Field dispatch is open to every signed-in user. */}
        <Route path="field-dispatch" element={<ProtectedRoute minLevel={1}><FieldDispatch /></ProtectedRoute>} />
        {/* Standalone: its own records, wired into nothing else.
            Anyone may take an application; only an owner reads it back. */}
        <Route path="phone-sales" element={<ProtectedRoute minLevel={1}><PhoneSales /></ProtectedRoute>} />
        <Route path="search" element={<ProtectedRoute minLevel={3} page="search"><Search /></ProtectedRoute>} />

        {/* CEO+ */}
        <Route path="debts" element={<ProtectedRoute minLevel={2} page="debts"><Debts /></ProtectedRoute>} />
        <Route path="stock-requests" element={<ProtectedRoute minLevel={2} page="stock-requests"><StockRequests /></ProtectedRoute>} />
        <Route path="credit-agreements" element={<ProtectedRoute minLevel={2} page="credit-agreements"><CreditAgreements /></ProtectedRoute>} />
        <Route path="layaways" element={<ProtectedRoute minLevel={2}><Layaways /></ProtectedRoute>} />
        {/* Staff conduct alerts — owners only; they name individual staff */}
        <Route path="fraud-alerts" element={<ProtectedRoute minLevel={3}><FraudAlerts /></ProtectedRoute>} />

        {/* CEO+ */}
        <Route
          path="products"
          element={
            <ProtectedRoute minLevel={3} page="products">
              <Products />
            </ProtectedRoute>
          }
        />
        <Route
          path="categories"
          element={
            <ProtectedRoute minLevel={3} page="categories">
              <Categories />
            </ProtectedRoute>
          }
        />
        <Route
          path="suppliers"
          element={
            <ProtectedRoute minLevel={3} page="suppliers">
              <Suppliers />
            </ProtectedRoute>
          }
        />
        <Route
          path="purchases"
          element={
            <ProtectedRoute minLevel={3} page="purchases">
              <Purchases />
            </ProtectedRoute>
          }
        />
        <Route
          path="workers"
          element={
            <ProtectedRoute minLevel={3} page="workers">
              <Workers />
            </ProtectedRoute>
          }
        />
        <Route
          path="financial"
          element={
            <ProtectedRoute minLevel={3} page="financial">
              <Financial />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute minLevel={3} page="reports">
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute minLevel={3}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="sales-history"
          element={
            <ProtectedRoute minLevel={3} page="sales-history">
              <SalesHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit-logs"
          element={
            <ProtectedRoute minLevel={3}>
              <AuditLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path="backup"
          element={
            <ProtectedRoute minLevel={3}>
              <Backup />
            </ProtectedRoute>
          }
        />
        <Route path="documents" element={<ProtectedRoute minLevel={2}><ReceiptForms /></ProtectedRoute>} />
        {/* The page was called Receipt Forms before it grew past receipts.
            Anyone with the old address bookmarked still lands in the right place. */}
        <Route path="receipt-forms" element={<Navigate to="/documents" replace />} />
        <Route
          path="delete-records"
          element={
            <ProtectedRoute minLevel={3}>
              <DeleteRecords />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute minLevel={3}>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
