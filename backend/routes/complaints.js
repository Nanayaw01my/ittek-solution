const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getComplaints, createComplaint, resolveComplaint } = require('../controllers/complaintsController');

/**
 * Anybody may raise one. Whoever heard the complaint is the person who
 * should write it down, and that is usually whoever was at the counter.
 */
router.use(authenticate, requireLevel(1));

router.get('/', getComplaints);
router.post('/', auditLog('RAISE_COMPLAINT'), createComplaint);
router.put('/:id/resolve', auditLog('RESOLVE_COMPLAINT'), resolveComplaint);

module.exports = router;
