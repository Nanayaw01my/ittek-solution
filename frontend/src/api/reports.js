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
// Any report as a printable A4 PDF. The spreadsheet export this replaces was
// broken at both ends: the path did not exist, and the handler behind it
// returned JSON rather than a workbook.
export const exportReportPdf = (type, params) =>
  api.get(`/reports/export/pdf/${type}`, { params, responseType: 'blob' })

/** Printable price list — selling prices only, safe to hand to a customer. */
export const getPriceList = (params) =>
  api.get('/reports/price-list', { params, responseType: 'blob' })
