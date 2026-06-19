import React, { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { FiShoppingCart, FiDollarSign, FiPackage, FiAlertTriangle, FiUsers, FiTrendingUp, FiActivity, FiCreditCard, FiRefreshCw, FiCheckCircle } from 'react-icons/fi'
import toast from 'react-hot-toast'
import StatCard from '../components/StatCard'
import { getDashboardStats, getSalesTrend, getTopProductsReport } from '../api/reports'
import { getSales } from '../api/pos'
import { syncOfflineSales } from '../api/sync'
import useAuthStore from '../store/authStore'
import { formatCurrency, formatDate, getRoleLevel } from '../utils/helpers'
import Badge from '../components/Badge'
import { getPendingQueue, removeSaleFromQueue } from '../utils/offlineQueue'

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg">
        <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-sm font-bold" style={{ color: p.color }}>
            {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

function SyncButton() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('idle') // idle | syncing | done

  const handleSync = useCallback(async () => {
    if (status === 'syncing') return
    setStatus('syncing')

    // 1. Push any pending offline sales
    const queue = getPendingQueue()
    let synced = 0, failed = 0
    for (const entry of queue) {
      try {
        await syncOfflineSales([{ type: entry.type, payload: entry.payload }])
        removeSaleFromQueue(entry.id)
        synced++
      } catch {
        failed++
      }
    }

    // 2. Refresh all dashboard data
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['sales-trend'] }),
      queryClient.invalidateQueries({ queryKey: ['top-products'] }),
      queryClient.invalidateQueries({ queryKey: ['recent-sales'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
    ])

    setStatus('done')
    if (synced > 0) {
      toast.success(`Synced ${synced} offline sale${synced > 1 ? 's' : ''} and refreshed dashboard`)
    } else if (failed > 0) {
      toast.error(`${failed} offline sale${failed > 1 ? 's' : ''} failed to sync`)
    } else {
      toast.success('Dashboard refreshed')
    }

    setTimeout(() => setStatus('idle'), 2000)
  }, [status, queryClient])

  return (
    <button
      onClick={handleSync}
      disabled={status === 'syncing'}
      title="Sync offline sales and refresh all data"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px',
        background: status === 'done' ? '#10b981' : '#f97316',
        color: 'white',
        border: 'none',
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 700,
        cursor: status === 'syncing' ? 'not-allowed' : 'pointer',
        opacity: status === 'syncing' ? 0.75 : 1,
        transition: 'background 0.3s',
        fontFamily: 'inherit',
        flexShrink: 0,
      }}
    >
      {status === 'done'
        ? <><FiCheckCircle size={14} /> Synced</>
        : <><FiRefreshCw size={14} style={status === 'syncing' ? { animation: 'spin 0.7s linear infinite' } : {}} />
           {status === 'syncing' ? 'Syncing…' : 'Sync'}</>
      }
    </button>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const userLevel = getRoleLevel(user?.role)

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => getDashboardStats().then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['sales-trend'],
    queryFn: () => getSalesTrend({ days: 7 }).then(r => r.data),
    enabled: userLevel >= 3,
  })

  const { data: topProducts } = useQuery({
    queryKey: ['top-products'],
    queryFn: () => getTopProductsReport({ limit: 5 }).then(r => r.data),
    enabled: userLevel >= 3,
  })

  const { data: recentSales } = useQuery({
    queryKey: ['recent-sales'],
    queryFn: () => getSales({ limit: 5 }).then(r => r.data),
    enabled: userLevel >= 3,
  })

  const stats = statsData || {}
  const recentSalesList = Array.isArray(recentSales) ? recentSales : []
  const topProductsList = Array.isArray(topProducts) ? topProducts : (topProducts?.products || [])

  // Manager/Sales: simplified view
  if (userLevel <= 2) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-900">Dashboard</h1>
            <p className="text-gray-500 text-sm">Hello, {user?.username}! Here's your summary.</p>
          </div>
          <SyncButton />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
          <StatCard
            icon={FiShoppingCart}
            value={formatCurrency(stats.myTodaySales || 0)}
            label="My Today's Sales"
            color="orange"
            loading={statsLoading}
          />
          <StatCard
            icon={FiDollarSign}
            value={formatCurrency(stats.myTodayExpenses || 0)}
            label="My Today's Expenses"
            color="red"
            loading={statsLoading}
          />
          <StatCard
            icon={FiPackage}
            value={stats.totalProducts || 0}
            label="Total Products"
            color="green"
            loading={statsLoading}
          />
          <StatCard
            icon={FiAlertTriangle}
            value={stats.lowStockCount || 0}
            label="Low Stock Alerts"
            color="yellow"
            loading={statsLoading}
          />
          {userLevel === 2 && (
            <>
              <StatCard
                icon={FiCreditCard}
                value={stats.outstandingDebts || 0}
                label="Outstanding Debts"
                color="orange"
                loading={statsLoading}
              />
              <StatCard
                icon={FiActivity}
                value={stats.pendingStockRequests || 0}
                label="Pending Stock Requests"
                color="blue"
                loading={statsLoading}
              />
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="mt-8 bg-orange-50 border border-orange-200 rounded-xl p-5">
          <h3 className="font-bold text-orange-800 mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Link to="/pos" className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors">
              Open POS
            </Link>
            <Link to="/expenses" className="px-4 py-2 bg-white border border-orange-300 text-orange-700 rounded-lg text-sm font-semibold hover:bg-orange-50 transition-colors">
              Add Expense
            </Link>
            {userLevel === 2 && (
              <>
                <Link to="/debts" className="px-4 py-2 bg-white border border-orange-300 text-orange-700 rounded-lg text-sm font-semibold hover:bg-orange-50 transition-colors">
                  View Debts
                </Link>
                <Link to="/stock-requests" className="px-4 py-2 bg-white border border-orange-300 text-orange-700 rounded-lg text-sm font-semibold hover:bg-orange-50 transition-colors">
                  Stock Requests
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // CEO / Super Admin full dashboard
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">Welcome back, {user?.username}! Here's the business overview.</p>
        </div>
        <SyncButton />
      </div>

      {/* Row 1 - Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={FiShoppingCart}
          value={formatCurrency(stats.todaySales || 0)}
          label="Today's Sales"
          color="orange"
          loading={statsLoading}
        />
        <StatCard
          icon={FiTrendingUp}
          value={formatCurrency(stats.monthlySales || 0)}
          label="Monthly Sales"
          color="blue"
          loading={statsLoading}
        />
        <StatCard
          icon={FiPackage}
          value={stats.totalProducts || 0}
          label="Total Products"
          color="green"
          loading={statsLoading}
        />
        <StatCard
          icon={FiAlertTriangle}
          value={stats.lowStockCount || 0}
          label="Low Stock Alerts"
          color="yellow"
          loading={statsLoading}
        />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={FiDollarSign}
          value={formatCurrency(stats.todayExpenses || 0)}
          label="Today's Expenses"
          color="red"
          loading={statsLoading}
        />
        <StatCard
          icon={FiActivity}
          value={formatCurrency(stats.netProfit || 0)}
          label="Net Profit (Month)"
          color={!statsLoading && (stats.netProfit || 0) < 0 ? 'red' : 'green'}
          loading={statsLoading}
        />
        <StatCard
          icon={FiCreditCard}
          value={formatCurrency(stats.outstandingDebtAmount || 0)}
          label="Outstanding Debts"
          color="orange"
          loading={statsLoading}
        />
        <StatCard
          icon={FiUsers}
          value={stats.activeUsers || 0}
          label="Active Users"
          color="purple"
          loading={statsLoading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Sales Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4">7-Day Sales Trend</h3>
          {trendLoading ? (
            <div className="h-48 bg-gray-100 animate-pulse rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData?.trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#F97316"
                  strokeWidth={2.5}
                  dot={{ fill: '#F97316', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4">Top 5 Products</h3>
          {topProductsList.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No sales data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProductsList.slice(0, 5)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="product_name" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `${v}`} />
                <Tooltip />
                <Bar dataKey="total_quantity" fill="#F97316" radius={[4, 4, 0, 0]} name="Units Sold" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Sales */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Recent Sales</h3>
            <Link to="/pos" className="text-xs text-orange-500 font-semibold hover:text-orange-600">View POS →</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentSalesList.slice(0, 5).map(sale => (
              <div key={sale._id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{sale.customer_name || 'Walk-in'}</p>
                  <p className="text-xs text-gray-500">{formatDate(sale.sale_date || sale.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-orange-600">{formatCurrency(sale.cart_total || sale.total_amount || 0)}</p>
                  <Badge status={sale.payment_status} size="xs" />
                </div>
              </div>
            ))}
            {recentSalesList.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No sales yet</p>
            )}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Low Stock Alerts</h3>
            <Link to="/products" className="text-xs text-orange-500 font-semibold hover:text-orange-600">View All →</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {(stats.lowStockProducts || []).slice(0, 5).map(p => (
              <div key={p._id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.category?.name || '—'}</p>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${p.quantity === 0 ? 'text-red-500' : 'text-orange-500'}`}>
                    {p.quantity} left
                  </span>
                  {p.quantity === 0 && (
                    <p className="text-xs text-red-400">OUT OF STOCK</p>
                  )}
                </div>
              </div>
            ))}
            {!(stats.lowStockProducts?.length) && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">All products are well-stocked</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
