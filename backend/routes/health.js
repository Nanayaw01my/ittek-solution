const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { systemHealth, runJobsNow } = require('../controllers/healthController');

// It reports on backups, keys and credits, so it is the owners'.
router.use(authenticate, requireLevel(3));

router.get('/system', systemHealth);
router.post('/run-jobs', auditLog('RUN_JOBS_NOW'), runJobsNow);

module.exports = router;
