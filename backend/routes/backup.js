const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel, requireRoles } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { createManualBackup, getHistory, restoreBackup } = require('../controllers/backupController');

// CEO (3) and Super Admin (4)
router.use(authenticate, requireLevel(3));

router.post('/create', auditLog('CREATE_BACKUP'), createManualBackup);
router.get('/history', getHistory);

// Restore: Super Admin only
router.post(
  '/restore',
  requireRoles('Super Admin'),
  auditLog('RESTORE_BACKUP'),
  restoreBackup
);

module.exports = router;
