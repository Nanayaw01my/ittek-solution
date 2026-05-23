import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import { format } from 'date-fns'

export default function StaffDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [recentCustomers, setRecentCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, custRes] = await Promise.allSettled([
          api.get('/staff/stats'),
          api.get('/staff/customers?limit=5'),
        ])
        if (statsRes.status === 'fulfilled') {
          setStats(statsRes.value.data?.data || statsRes.value.data)
        }
        if (custRes.status === 'fulfilled') {
          const d = custRes.value.data?.data || custRes.value.data
          setRecentCustomers(Array.isArray(d.customers) ? d.customers : [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const summaryCards = [
    {
      label: 'My Customers',
      value: stats?.my_customers ?? 0,
      icon: (
        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      bg: 'bg-green-50',
    },
    {
      label: 'Payments Today',
      value: stats?.payments_today ?? 0,
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      bg: 'bg-blue-50',
    },
    {
      label: 'Overdue',
      value: stats?.overdue ?? 0,
      icon: (
        <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bg: 'bg-red-50',
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
    <div className="max-w-2xl mx-auto px-4 pb-24 pt-4">
      {/* Header */}
      <div className="mb-5">
        <p className="text-sm text-gray-500">Staff Portal</p>
        <h1 className="text-2xl font-black text-gray-900">
          Welcome, {user?.full_name?.split(' ')[0] || 'Staff'}! 👋
        </h1>
        {user?.staff_id && (
          <p className="text-sm font-bold text-green-700 mt-0.5">ID: {user.staff_id}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {summaryCards.map((card) => (
          <div key={card.label} className={`${card.bg} rounded-2xl p-3 text-center`}>
            <div className="flex justify-center mb-1">{card.icon}</div>
            <p className="text-2xl font-black text-gray-900">{card.value}</p>
            <p className="text-xs font-semibold text-gray-600 leading-tight mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Register New Customer - Big CTA */}
      <button
        onClick={() => navigate('/staff/customers/add')}
        className="w-full py-5 bg-green-800 text-white font-black text-lg rounded-3xl
                   flex items-center justify-center gap-3 shadow-lg
                   active:scale-95 transition-all duration-150 hover:bg-green-900 mb-5"
      >
        <div className="w-10 h-10 bg-white bg-opacity-20 rounded-2xl flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        Register New Customer
      </button>

      {/* Recent Customers */}
      <div className="bg-white rounded-2xl shadow-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-800">Recent Customers</h3>
          <button
            onClick={() => navigate('/staff/customers')}
            className="text-sm text-green-700 font-semibold hover:text-green-900"
          >
            View All
          </button>
        </div>

        {recentCustomers.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-400">No customers registered yet</p>
            <p className="text-xs text-gray-400 mt-1">Tap the button above to add your first customer</p>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-50">
            {recentCustomers.slice(0, 5).map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/staff/customers/${c.id}`)}
                className="flex items-center gap-3 py-3 cursor-pointer hover:bg-gray-50 -mx-1 px-1 rounded-xl transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <span className="text-green-800 font-bold text-sm">
                      {(c.full_name || c.name || 'C').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{c.full_name || c.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {c.account_number} • {c.device_model}
                  </p>
                </div>
                <StatusBadge status={c.plan_status || c.status || 'active'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
