const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getServiceCharges, createServiceCharge, deleteServiceCharge,
} = require('../controllers/serviceChargesController');

// Taking money for a job is till work, so anyone who can sell can record one.
router.use(authenticate, requireLevel(1));

router.get('/', getServiceCharges);
router.post('/', auditLog('CREATE_SERVICE_CHARGE', (req) => ({
  customer: req.body.customer_name, amount: req.body.amount,
})), createServiceCharge);

// Deleting removes the sale behind it, so it stays with CEO and above.
router.delete('/:id', requireLevel(3), auditLog('DELETE_SERVICE_CHARGE', (req) => ({
  id: req.params.id,
})), deleteServiceCharge);

module.exports = router;
