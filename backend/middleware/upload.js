const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Disk storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter: allow jpeg, jpg, png, pdf
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  const allowedExtensions = ['.jpeg', '.jpg', '.png', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        `Invalid file type. Only JPEG, JPG, PNG, and PDF files are allowed. Got: ${file.mimetype}`
      ),
      false
    );
  }
};

const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5MB default

const multerConfig = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize,
  },
});

// Export individual upload handlers
const uploadPhoto = multerConfig.single('photo');
const uploadFile = multerConfig.single('file');

// Multiple photos upload (for customer registration)
const uploadMultiplePhotos = multerConfig.fields([
  { name: 'ghana_card_front', maxCount: 1 },
  { name: 'ghana_card_back', maxCount: 1 },
  { name: 'customer_photo', maxCount: 1 },
  { name: 'guarantor_photo', maxCount: 1 },
  { name: 'proof_of_income', maxCount: 1 },
]);

// Error handler middleware for multer errors
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${maxFileSize / (1024 * 1024)}MB.`,
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error.',
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Unknown upload error.',
    });
  }

  next();
};

module.exports = { uploadPhoto, uploadFile, uploadMultiplePhotos, handleUploadError };
