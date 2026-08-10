const express = require('express');
const router = express.Router();
const { getPublicReceipt } = require('../controllers/publicReceiptController');

// Deliberately NOT behind `authenticate` — this is what the receipt QR opens.
router.get('/receipt/:token', getPublicReceipt);

module.exports = router;
