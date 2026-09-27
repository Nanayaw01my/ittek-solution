const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getDayReckoning, getCashUps, closeDay, reopenDay,
} = require('../controllers/cashUpController');

// Counting the drawer is a supervisor's job, not the counter's: the point is
// that somebody other than whoever took the money checks it.
router.use(authenticate, requireLevel(2));

router.get('/', getCashUps);
router.get('/today', getDayReckoning);
router.post('/', auditLog('CLOSE_DAY', (req) => ({
  date: req.body.date, counted: req.body.counted,
})), closeDay);

// Reopening erases a count that has been signed off, so it stays with the CEO.
router.delete('/:id', requireLevel(3), auditLog('REOPEN_DAY', (req) => ({
  id: req.params.id,
})), reopenDay);

module.exports = router;
