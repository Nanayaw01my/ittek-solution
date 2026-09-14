const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getPhoneSales, getPhoneSale, createPhoneSale, approvePhoneSale, rejectPhoneSale,
  deletePhoneSale,
} = require('../controllers/phoneSalesController');

router.use(authenticate);

// Anyone signed in may take an application, including a field agent standing
// in front of the customer. The controller decides how much of one they get
// back: their own, without the customer's details.
router.get('/', getPhoneSales);
router.get('/:id', getPhoneSale);
router.post('/', auditLog('CREATE_PHONE_SALE', (req) => ({ customer: req.body.customer_name })), createPhoneSale);

// Approving is the whole control. Nothing is sold on credit until an owner has
// read the paperwork and agreed to it, so it stays with the two of them.
const ownersOnly = requireRoles('CEO', 'Super Admin');
router.put('/:id/approve', ownersOnly, auditLog('APPROVE_PHONE_SALE', (req) => ({ id: req.params.id })), approvePhoneSale);
router.put('/:id/reject', ownersOnly, auditLog('REJECT_PHONE_SALE', (req) => ({ id: req.params.id })), rejectPhoneSale);

// Deleting takes the customer's details with it, so it stays with the two
// who can see them. The audit log keeps a note that it happened.
router.delete('/:id', ownersOnly, auditLog('DELETE_PHONE_SALE', (req) => ({ id: req.params.id })), deletePhoneSale);

module.exports = router;
