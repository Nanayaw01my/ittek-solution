const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const { getAlerts, reviewAlert, runScan } = require('../controllers/fraudController');

router.use(authenticate);

// Alerts accuse named members of staff of misconduct. That is the owners'
// business alone — a Manager who is themselves the subject of an alert must
// not be able to read it, so the line is drawn above them.
router.use((req, res, next) => {
  const allowed = ['CEO', 'Super Admin'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  next();
});

router.get('/alerts', getAlerts);
router.patch('/alerts/:id', auditLog('REVIEW_FRAUD_ALERT'), reviewAlert);
router.post('/scan', runScan);

module.exports = router;
