const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { requireLevel, requireRoles } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const { getSettings, updateSettings, updateEmailConfig, uploadLogo, clearAllData } = require('../controllers/settingsController');

// Logo upload — memory storage, then straight to Cloudinary.
// Disk storage would be worse than useless here: Render's filesystem is
// ephemeral (the file vanishes on the next restart) and Vercel's is read-only.
const upload = multer({
  storage: multer.memoryStorage(),
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
