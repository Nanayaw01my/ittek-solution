const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const { lookup, listAccounts, getAccount, adjustPoints } = require('../controllers/loyaltyController');

router.use(authenticate);

// Manager+ only — adjusting points is effectively handing out money.
const requireManager = (req, res, next) => {
  const allowed = ['Manager', 'CEO', 'Super Admin'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Manager access required.' });
  }
  next();
};

router.get('/lookup', lookup);            // any till user, during a sale
router.get('/accounts', listAccounts);
router.get('/accounts/:id', getAccount);
router.post('/accounts/:id/adjust', requireManager, auditLog('ADJUST_LOYALTY_POINTS'), adjustPoints);

module.exports = router;
