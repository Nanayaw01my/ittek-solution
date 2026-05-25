const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getNotifications, getUnreadCount, markRead, markAllRead, deleteNotification,
} = require('../controllers/notificationsController');

router.use(authenticate);

router.get('/unread-count', getUnreadCount);
router.get('/', getNotifications);
router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);
router.delete('/:id', deleteNotification);

module.exports = router;
