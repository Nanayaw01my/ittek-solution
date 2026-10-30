const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { salesByAspect, setProductAspect } = require('../controllers/aspectsController');

/**
 * Which side of the business the money came from.
 *
 * Owners only — level 3 — because it carries cost and profit alongside the
 * takings.
 */
router.use(authenticate, requireLevel(3));

router.get('/sales', salesByAspect);
router.put('/product/:id', auditLog('SET_PRODUCT_ASPECT'), setProductAspect);

module.exports = router;
