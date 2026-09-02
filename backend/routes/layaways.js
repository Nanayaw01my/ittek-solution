const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const {
  createLayaway, getLayaways, getLayaway, addPayment, collectLayaway, cancelLayaway, getLayawayAgreement,
} = require('../controllers/layawayController');

router.use(authenticate);

const requireManager = (req, res, next) => {
  const allowed = ['Manager', 'CEO', 'Super Admin'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Manager access required.' });
  }
  next();
};

// Taking a Pay & Pick Later at the counter is part of selling, so this one
// stays open to Sales — it is reached from the POS, not from the Layaways
// screen, and blocking it would stop the till taking the deposit.
router.post('/', auditLog('CREATE_LAYAWAY'), createLayaway);

// Everything else is the Layaways screen: the book of who owes what against
// goods held in the back. That is a manager's to read and to act on.
router.get('/', requireManager, getLayaways);
router.get('/:id', requireManager, getLayaway);
router.get('/:id/agreement', requireManager, getLayawayAgreement);
router.post('/:id/payments', requireManager, auditLog('LAYAWAY_PAYMENT'), addPayment);
router.post('/:id/collect', requireManager, auditLog('LAYAWAY_COLLECT'), collectLayaway);
// Cancelling returns stock and voids a customer commitment — manager call.
router.post('/:id/cancel', requireManager, auditLog('LAYAWAY_CANCEL'), cancelLayaway);

module.exports = router;
