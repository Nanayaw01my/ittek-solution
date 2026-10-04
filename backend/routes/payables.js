const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getPayables, createPayable, payPayable, updatePayable, deletePayable,
} = require('../controllers/payablesController');

// What the shop owes, and paying it, is the owners' alone — CEO and Super
// Admin. Nobody else writes these down and nobody else settles them.
router.use(authenticate, requireLevel(3));

router.get('/', getPayables);
router.post('/', auditLog('CREATE_PAYABLE', (req) => ({
  supplier: req.body.supplier_name, amount: req.body.amount_owed,
})), createPayable);
router.post('/:id/pay', auditLog('PAY_PAYABLE', (req) => ({
  id: req.params.id, amount: req.body.amount,
})), payPayable);
router.put('/:id', auditLog('UPDATE_PAYABLE', (req) => ({ id: req.params.id })), updatePayable);
router.delete('/:id', auditLog('DELETE_PAYABLE', (req) => ({ id: req.params.id })), deletePayable);

module.exports = router;
