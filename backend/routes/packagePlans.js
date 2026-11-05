const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getPackagePlans, getCatalogue, createPackagePlan, getPackagePlan,
  recordPayment, cancelPackagePlan,
} = require('../controllers/packagePlansController');

/**
 * Any member of staff may take a payment.
 *
 * The person a customer hands a monthly instalment to is whoever is behind
 * the counter that morning, and a payment nobody is allowed to record is a
 * payment that gets written on a scrap of paper. Cancelling a plan is the
 * exception and is checked in the controller, because it is a decision about
 * an agreement rather than about money arriving.
 */
router.use(authenticate, requireLevel(1));

router.get('/', getPackagePlans);
router.get('/catalogue', getCatalogue);
router.post('/', auditLog('CREATE_PACKAGE_PLAN'), createPackagePlan);
router.get('/:id', getPackagePlan);
router.post('/:id/payments', auditLog('PACKAGE_PLAN_PAYMENT'), recordPayment);
router.delete('/:id', auditLog('CANCEL_PACKAGE_PLAN'), cancelPackagePlan);

module.exports = router;
