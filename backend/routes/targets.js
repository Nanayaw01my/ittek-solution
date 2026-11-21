const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const { listTargets, setTarget, pushTarget } = require('../controllers/targetsController');

/**
 * The push endpoint, which is the only route here with no login.
 *
 * It is mounted BEFORE authenticate, because the caller is a machine
 * holding a shared key rather than a person holding a session. The key
 * is checked in the controller, which also refuses the whole route when
 * no key is configured.
 *
 * Rate limited on its own: an endpoint reachable without a login is the
 * one somebody will eventually point a script at, and the limit is what
 * stops a guessing attempt becoming a thousand guesses a second.
 */
router.post(
  '/push',
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many pushes. Try again in a minute.' },
  }),
  express.json({ limit: '64kb' }),
  pushTarget
);

// Everything below is for people, and the role is checked in the
// controller so the refusal can name who may look.
router.use(authenticate);

router.get('/', listTargets);
router.put('/', auditLog('SET_TARGET'), setTarget);

module.exports = router;
