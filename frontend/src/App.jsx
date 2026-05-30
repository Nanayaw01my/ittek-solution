import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/authStore'
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

const ROLE_LEVELS = { 'Sales': 1, 'Manager': 2, 'CEO': 3, 'Super Admin': 4 }

function ProtectedRoute({ children, minLevel = 1, allowedRoles = null }) {
  const { user, token } = useAuthStore()
  const isAuthenticated = !!token && !!user

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const userLevel = ROLE_LEVELS[user?.role] || 0

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  if (minLevel && userLevel < minLevel) {
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
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

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
        <Route path="search" element={<ProtectedRoute minLevel={3}><Search /></ProtectedRoute>} />

        {/* CEO+ */}
        <Route path="debts" element={<ProtectedRoute minLevel={3}><Debts /></ProtectedRoute>} />
        <Route path="stock-requests" element={<ProtectedRoute minLevel={3}><StockRequests /></ProtectedRoute>} />
        <Route path="credit-agreements" element={<ProtectedRoute minLevel={3}><CreditAgreements /></ProtectedRoute>} />

        {/* CEO+ */}
        <Route
          path="products"
          element={
            <ProtectedRoute minLevel={3}>
              <Products />
            </ProtectedRoute>
          }
        />
        <Route
          path="categories"
          element={
            <ProtectedRoute minLevel={3}>
              <Categories />
            </ProtectedRoute>
          }
        />
        <Route
          path="suppliers"
          element={
            <ProtectedRoute minLevel={3}>
              <Suppliers />
            </ProtectedRoute>
          }
        />
        <Route
          path="purchases"
          element={
            <ProtectedRoute minLevel={3}>
              <Purchases />
            </ProtectedRoute>
          }
        />
        <Route
          path="workers"
          element={
            <ProtectedRoute minLevel={3}>
              <Workers />
            </ProtectedRoute>
          }
        />
        <Route
          path="financial"
          element={
            <ProtectedRoute minLevel={3}>
              <Financial />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute minLevel={3}>
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
            <ProtectedRoute minLevel={3}>
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
