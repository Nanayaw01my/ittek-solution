const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getDamagedGoods, createDamagedGood, updateDamagedGood, deleteDamagedGood,
} = require('../controllers/damagedGoodsController');

// Whoever finds the broken thing should be able to write it down, so this is
// counter work like any other. It moves stock, so the audit log keeps a note.
router.use(authenticate, requireLevel(1));

router.get('/', getDamagedGoods);
router.post('/', auditLog('CREATE_DAMAGED_GOOD', (req) => ({
  product: req.body.product_name, quantity: req.body.quantity,
})), createDamagedGood);

// Saying what became of it can put goods back on the shelf, and deleting a
// record certainly does, so both stay with a manager and above.
router.put('/:id', requireLevel(2), auditLog('UPDATE_DAMAGED_GOOD', (req) => ({
  id: req.params.id, outcome: req.body.outcome,
})), updateDamagedGood);

router.delete('/:id', requireLevel(2), auditLog('DELETE_DAMAGED_GOOD', (req) => ({
  id: req.params.id,
})), deleteDamagedGood);

module.exports = router;
