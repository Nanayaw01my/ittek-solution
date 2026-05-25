const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const {
  processSale, processShortPayment, getSales, getTodaySales, getSale, generateSaleReceipt,
} = require('../controllers/posController');

// All authenticated roles can access POS
router.use(authenticate);

router.post(
  '/sale',
  [
    body('cart').isArray({ min: 1 }).withMessage('Cart must have at least one item.'),
    body('payment_method').isIn(['cash', 'card', 'mobile_money']).withMessage('Invalid payment method.'),
  ],
  auditLog('PROCESS_SALE', (req, body) => ({
    invoice_no: body?.data?.invoice_no,
    total: body?.data?.total_amount,
  })),
  processSale
);

router.post(
  '/short-payment',
  [
    body('cart').isArray({ min: 1 }).withMessage('Cart must have at least one item.'),
    body('payment_method').isIn(['cash', 'card', 'mobile_money']).withMessage('Invalid payment method.'),
    body('customer_name').notEmpty().withMessage('Customer name required for debt.'),
  ],
  auditLog('PROCESS_SHORT_PAYMENT'),
  processShortPayment
);

router.get('/sales/today', getTodaySales);
router.get('/sales', getSales);
router.get('/sales/:id', getSale);
router.post('/sales/:id/receipt', generateSaleReceipt);

module.exports = router;
