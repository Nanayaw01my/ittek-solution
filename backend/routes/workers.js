const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getWorkerPayments, createWorkerPayment, getWorkerSummary, deleteWorkerPayment } = require('../controllers/workersController');

const adminOnly = [authenticate, requireLevel(3)];

router.use(adminOnly);

router.get('/summary', getWorkerSummary);
router.get('/', getWorkerPayments);

router.post(
  '/',
  [
    body('worker_name').notEmpty().withMessage('Worker name is required.'),
    body('amount_paid').isNumeric({ min: 0.01 }).withMessage('Amount must be positive.'),
  ],
  auditLog('CREATE_WORKER_PAYMENT', (req) => ({ worker: req.body.worker_name, amount: req.body.amount_paid })),
  createWorkerPayment
);

router.delete(
  '/:id',
  auditLog('DELETE_WORKER_PAYMENT', (req) => ({ payment_id: req.params.id })),
  deleteWorkerPayment
);

module.exports = router;
