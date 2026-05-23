const express = require('express');
const router = express.Router();
const { paystackWebhook } = require('../controllers/paymentController');

/**
 * POST /api/webhooks/paystack
 * Paystack webhook endpoint.
 * No authentication required — signature verification is done in the controller.
 * Raw body is needed for HMAC signature verification, handled by express.json() in server.js.
 */
router.post('/paystack', paystackWebhook);

module.exports = router;
