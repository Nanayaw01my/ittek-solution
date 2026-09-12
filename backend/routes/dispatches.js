const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getDispatches, getDispatch, createDispatch,
  returnDispatchItems, payDispatchItems, closeDispatch, deleteDispatch, getDispatchSheet,
} = require('../controllers/dispatchesController');

// Field dispatch is open to everyone who can sign in — a sales hand going out
// should not need a manager standing next to them to print their sheet.
router.use(authenticate);

router.get('/', getDispatches);
router.post('/', auditLog('CREATE_DISPATCH'), createDispatch);
router.get('/:id', getDispatch);
router.get('/:id/sheet', getDispatchSheet);
router.put('/:id/return', auditLog('RETURN_DISPATCH'), returnDispatchItems);
/**
 * Taking the money for what the agent sold on the field — this one does write
 * a sale, so it lands in the day's takings like any other.
 *
 * Manager and above only. The agent never presses this, on purpose: they come
 * in to account once a week, and a manager checks the goods against the sheet
 * and takes the money. An agent who could ring up their own sales could
 * declare three sold when they sold five and keep the difference, and nothing
 * on the sheet would look wrong.
 */
router.post('/:id/pay', requireLevel(2), auditLog('PAY_DISPATCH'), payDispatchItems);
router.put('/:id/close', auditLog('CLOSE_DISPATCH'), closeDispatch);

// Cancelling a sheet puts stock back, so it stays with CEO and above.
router.delete('/:id', requireLevel(3), auditLog('DELETE_DISPATCH'), deleteDispatch);

module.exports = router;
