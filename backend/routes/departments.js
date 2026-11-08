const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { myDepartments, claimProduct } = require('../controllers/departmentsController');

/**
 * A head of department runs one side of the shop. Level two — beside a
 * Manager — and which side is on the user rather than in the level, so two
 * heads are the same rank and different jobs.
 */
router.use(authenticate, requireLevel(2));

router.get('/mine', myDepartments);
router.put('/product/:id', auditLog('CLAIM_PRODUCT_DEPARTMENT'), claimProduct);

module.exports = router;
