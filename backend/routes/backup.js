const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel, requireRoles } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  createManualBackup, getSummary, getHistory, restoreBackup, getCloudBackups,
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

// Restore: Super Admin only. It empties the database and writes the file over
// the top of it.
router.post(
  '/restore',
  requireRoles('Super Admin'),
  auditLog('RESTORE_BACKUP'),
  restoreBackup
);

module.exports = router;
