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
/**
 * Level two, or a sales attendant.
 *
 * Counting the till at the end of the day is the job of whoever stood
 * behind it, which is the one person the level shuts out. Named rather
 * than lowering the level, so an Engineer or a Field Agent does not come
 * in with them.
 */
router.use(authenticate, (req, res, next) => {
  if (req.user.role === 'Sales') return next();
  return requireLevel(2)(req, res, next);
});

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
