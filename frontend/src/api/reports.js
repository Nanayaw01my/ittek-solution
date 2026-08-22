import api from './axios'

export const getDailySalesReport = (params) => api.get('/reports/daily-sales', { params })
export const getSalesByUserReport = (params) => api.get('/reports/sales-by-user', { params })
export const getTopProductsReport = (params) => api.get('/reports/top-products', { params })
export const getProfitLossReport = (params) => api.get('/reports/profit-loss', { params })
export const getDebtorsReport = (params) => api.get('/reports/debtors', { params })
export const getStockValuationReport = () => api.get('/reports/stock-valuation')
export const getDashboardStats = () => api.get('/reports/dashboard-stats')
export const getSalesTrend = (params) => api.get('/reports/sales-trend', { params })
export const getFinancialOverview = (params) => api.get('/reports/financial-overview', { params })
export const getCashFlow = (params) => api.get('/reports/cash-flow', { params })
export const exportReport = (type, params) => api.get(`/reports/export/${type}`, { params, responseType: 'blob' })

/** Printable price list — selling prices only, safe to hand to a customer. */
export const getPriceList = (params) =>
  api.get('/reports/price-list', { params, responseType: 'blob' })
