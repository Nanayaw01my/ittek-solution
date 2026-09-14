const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

/**
 * POST /api/upload?folder=products|avatars|logo
 */
/**
 * Uploading is a Manager job, with one exception: the Ghana card photographs
 * that go with a credit application. Anyone who can take an application has to
 * be able to attach the cards, or the application is worthless — so the `kyc`
 * folder is open to any signed-in user. It is write-only for them in practice:
 * the photographs come back only to a CEO or Super Admin.
 */
const canUpload = (req, res, next) => {
  if (req.query.folder === 'kyc') return next();
  return requireLevel(2)(req, res, next);
};

router.post('/', authenticate, canUpload, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image provided.' });
    }

    // Named plainly. Without this the request fails deep inside the Cloudinary
    // client and comes back as "Image upload failed", which sends people
    // hunting through the browser for a fault that is in the server's
    // environment.
    const missing = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
      .filter((key) => !process.env[key]);
    if (missing.length) {
      console.error('Upload attempted with Cloudinary unconfigured. Missing:', missing.join(', '));
      return res.status(503).json({
        success: false,
        message: `Image uploads are not configured on the server (missing ${missing.join(', ')}). `
          + 'Set those and redeploy.',
      });
    }

    const folder = `ittek/${req.query.folder || 'general'}`;

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
        (err, data) => (err ? reject(err) : resolve(data))
      ).end(req.file.buffer);
    });

    return res.status(200).json({ success: true, data: { url: result.secure_url } });
  } catch (err) {
    // The real reason, both in the log and on screen. Cloudinary's messages
    // are specific — a wrong key, a rejected file — and hiding them behind
    // "Image upload failed" leaves nothing to act on.
    console.error('Upload error:', err.stack || err.message);
    return res.status(500).json({
      success: false,
      message: `Image upload failed: ${err.message || 'unknown error'}`,
    });
  }
});

module.exports = router;
