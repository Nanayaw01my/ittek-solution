import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/authStore'
import useDocumentTitle from './hooks/useDocumentTitle'
import { canAccessPage } from './config/pageAccess'
import Layout from './components/Layout'
import LoadingSpinner from './components/LoadingSpinner'

// Pages
import Login from './pages/Login'
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
import FraudAlerts from './pages/FraudAlerts'
import DeleteRecords from './pages/DeleteRecords'
import ReceiptForms from './pages/ReceiptForms'

const ROLE_LEVELS = { 'Sales': 1, 'Manager': 2, 'CEO': 3, 'Super Admin': 4 }

/**
 * `page` names a grantable screen (see config/pageAccess). When given, a user
 * the CEO granted that page reaches the route even if their role level is
 * below minLevel. The server checks again on every request.
 */
function ProtectedRoute({ children, minLevel = 1, allowedRoles = null, page = null }) {
  const { user, token } = useAuthStore()
  const isAuthenticated = !!token && !!user

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const userLevel = ROLE_LEVELS[user?.role] || 0

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  if (minLevel && userLevel < minLevel && !(page && canAccessPage(user, page))) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function RootRedirect() {
  const { user, token } = useAuthStore()
  const isAuthenticated = !!token && !!user
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to="/dashboard" replace />
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
