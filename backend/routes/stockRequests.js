const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getStockRequests, createStockRequest, getStockRequest,
  approveStockRequest, rejectStockRequest, deleteStockRequest,
} = require('../controllers/stockRequestsController');

/**
 * Any member of staff may ask for stock.
 *
 * It was Manager and above. But the person who notices the last 12V
 * adaptor leaving the shelf is the attendant who just sold it, and making
 * them find a manager to pass the message on is how a shop runs out of
 * something it sells every day.
 *
 * Asking is not buying: a request is a note to the owners, and nothing is
 * ordered, priced or added to stock until one of them approves it below.
 * What an attendant can see is narrowed to their own requests in the
 * controller, so this opens a door to ask, not to the shop's buying list.
 */
router.use(authenticate, requireLevel(1));

router.get('/', getStockRequests);

router.post(
  '/',
  [body('items').isArray({ min: 1 }).withMessage('At least one item is required.')],
  auditLog('CREATE_STOCK_REQUEST'),
  createStockRequest
);

router.get('/:id', getStockRequest);

// Only CEO (3) and Super Admin (4) can approve/reject
router.put('/:id/approve', requireLevel(3), auditLog('APPROVE_STOCK_REQUEST'), approveStockRequest);
router.put('/:id/reject', requireLevel(3), auditLog('REJECT_STOCK_REQUEST'), rejectStockRequest);
router.delete('/:id', auditLog('DELETE_STOCK_REQUEST'), deleteStockRequest);

module.exports = router;
