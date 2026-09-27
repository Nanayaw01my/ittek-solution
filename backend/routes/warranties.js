const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getWarranties, checkWarranty, linesFromSale, createWarranty, claimWarranty, deleteWarranty,
} = require('../controllers/warrantiesController');

// Checking a serial and registering one are counter work — the customer is
// standing there either way.
router.use(authenticate, requireLevel(1));

router.get('/', getWarranties);
router.get('/check/:serial', checkWarranty);
router.get('/from-sale/:invoice', linesFromSale);
router.post('/', auditLog('CREATE_WARRANTY', (req) => ({
  product: req.body.product_name, serial: req.body.serial_number,
})), createWarranty);
router.post('/:id/claim', auditLog('CLAIM_WARRANTY', (req) => ({
  id: req.params.id, outcome: req.body.outcome,
})), claimWarranty);

// Deleting erases the proof a customer is covered. Manager and above.
router.delete('/:id', requireLevel(2), auditLog('DELETE_WARRANTY', (req) => ({
  id: req.params.id,
})), deleteWarranty);

module.exports = router;
