const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getApprovals, createApproval, approve, reject, remove,
} = require('../controllers/receiptApprovalsController');

// Whoever can write a packages receipt can send one up for approval.
router.use(authenticate, requireLevel(2));

router.get('/', getApprovals);
router.post('/', auditLog('REQUEST_RECEIPT_APPROVAL', (req) => ({
  total: req.body?.payload?.grandTotal,
})), createApproval);

// Agreeing that money and stock may move is the CEO's decision.
const ownersOnly = requireLevel(3);
router.put('/:id/approve', ownersOnly, auditLog('APPROVE_RECEIPT', (req) => ({ id: req.params.id })), approve);
router.put('/:id/reject', ownersOnly, auditLog('REJECT_RECEIPT', (req) => ({ id: req.params.id })), reject);

router.delete('/:id', auditLog('DELETE_RECEIPT_APPROVAL', (req) => ({ id: req.params.id })), remove);

module.exports = router;
