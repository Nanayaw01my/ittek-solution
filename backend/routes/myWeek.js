const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { getMyWeek } = require('../controllers/myWeekController');

/**
 * Everybody's own week. It reports the person asking and nobody else, so
 * there is nothing here to gate above level one.
 */
router.use(authenticate, requireLevel(1));
router.get('/', getMyWeek);

module.exports = router;
