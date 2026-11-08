const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const {
  getNotifications, getUnreadCount, markRead, markAllRead, deleteNotification,
  sendMessage, getRecipients,
} = require('../controllers/notificationsController');

router.use(authenticate);

router.get('/unread-count', getUnreadCount);
// Owners writing to the staff. The role is checked in the controller, so
// the refusal can say who may do it rather than a bare 403.
router.get('/recipients', getRecipients);
router.post('/message', auditLog('SEND_STAFF_MESSAGE'), sendMessage);
router.get('/', getNotifications);
router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);
router.delete('/:id', deleteNotification);

module.exports = router;
