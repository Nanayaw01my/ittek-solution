const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getQuotations, getQuotation, createQuotation, updateQuotation,
  acceptQuotation, deleteQuotation,
} = require('../controllers/quotationsController');

// Quoting is selling — anyone at the counter can price a job up.
router.use(authenticate, requireLevel(1));

router.get('/', getQuotations);
router.get('/:id', getQuotation);
router.post('/', auditLog('CREATE_QUOTATION', (req) => ({
  customer: req.body.customer_name,
})), createQuotation);
router.put('/:id', auditLog('UPDATE_QUOTATION', (req) => ({ id: req.params.id })), updateQuotation);

// Accepting moves stock and writes a sale, so it is logged like one.
router.post('/:id/accept', auditLog('ACCEPT_QUOTATION', (req) => ({
  id: req.params.id, method: req.body.payment_method,
})), acceptQuotation);

router.delete('/:id', requireLevel(2), auditLog('DELETE_QUOTATION', (req) => ({
  id: req.params.id,
})), deleteQuotation);

module.exports = router;
