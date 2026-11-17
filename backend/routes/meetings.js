const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const {
  listMeetings, createMeeting, joinMeeting, leaveMeeting, endMeeting, updateMeeting,
} = require('../controllers/meetingsController');

router.use(authenticate);

router.get('/', listMeetings);
// Owner-only. The role is checked in the controller so the refusal can say
// who may call a meeting rather than answering a bare 403.
router.post('/', auditLog('CREATE_MEETING'), createMeeting);
router.put('/:id', auditLog('UPDATE_MEETING'), updateMeeting);
router.post('/:id/join', joinMeeting);
router.post('/:id/leave', leaveMeeting);
router.post('/:id/end', auditLog('END_MEETING'), endMeeting);

module.exports = router;
