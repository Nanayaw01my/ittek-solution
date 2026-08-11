const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const { getAlerts, reviewAlert, runScan } = require('../controllers/fraudController');

router.use(authenticate);

// Alerts are about staff conduct — never visible to the Sales role.
router.use((req, res, next) => {
  const allowed = ['Manager', 'CEO', 'Super Admin'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Manager access required.' });
  }
  next();
});

router.get('/alerts', getAlerts);
router.patch('/alerts/:id', auditLog('REVIEW_FRAUD_ALERT'), reviewAlert);
router.post('/scan', runScan);

module.exports = router;
