const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel, requirePage } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getWorkerPayments, createWorkerPayment, getWorkerSummary, deleteWorkerPayment } = require('../controllers/workersController');

router.use(authenticate, requirePage('workers'));
const canEdit = requirePage('workers', 'full');

router.get('/summary', getWorkerSummary);
router.get('/', getWorkerPayments);

router.post(
  '/',
  canEdit,
  [
    body('worker_name').notEmpty().withMessage('Worker name is required.'),
    body('amount_paid').isNumeric({ min: 0.01 }).withMessage('Amount must be positive.'),
    body('payment_type').optional().isIn(['salary', 'commission'])
      .withMessage('A payment is either a salary or a commission.'),
    body('payment_method').optional().isIn(['cash', 'mobile_money', 'bank_transfer'])
      .withMessage('Choose how the money was paid.'),
  ],
  auditLog('CREATE_WORKER_PAYMENT', (req) => ({ worker: req.body.worker_name, amount: req.body.amount_paid })),
  createWorkerPayment
);

router.delete(
  '/:id',
  canEdit,
  auditLog('DELETE_WORKER_PAYMENT', (req) => ({ payment_id: req.params.id })),
  deleteWorkerPayment
);

module.exports = router;
