const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const { login, logout, getMe, changePassword, forgotPassword,
  badgeLogin,
} = require('../controllers/authController');

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username or email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  login
);

// Signing in by scanning a staff card. Open like /login, because the whole
// point is that nobody is signed in yet.
router.post('/badge-login', badgeLogin);

// POST /api/auth/logout
router.post('/logout', authenticate, auditLog('LOGOUT'), logout);

// GET /api/auth/me
router.get('/me', authenticate, getMe);

// PUT /api/auth/change-password
router.put(
  '/change-password',
  authenticate,
  [
    body('old_password').notEmpty().withMessage('Current password is required.'),
    body('new_password')
      .notEmpty().withMessage('New password is required.')
      .isLength({ min: 6 }).withMessage('New password must be at least 6 characters.'),
  ],
  auditLog('CHANGE_PASSWORD'),
  changePassword
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required.').normalizeEmail()],
  forgotPassword
);

module.exports = router;
