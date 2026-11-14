const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  listShowcase, createShowcase, updateShowcase, deleteShowcase,
} = require('../controllers/showcaseController');

/**
 * The shop's own work, as managed rather than as displayed.
 *
 * Reading this list is not the board's job — the board gets its slides
 * inside the one call it already makes, so a television fetches once a
 * minute rather than twice. These are the management routes, and they
 * are a Manager's: choosing what the shop shows the street is a
 * decision about the shop's face, not a counter task.
 */
router.use(authenticate, requireLevel(2));

router.get('/', listShowcase);
router.post('/', auditLog('ADD_SHOWCASE'), createShowcase);
router.put('/:id', auditLog('EDIT_SHOWCASE'), updateShowcase);
// Deleting takes the file off Cloudinary too, so it is worth a line in
// the audit log: it is the only action here that cannot be undone.
router.delete('/:id', auditLog('DELETE_SHOWCASE'), deleteShowcase);

module.exports = router;
