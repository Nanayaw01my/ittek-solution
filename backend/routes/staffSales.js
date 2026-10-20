const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { getSummary, getSales, getTrail } = require('../controllers/staffSalesController');

/**
 * Who sold what, to whom, at what discount.
 *
 * Owners only — level 3, which is CEO, COO and Super Admin. It is a screen
 * about staff conduct and it carries cost-adjacent figures, so it sits with
 * the rest of the money rather than with the shop floor.
 */
router.use(authenticate, requireLevel(3));

router.get('/summary', getSummary);
router.get('/sales', getSales);
router.get('/sale/:id', getTrail);

module.exports = router;
