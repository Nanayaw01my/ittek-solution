const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  systemHealth, runJobsNow, creditSalesGap, repairCreditSales,
} = require('../controllers/healthController');

// It reports on backups, keys and credits, so it is the owners'.
router.use(authenticate, requireLevel(3));

router.get('/system', systemHealth);
router.post('/run-jobs', auditLog('RUN_JOBS_NOW'), runJobsNow);

// Credit agreement payments that never reached the sales book, and the
// repair for them. Writing money into the shop's figures is audited.
router.get('/credit-sales-gap', creditSalesGap);
router.post(
  '/credit-sales-gap/repair',
  auditLog('REPAIR_CREDIT_SALES', (req) => ({
    today: !!req.body?.today, all: !!req.body?.all, keys: (req.body?.keys || []).length,
  })),
  repairCreditSales
);

module.exports = router;
