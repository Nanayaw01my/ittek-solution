const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getTypes, listRecords, deleteRecords } = require('../controllers/dataAdminController');

// Owners only, and deliberately not grantable through the page-access system:
// this screen removes business records for good.
router.use(authenticate, requireLevel(3));

router.get('/types', getTypes);
router.get('/:type', listRecords);
router.post(
  '/:type/delete',
  auditLog('DELETE_RECORDS', (req) => ({ type: req.params.type, count: (req.body.ids || []).length })),
  deleteRecords
);

module.exports = router;
