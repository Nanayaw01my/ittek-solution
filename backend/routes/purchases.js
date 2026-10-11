const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel, requirePage } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getPurchases, createPurchase, getPurchase, deletePurchase, pricePurchase } = require('../controllers/purchasesController');

// Viewing is grantable; anything that writes needs the page in full.
router.use(authenticate, requirePage('purchases'));
const canEdit = requirePage('purchases', 'full');

router.get('/', getPurchases);

router.post(
  '/',
  canEdit,
  [
    body('items').isArray({ min: 1 }).withMessage('Purchase must have at least one item.'),
  ],
  auditLog('CREATE_PURCHASE', (req) => ({ total_amount: req.body.total_amount, items_count: req.body.items?.length })),
  createPurchase
);

router.get('/:id', getPurchase);

// Putting a cost on stock a manager received. Owners only: this figure is
// what every profit number in the system is worked out from.
router.put(
  '/:id/costs',
  requireLevel(3),
  auditLog('PRICE_PURCHASE', (req) => ({ purchase_id: req.params.id })),
  pricePurchase
);

router.delete(
  '/:id',
  canEdit,
  auditLog('DELETE_PURCHASE', (req) => ({ purchase_id: req.params.id })),
  deletePurchase
);

module.exports = router;
