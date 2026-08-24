const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel, requirePage } = require('../middleware/rbac');
const {
  getDashboardStats,
  getPriceList, getSalesTrend,
  getDailySales, getSalesByUser, getTopProducts, getProfitLoss,
  getDebtors, getStockValuation, getExpenseBreakdown, exportData,
  getFinancialOverview, getCashFlow,
} = require('../controllers/reportsController');

// All authenticated users can access dashboard stats
router.get('/dashboard-stats', authenticate, getDashboardStats);
// Whole-shop takings over time — owners only. The dashboard already asks for
// it only at CEO level; this is the matching check on the server.
router.get('/sales-trend', authenticate, requireLevel(3), getSalesTrend);

// Price list carries selling prices only — no cost or margin — so any signed-in
// staff member can print one for a customer without needing admin rights.
router.get('/price-list', authenticate, getPriceList);

// Super Admin (4) and CEO (3) only
// Reading a report can be granted to an individual user by the CEO.
router.use(authenticate, requirePage('reports'));

router.get('/daily-sales', getDailySales);
router.get('/sales-by-user', getSalesByUser);
router.get('/top-products', getTopProducts);
router.get('/profit-loss', getProfitLoss);
router.get('/debtors', getDebtors);
router.get('/stock-valuation', getStockValuation);
router.get('/expense-breakdown', getExpenseBreakdown);
// These two back the Financial page, which is granted separately.
router.get('/financial-overview', requirePage('financial'), getFinancialOverview);
router.get('/cash-flow', requirePage('financial'), getCashFlow);
router.get('/export/excel/:reportType', exportData);

module.exports = router;
