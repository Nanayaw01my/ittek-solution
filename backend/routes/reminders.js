const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getReminders, createReminder, logSend, sendBySms, updateReminder, deleteReminder,
} = require('../controllers/remindersController');

// Chasing what a customer owes shows what every customer owes, so it sits
// with the manager and above, like the customer page it draws on.
router.use(authenticate, requireLevel(2));

router.get('/', getReminders);
router.post('/', auditLog('CREATE_REMINDER', (req) => ({
  customer: req.body.customer_name, about: req.body.about,
})), createReminder);
router.post('/send', auditLog('SEND_SMS'), sendBySms);
router.post('/sent', auditLog('SEND_REMINDER', (req) => ({
  customer: req.body.customer_name, channel: req.body.channel,
})), logSend);
router.put('/:id', updateReminder);
router.delete('/:id', auditLog('DELETE_REMINDER', (req) => ({ id: req.params.id })), deleteReminder);

module.exports = router;
