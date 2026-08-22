const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getRefunds, lookupSaleByInvoice, createRefund,
  approveRefund, rejectRefund, updateRefund, deleteRefund,
} = require('../controllers/refundsController');

// All authenticated users
router.get('/', authenticate, getRefunds);
router.get('/lookup/:invoiceNo', authenticate, lookupSaleByInvoice);
router.post(
  '/',
  authenticate,
  auditLog('CREATE_REFUND', (req) => ({ customer: req.body.customer_name, amount: req.body.refund_amount, invoice: req.body.invoice_ref })),
  createRefund
);

// Approval is what actually gives the money back and returns the stock, so it
// is CEO / Super Admin only.
router.put(
  '/:id/approve',
  authenticate,
  requireLevel(3),
  auditLog('APPROVE_REFUND', (req) => ({ refund_id: req.params.id })),
  approveRefund
);
router.put(
  '/:id/reject',
  authenticate,
  requireLevel(3),
  auditLog('REJECT_REFUND', (req) => ({ refund_id: req.params.id })),
  rejectRefund
);

// CEO / Super Admin only
router.put(
  '/:id',
  authenticate,
  requireLevel(3),
  auditLog('UPDATE_REFUND', (req) => ({ refund_id: req.params.id })),
  updateRefund
);
router.delete(
  '/:id',
  authenticate,
  requireLevel(3),
  auditLog('DELETE_REFUND', (req) => ({ refund_id: req.params.id })),
  deleteRefund
);

module.exports = router;
