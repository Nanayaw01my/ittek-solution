const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel, requirePage } = require('../middleware/rbac');
const { getDashboard, getProfitLoss, getBalanceSheet, getCashFlow } = require('../controllers/financialController');

router.use(authenticate, requirePage('financial'));

router.get('/dashboard', getDashboard);
router.get('/profit-loss', getProfitLoss);
router.get('/balance-sheet', getBalanceSheet);
router.get('/cash-flow', getCashFlow);

module.exports = router;
