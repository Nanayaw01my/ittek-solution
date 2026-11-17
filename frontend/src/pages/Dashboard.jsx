import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { FiShoppingCart, FiDollarSign, FiPackage, FiAlertTriangle, FiUsers, FiTrendingUp, FiActivity, FiCreditCard, FiClock, FiSend, FiTool } from 'react-icons/fi'
import StatCard from '../components/StatCard'
import { getDashboardStats, getSalesTrend, getTopProductsReport } from '../api/reports'
import { getSales } from '../api/pos'
import useAuthStore from '../store/authStore'
import { formatCurrency, formatDate, getRoleLevel } from '../utils/helpers'
import Badge from '../components/Badge'
import RefreshButton from '../components/RefreshButton'
import OwnerDashboard from './OwnerDashboard'
import AttendantDashboard from './AttendantDashboard'
import { format } from 'date-fns'

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

/** Everybody below the owners: their own day, and the few things they act on. */
function StaffDashboard({ user, userLevel }) {

  const { data: statsData, isLoading: statsLoading, isError: statsError, error: statsErrObj } = useQuery({
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

  /**
   * A failed request used to look exactly like a quiet day: every card fell
   * back to zero and said nothing. On a screen people use to check the day's
   * takings that is worse than showing nothing at all — GHC 0.00 reads as
   * "no sales", not as "the figures did not load".
   */
  const StatsError = () => (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <FiAlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
      <p className="text-sm text-red-800">
        <span className="font-bold">The figures below did not load</span> — they are not
        real zeros. {statsErrObj?.message || 'The server could not be reached.'} Press
        Refresh to try again.
      </p>
    </div>
  )
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
          <RefreshButton keys={['dashboard-stats']} />
        </div>

        {statsError && <div className="mb-4"><StatsError /></div>}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
          <StatCard
            icon={FiShoppingCart}
            value={formatCurrency(stats.myTodaySales || 0)}
            label="My Today's Takings"
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
            icon={FiClock}
            value={formatCurrency(stats.myTodayLayawayCollections || 0)}
            label="My Pay & Pick Later Today"
            color="blue"
            loading={statsLoading}
            hint={statsError ? null : 'included in your takings'}
          />
          {/* How much stock the shop holds and what is running low is the
              owners' business — the server does not send those figures to
              anyone below CEO, so there is nothing to show here. */}
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

        {/* What the takings above are actually made of.
            A number on its own cannot be checked: somebody who knows they
            rang up a sale and is shown GHC 0.00 has no way to tell whether
            the figure is wrong or the sale was recorded against somebody
            else's name. The list answers that without anybody asking. */}
        {!statsError && (
          <div className="mt-6 bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <p className="font-black text-gray-900 text-sm">My sales today</p>
              <span className="text-xs text-gray-500">
                {stats.myTodaySalesCount ?? 0} sale{stats.myTodaySalesCount === 1 ? '' : 's'}
              </span>
            </div>

            {(stats.myTodaySalesList || []).length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-500">Nothing rung up under your name today.</p>
                <p className="text-xs text-gray-400 mt-1">
                  If you made a sale and it is not here, it was recorded against
                  another account — tell the office which sale it was.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {stats.myTodaySalesList.map((s) => (
                  <div key={s._id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {s.customer_name || 'Walk-in customer'}
                      </p>
                      <p className="text-[11px] text-gray-500 font-mono">
                        {s.invoice_no} · {format(new Date(s.sale_date), 'HH:mm')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-gray-900">{formatCurrency(s.total_amount)}</p>
                      {/* Released layaways are deliberately outside the
                          takings — the money was counted as the instalments
                          came in — so the row says so rather than looking
                          like it went missing. */}
                      {!s.counted && (
                        <p className="text-[11px] text-gray-400">
                          counted when it was paid
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

}

/**
 * Which dashboard a person gets.
 *
 * A switch and nothing else, because the two views do not share a single
 * hook: the owner's draws everything from one request, and the staff
 * view below fetches four smaller reports it actually uses.
 *
 * It has to be a switch at this level rather than an early return inside
 * one component. The stored role is refreshed from the server shortly
 * after the app mounts, so a person whose role changed would re-render
 * this component at a different level — and a component that calls four
 * hooks on one render and none on the next is how React throws
 * "rendered fewer hooks than expected" and takes the screen with it.
 */
export default function Dashboard() {
  const { user } = useAuthStore()
  const userLevel = getRoleLevel(user?.role)
  if (userLevel >= 3) return <OwnerDashboard username={user?.username} />
  // A sales attendant's day is their own sales and nothing else, which is
  // a different question from the one the staff view answers.
  if (user?.role === 'Sales') return <AttendantDashboard username={user?.username} />
  return <StaffDashboard user={user} userLevel={userLevel} />
}
