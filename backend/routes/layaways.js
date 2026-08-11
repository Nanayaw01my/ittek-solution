const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const {
  createLayaway, getLayaways, getLayaway, addPayment, collectLayaway, cancelLayaway,
} = require('../controllers/layawayController');

router.use(authenticate);

const requireManager = (req, res, next) => {
  const allowed = ['Manager', 'CEO', 'Super Admin'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Manager access required.' });
  }
  next();
};

router.post('/', auditLog('CREATE_LAYAWAY'), createLayaway);
router.get('/', getLayaways);
router.get('/:id', getLayaway);
router.post('/:id/payments', auditLog('LAYAWAY_PAYMENT'), addPayment);
router.post('/:id/collect', auditLog('LAYAWAY_COLLECT'), collectLayaway);
// Cancelling returns stock and voids a customer commitment — manager call.
router.post('/:id/cancel', requireManager, auditLog('LAYAWAY_CANCEL'), cancelLayaway);

module.exports = router;
