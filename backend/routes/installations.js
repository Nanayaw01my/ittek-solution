const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getInstallations, createInstallation, updateInstallation, deleteInstallation,
} = require('../controllers/installationsController');

// Everybody signed in can see the book — but the controller shows a fitter
// only the jobs they are on, because a list of every customer's address is
// not something to hand out by default.
router.use(authenticate);

router.get('/', getInstallations);

// Booking, moving and deleting a job is the office's. Starting and finishing
// one is the fitter's, which the controller allows for whoever is on it.
router.post('/', requireLevel(2), auditLog('CREATE_INSTALLATION', (req) => ({
  customer: req.body.customer_name, location: req.body.location,
})), createInstallation);
router.put('/:id', auditLog('UPDATE_INSTALLATION', (req) => ({ id: req.params.id, status: req.body.status })), updateInstallation);
router.delete('/:id', requireLevel(3), auditLog('DELETE_INSTALLATION', (req) => ({ id: req.params.id })), deleteInstallation);

module.exports = router;
