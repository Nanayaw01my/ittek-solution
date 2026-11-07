const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { maySell } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  processSale, processShortPayment, getSales, getTodaySales, getSale, generateSaleReceipt,
} = require('../controllers/posController');
const { holdSale, getHolds, getHold, deleteHold } = require('../controllers/holdController');

router.use(authenticate);

/**
 * Taking money is for the people who serve customers.
 *
 * The whole router used to be open to anybody signed in — there was no
 * level on it at all, so a Manager, an Engineer or a Managing Director
 * could post a sale from the API even where the screen was hidden.
 *
 * Only the endpoints that *make* a sale are closed. Reading the day's
 * sales stays open to whoever can already reach the screen showing them:
 * the Dashboard lists the last five on a Manager's own home page, and
 * gating the whole router would have emptied it without saying why.
 */
const sellersOnly = (req, res, next) => {
  if (maySell(req.user.role)) return next();
  return res.status(403).json({
    success: false,
    message: 'Your role does not take sales at the counter.',
  });
};

router.post(
  '/sale',
  sellersOnly,
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
  sellersOnly,
  [
    body('cart').isArray({ min: 1 }).withMessage('Cart must have at least one item.'),
    body('payment_method').isIn(['cash', 'card', 'mobile_money']).withMessage('Invalid payment method.'),
    body('customer_name').notEmpty().withMessage('Customer name required for debt.'),
  ],
  auditLog('PROCESS_SHORT_PAYMENT'),
  processShortPayment
);

// Hold / resume — declared before /sales/:id so "holds" is never read as an id
// A hold is half a sale, so it belongs with the sales.
router.post('/holds', sellersOnly, auditLog('HOLD_SALE'), holdSale);
router.get('/holds', sellersOnly, getHolds);
router.get('/holds/:id', sellersOnly, getHold);
router.delete('/holds/:id', sellersOnly, auditLog('DELETE_HELD_SALE'), deleteHold);

router.get('/sales/today', getTodaySales);
router.get('/sales', getSales);
router.get('/sales/:id', getSale);
router.post('/sales/:id/receipt', generateSaleReceipt);

module.exports = router;
