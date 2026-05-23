import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoadingSpinner from './components/LoadingSpinner'

// Public pages
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

// Admin pages
import AdminDashboard from './pages/admin/Dashboard'
import AdminCustomers from './pages/admin/Customers'
import AdminCustomerDetail from './pages/admin/CustomerDetail'
import AdminStaff from './pages/admin/Staff'
import AdminDevices from './pages/admin/Devices'
import AdminTransactions from './pages/admin/Transactions'
import AdminReports from './pages/admin/Reports'
import AdminAuditLogs from './pages/admin/AuditLogs'
import AdminSettings from './pages/admin/Settings'

// Staff pages
import StaffDashboard from './pages/staff/Dashboard'
import StaffCustomers from './pages/staff/Customers'
import StaffAddCustomer from './pages/staff/AddCustomer'
import StaffCustomerDetail from './pages/staff/CustomerDetail'

// Customer pages
import CustomerDashboard from './pages/customer/Dashboard'
import CustomerPayments from './pages/customer/Payments'
import CustomerProfile from './pages/customer/Profile'

// Layout
import Layout from './components/Layout'

function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, userRole, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Redirect to appropriate dashboard
    if (userRole === 'admin') return <Navigate to="/admin/dashboard" replace />
    if (userRole === 'staff') return <Navigate to="/staff/dashboard" replace />
    if (userRole === 'customer') return <Navigate to="/customer/dashboard" replace />
    return <Navigate to="/login" replace />
  }

  return children
}

function RoleRedirect() {
  const { isAuthenticated, userRole, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (userRole === 'admin') return <Navigate to="/admin/dashboard" replace />
  if (userRole === 'staff') return <Navigate to="/staff/dashboard" replace />
  if (userRole === 'customer') return <Navigate to="/customer/dashboard" replace />
  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<RoleRedirect />} />

      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Layout role="admin" />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="customers/:id" element={<AdminCustomerDetail />} />
        <Route path="staff" element={<AdminStaff />} />
        <Route path="devices" element={<AdminDevices />} />
        <Route path="transactions" element={<AdminTransactions />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Staff routes */}
      <Route
        path="/staff"
        element={
          <ProtectedRoute allowedRoles={['staff']}>
            <Layout role="staff" />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/staff/dashboard" replace />} />
        <Route path="dashboard" element={<StaffDashboard />} />
        <Route path="customers" element={<StaffCustomers />} />
        <Route path="customers/add" element={<StaffAddCustomer />} />
        <Route path="customers/:id" element={<StaffCustomerDetail />} />
      </Route>

      {/* Customer routes */}
      <Route
        path="/customer"
        element={
          <ProtectedRoute allowedRoles={['customer']}>
            <Layout role="customer" />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/customer/dashboard" replace />} />
        <Route path="dashboard" element={<CustomerDashboard />} />
        <Route path="payments" element={<CustomerPayments />} />
        <Route path="profile" element={<CustomerProfile />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
