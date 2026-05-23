const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const {
  login,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('../controllers/authController');

/**
 * POST /api/auth/login
 * Login with email/account_number/staff_id + password
 */
router.post(
  '/login',
  [
    body('password')
      .notEmpty()
      .withMessage('Password is required.'),
  ],
  login
);

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, logout);

/**
 * POST /api/auth/forgot-password
 */
router.post(
  '/forgot-password',
  [
    body('email')
      .isEmail()
      .withMessage('A valid email address is required.')
      .normalizeEmail(),
  ],
  forgotPassword
);

/**
 * POST /api/auth/reset-password
 */
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required.'),
    body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('New password is required.')
      .isLength({ min: 1 })
      .withMessage('Password must be at least 1 character.'),
  ],
  resetPassword
);

/**
 * POST /api/auth/change-password
 * Authenticated user changes their own password.
 */
router.post(
  '/change-password',
  authenticate,
  [
    body('current_password').notEmpty().withMessage('Current password is required.'),
    body('new_password')
      .notEmpty()
      .withMessage('New password is required.')
      .isLength({ min: 1 })
      .withMessage('New password must be at least 1 character.'),
  ],
  changePassword
);

module.exports = router;
