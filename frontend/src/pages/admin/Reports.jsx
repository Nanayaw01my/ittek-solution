import React, { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../../api/axios'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'

const PERIODS = ['daily', 'weekly', 'monthly']

export default function AdminReports() {
  const [period, setPeriod] = useState('monthly')
  const [chartData, setChartData] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/admin/reports?period=${period}`)
      const d = res.data?.data || res.data
      setChartData(Array.isArray(d.revenueData) ? d.revenueData : [])
      setSummary(d.summary || null)
    } catch (err) {
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchReports() }, [fetchReports])

  const statCards = [
    {
      label: 'Total Revenue',
      value: `GHS ${Number(summary?.totalRevenue || 0).toLocaleString()}`,
      icon: '💰',
      bg: 'bg-green-50',
      text: 'text-green-800',
    },
    {
      label: 'Transactions',
      value: summary?.totalTransactions ?? 0,
      icon: '💳',
      bg: 'bg-orange-50',
      text: 'text-orange-700',
    },
    {
      label: 'Avg Transaction',
      value: `GHS ${Number(summary?.avgTransactionValue || 0).toLocaleString()}`,
      icon: '📈',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
    },
    {
      label: 'Period',
      value: period.charAt(0).toUpperCase() + period.slice(1),
      icon: '📅',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
    },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 pt-4">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Revenue and performance analytics</p>
      </div>

      {/* Period selector */}
      <div className="flex bg-gray-100 rounded-2xl p-1 mb-5">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold capitalize transition-all duration-200
              ${period === p ? 'bg-white shadow text-green-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {p}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {statCards.map((card) => (
              <div key={card.label} className={`${card.bg} rounded-2xl p-4`}>
                <p className="text-2xl mb-1">{card.icon}</p>
                <p className={`text-xl font-black ${card.text}`}>{card.value}</p>
                <p className="text-xs font-semibold text-gray-600 mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Revenue Chart */}
          {chartData.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-card p-4 mb-5">
              <h3 className="text-base font-bold text-gray-800 mb-4 capitalize">
                {period.charAt(0).toUpperCase() + period.slice(1)} Revenue (GHS)
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value) => [`GHS ${Number(value).toLocaleString()}`, 'Revenue']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="total_revenue" fill="#2E7D32" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card p-12 text-center mb-5">
              <p className="text-gray-400 text-sm">No revenue data available for this period</p>
            </div>
          )}

        </>
      )}
    </div>
  )
}
