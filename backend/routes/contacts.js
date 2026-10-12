const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getContacts, getContactsSummary, createContact, updateContact, backfillContacts,
} = require('../controllers/contactsController');

// The book holds every customer's number, so it sits with the manager and
// above, like the reminders that draw on it.
router.use(authenticate, requireLevel(2));

router.get('/', getContacts);
router.get('/summary', getContactsSummary);

// Adding somebody the till never saw.
router.post(
  '/',
  auditLog('CREATE_CONTACT', (req) => ({ phone: req.body.phone, name: req.body.name })),
  createContact
);
router.put('/:id', auditLog('UPDATE_CONTACT', (req) => ({ id: req.params.id })), updateContact);

// Gathering a year of past sales into the book changes the whole list, so it
// is owner-level.
router.post('/backfill', requireLevel(3), auditLog('BACKFILL_CONTACTS'), backfillContacts);

module.exports = router;
