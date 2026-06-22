const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getDebts, getDebt, getDebtSummary, recordPayment, sendReminder, sendAllReminders, deleteDebt } = require('../controllers/debtsController');

// Manager (2) and above
const managerPlus = [authenticate, requireLevel(2)];

router.use(managerPlus);

router.get('/summary', getDebtSummary);
router.get('/', getDebts);
router.get('/:id', getDebt);

router.post(
  '/:id/payment',
  [
    body('amount').isNumeric({ min: 0.01 }).withMessage('Payment amount must be positive.'),
    body('payment_method').optional().isIn(['cash', 'card', 'mobile_money']),
  ],
  auditLog('DEBT_PAYMENT', (req) => ({ debt_id: req.params.id, amount: req.body.amount })),
  recordPayment
);

// SMS reminder routes (Manager+ can send)
router.post(
  '/remind-all',
  auditLog('DEBT_REMIND_ALL', () => ({})),
  sendAllReminders
);

router.post(
  '/:id/remind',
  auditLog('DEBT_REMIND', (req) => ({ debt_id: req.params.id })),
  sendReminder
);

router.delete(
  '/:id',
  auditLog('DELETE_DEBT', (req) => ({ debt_id: req.params.id })),
  deleteDebt
);

module.exports = router;
