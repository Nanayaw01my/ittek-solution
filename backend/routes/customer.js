const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getDashboard,
  getPayments,
  makePayment,
  getProfile,
} = require('../controllers/customerController');

// Apply authentication and customer authorization to all routes
router.use(authenticate, authorize('customer'));

/**
 * GET /api/customer/dashboard
 * Customer dashboard: plan, device, next payment, progress.
 */
router.get('/dashboard', getDashboard);

/**
 * GET /api/customer/payments
 * Full payment history.
 */
router.get('/payments', getPayments);

/**
 * POST /api/customer/payment
 * Initialize a Paystack payment.
 */
router.post(
  '/payment',
  [
    body('amount')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be greater than 0.'),
  ],
  makePayment
);

/**
 * GET /api/customer/profile
 * Customer profile with photos.
 */
router.get('/profile', getProfile);

module.exports = router;
