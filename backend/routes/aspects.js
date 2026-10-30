const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  salesByAspect, setProductAspect, catalogue, autoSort,
} = require('../controllers/aspectsController');

/**
 * Which side of the business the money came from.
 *
 * Owners only — level 3 — because it carries cost and profit alongside the
 * takings.
 */
router.use(authenticate, requireLevel(3));

router.get('/sales', salesByAspect);

// What the system makes of the catalogue, and the button that writes it down.
router.get('/catalogue', catalogue);
router.post('/auto-sort', auditLog('AUTO_SORT_ASPECTS'), autoSort);
router.put('/product/:id', auditLog('SET_PRODUCT_ASPECT'), setProductAspect);

module.exports = router;
