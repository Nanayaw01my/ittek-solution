const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const {
  getDailySales, getSalesByUser, getTopProducts, getProfitLoss,
  getDebtors, getStockValuation, getExpenseBreakdown, exportData,
} = require('../controllers/reportsController');

// Super Admin (4) and CEO (3) only
const adminOnly = [authenticate, requireLevel(3)];

router.use(adminOnly);

router.get('/daily-sales', getDailySales);
router.get('/sales-by-user', getSalesByUser);
router.get('/top-products', getTopProducts);
router.get('/profit-loss', getProfitLoss);
router.get('/debtors', getDebtors);
router.get('/stock-valuation', getStockValuation);
router.get('/expense-breakdown', getExpenseBreakdown);
router.get('/export/excel/:reportType', exportData);

module.exports = router;
