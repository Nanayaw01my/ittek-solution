const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { requireLevel, requireRoles } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getSettings, updateSettings, updateEmailConfig, uploadLogo, clearAllData, getPublicSettings } = require('../controllers/settingsController');

// Public route — no auth required
router.get('/public', getPublicSettings);

// Logo upload multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_PATH || './uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed.'));
    }
  },
});

const adminOnly = [authenticate, requireLevel(3)];

router.get('/', adminOnly, getSettings);
router.put('/', adminOnly, auditLog('UPDATE_SETTINGS'), updateSettings);
router.put('/email', authenticate, requireRoles('Super Admin'), auditLog('UPDATE_EMAIL_CONFIG'), updateEmailConfig);
router.post('/logo', adminOnly, upload.single('logo'), auditLog('UPLOAD_LOGO'), uploadLogo);
router.delete('/clear-data', authenticate, requireRoles('Super Admin'), auditLog('CLEAR_ALL_DATA'), clearAllData);

module.exports = router;
