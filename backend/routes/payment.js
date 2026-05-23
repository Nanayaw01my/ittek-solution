const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const {
  initializePayment,
  verifyPayment,
} = require('../controllers/paymentController');

/**
 * POST /api/payment/initialize
 * Initialize a Paystack payment for an installment.
 * Authenticated (any role).
 */
router.post(
  '/initialize',
  authenticate,
  [
    body('amount')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be greater than 0.'),
  ],
  initializePayment
);

/**
 * GET /api/payment/verify/:reference
 * Verify a Paystack payment by reference and record it.
 * Authenticated (any role).
 */
router.get(
  '/verify/:reference',
  authenticate,
  [
    param('reference').notEmpty().withMessage('Payment reference is required.'),
  ],
  verifyPayment
);

module.exports = router;
