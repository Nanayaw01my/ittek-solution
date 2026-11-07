const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { getOverview } = require('../controllers/directorController');

/**
 * The owners' screen. Level 3 is CEO, COO, Managing Director and above —
 * the people whose decisions the "Needs you" queue is waiting for.
 */
router.use(authenticate, requireLevel(3));
router.get('/overview', getOverview);

module.exports = router;
