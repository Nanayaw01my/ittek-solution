const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { getAuditLogs } = require('../controllers/auditLogsController');

// CEO (3) and Super Admin (4)
router.use(authenticate, requireLevel(3));

router.get('/', getAuditLogs);

module.exports = router;
