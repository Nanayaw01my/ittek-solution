const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');

/**
 * Films of the shop's work, as well as photographs.
 *
 * Only for the showcase folder, and only up to 60MB. A wall screen has
 * to fetch whatever is uploaded here over the shop's own connection, so
 * the limit is as much about what a board can play without stalling as
 * about what Cloudinary will take. Everything else stays at 5MB and
 * images only: nobody needs to attach a film to a product.
 */
const IMAGE_TYPES = /^image\/(jpeg|jpg|png|webp|gif)$/;
const VIDEO_TYPES = /^video\/(mp4|quicktime|webm|x-m4v)$/;
const isShowcase = (req) => req.query.folder === 'showcase';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES.test(file.mimetype)) return cb(null, true);
    if (isShowcase(req) && VIDEO_TYPES.test(file.mimetype)) return cb(null, true);
    return cb(new Error(isShowcase(req)
      ? 'Photos (JPG, PNG, WEBP) and videos (MP4, MOV, WEBM) only'
      : 'Only image files are allowed'), false);
  },
});

/**
 * The size limit, enforced per folder after multer has the file.
 *
 * multer takes one limit for the whole route, so it is set at the
 * largest a showcase video may be and the smaller limit for everything
 * else is applied here. Otherwise raising it for films would quietly
 * raise it for product photographs too, and a 50MB picture on the till
 * is a till that stops.
 */
const MAX_OTHER = 5 * 1024 * 1024;

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

    if (!isShowcase(req) && req.file.size > MAX_OTHER) {
      return res.status(400).json({
        success: false,
        message: 'That image is over 5MB. Use a smaller one.',
      });
    }

    const folder = `ittek/${req.query.folder || 'general'}`;
    const isVideo = VIDEO_TYPES.test(req.file.mimetype);

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        isVideo
          // No transformation list for a film: asking Cloudinary to
          // re-encode on upload makes the request wait for the encode,
          // and a two-minute upload that times out looks to the person
          // uploading exactly like a rejected file.
          ? { folder, resource_type: 'video' }
          : { folder, resource_type: 'image', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
        (err, data) => (err ? reject(err) : resolve(data))
      ).end(req.file.buffer);
    });

    return res.status(200).json({
      success: true,
      data: {
        url: result.secure_url,
        public_id: result.public_id,
        bytes: result.bytes,
        kind: isVideo ? 'video' : 'image',
        /**
         * A still for the video, built by asking Cloudinary for the same
         * asset as a jpg. Without one the board shows a black rectangle
         * while the film arrives, which on a shop wall reads as a screen
         * that has died.
         */
        poster_url: isVideo
          ? result.secure_url.replace(/\.(mp4|mov|webm|m4v)$/i, '.jpg')
          : undefined,
      },
    });
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
