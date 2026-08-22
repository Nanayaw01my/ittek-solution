const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel, requirePage } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getPurchases, createPurchase, getPurchase, deletePurchase } = require('../controllers/purchasesController');

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

router.delete(
  '/:id',
  canEdit,
  auditLog('DELETE_PURCHASE', (req) => ({ purchase_id: req.params.id })),
  deletePurchase
);

module.exports = router;
