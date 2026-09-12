const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getFieldAgents, getDispatches, getDispatch, createDispatch,
  returnDispatchItems, payDispatchItems, closeDispatch, deleteDispatch, getDispatchSheet,
} = require('../controllers/dispatchesController');

// Open to everyone who can sign in, but not equally: a field agent sees only
// their own sheets and can neither issue one nor take money for it.
router.use(authenticate);

/**
 * A field agent never issues their own sheet. The goods are chosen for them at
 * the counter, by someone who can see the shop's stock — which a rep cannot.
 * Letting them issue to themselves would be letting them help themselves.
 */
const shopStaffOnly = (req, res, next) => {
  if (req.user.role === 'Field Agent') {
    return res.status(403).json({
      success: false,
      message: 'Goods are issued to you at the shop. Ask the counter to add them.',
    });
  }
  next();
};

router.get('/', getDispatches);
// Who a sheet can be issued to. Counter staff need this and cannot reach
// /api/users, which is CEO only.
router.get('/agents', shopStaffOnly, getFieldAgents);
router.post('/', shopStaffOnly, auditLog('CREATE_DISPATCH'), createDispatch);
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
