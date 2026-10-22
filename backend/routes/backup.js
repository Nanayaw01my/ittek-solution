const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel, requireRoles } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  createManualBackup, getSummary, getHistory, restoreBackup, getCloudBackups,
  emailBackupNow, backupOffsiteNow,
} = require('../controllers/backupController');

// CEO (3) and Super Admin (4)
router.use(authenticate, requireLevel(3));

router.post('/create', auditLog('CREATE_BACKUP'), createManualBackup);
// The screen used to ask for this with GET against a POST route, so every
// attempt to back up returned 404 and nothing was ever saved. Both verbs are
// accepted now — taking a copy of your own data is not a dangerous request.
router.get('/create', auditLog('CREATE_BACKUP'), createManualBackup);

router.get('/summary', getSummary);
router.get('/history', getHistory);
// The copies that are off this machine. The disk-based history above is
// erased by every deploy; these are not.
router.get('/cloud', getCloudBackups);

// Send one to an inbox now, rather than waiting until 2am to find out
// whether the mail settings work.
router.post('/email', auditLog('EMAIL_BACKUP'), emailBackupNow);
// And the copy that does not depend on mail working at all.
router.post('/offsite', auditLog('OFFSITE_BACKUP'), backupOffsiteNow);

// Restore: Super Admin only. It empties the database and writes the file over
// the top of it.
router.post(
  '/restore',
  requireRoles('Super Admin'),
  auditLog('RESTORE_BACKUP'),
  restoreBackup
);

module.exports = router;
