import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import { format } from 'date-fns'

const NAV_CARDS = [
  { label: 'CUSTOMERS', to: '/admin/customers', icon: '👥', color: 'bg-green-50 border-green-200' },
  { label: 'STAFF', to: '/admin/staff', icon: '👤', color: 'bg-blue-50 border-blue-200' },
  { label: 'DEVICES', to: '/admin/devices', icon: '📱', color: 'bg-purple-50 border-purple-200' },
  { label: 'TRANSACTIONS', to: '/admin/transactions', icon: '💳', color: 'bg-yellow-50 border-yellow-200' },
  { label: 'REPORTS', to: '/admin/reports', icon: '📊', color: 'bg-orange-50 border-orange-200' },
  { label: 'SETTINGS', to: '/admin/settings', icon: '⚙️', color: 'bg-gray-50 border-gray-200' },
]

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [recentTransactions, setRecentTransactions] = useState([])
  const [revenueData, setRevenueData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, txRes, revenueRes] = await Promise.allSettled([
          api.get('/admin/stats'),
          api.get('/admin/transactions?limit=5'),
          api.get('/admin/reports/revenue?period=monthly'),
        ])

        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
        if (txRes.status === 'fulfilled') {
          setRecentTransactions(txRes.value.data?.transactions || txRes.value.data || [])
        }
        if (revenueRes.status === 'fulfilled') {
          setRevenueData(revenueRes.value.data?.chart || revenueRes.value.data || [])
        }
      } catch (err) {
        console.error('Dashboard error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const summaryCards = [
    {
      label: 'Total Staff',
      value: stats?.total_staff ?? 0,
      icon: (
        <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      bg: 'bg-blue-50',
      text: 'text-blue-700',
    },
    {
      label: 'Total Customers',
      value: stats?.total_customers ?? 0,
      icon: (
        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      bg: 'bg-green-50',
      text: 'text-green-700',
    },
    {
      label: 'Total Devices',
      value: stats?.total_devices ?? 0,
      icon: (
        <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      bg: 'bg-purple-50',
      text: 'text-purple-700',
    },
    {
      label: 'Overdue Payments',
      value: stats?.overdue_payments ?? 0,
      icon: (
        <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bg: 'bg-orange-50',
      text: 'text-orange-700',
    },
    {
      label: 'Locked Phones',
      value: stats?.locked_phones ?? 0,
      icon: (
        <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      bg: 'bg-red-50',
      text: 'text-red-700',
    },
    {
      label: 'Active Plans',
      value: stats?.active_plans ?? 0,
      icon: (
        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="xl" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-24 pt-4">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Welcome back, {user?.full_name || user?.name} •{' '}
          {format(new Date(), 'EEEE, dd MMMM yyyy')}
        </p>
      </div>

      {/* Summary Cards - 2 per row mobile, 3 per row tablet+ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className={`${card.bg} rounded-2xl p-4 border border-opacity-50`}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                {card.icon}
              </div>
            </div>
            <p className={`text-2xl font-black ${card.text}`}>{card.value.toLocaleString()}</p>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Navigation Cards - 2 per row */}
      <h2 className="text-base font-bold text-gray-700 mb-3">Quick Navigation</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {NAV_CARDS.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className={`${card.color} border-2 rounded-2xl p-4 text-left
                       active:scale-95 transition-all duration-150 hover:shadow-md`}
          >
            <div className="text-3xl mb-2">{card.icon}</div>
            <p className="text-sm font-black text-gray-800 tracking-wide">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Revenue Chart */}
      {revenueData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card p-4 mb-5">
          <h3 className="text-base font-bold text-gray-800 mb-4">Monthly Revenue (GHS)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value) => [`GHS ${Number(value).toLocaleString()}`, 'Revenue']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="total" fill="#2E7D32" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl shadow-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-800">Recent Transactions</h3>
          <button
            onClick={() => navigate('/admin/transactions')}
            className="text-sm text-green-700 font-semibold hover:text-green-900"
          >
            View All
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className="text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((tx, idx) => (
              <div key={tx.id || idx} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {tx.customer_name || tx.customer?.full_name || 'Customer'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tx.created_at ? format(new Date(tx.created_at), 'dd MMM, HH:mm') : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-800">
                    GHS {Number(tx.amount || 0).toLocaleString()}
                  </p>
                  <StatusBadge status={tx.status || 'paid'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
