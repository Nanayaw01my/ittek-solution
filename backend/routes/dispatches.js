const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel, ROLE_LEVELS } = require('../middleware/rbac');
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
// Returns happen at the counter too. A rep adding stock back on their own
// phone would be writing the shop's stock figure up from the field, with
// nobody having seen the goods come through the door.
router.put('/:id/return', shopStaffOnly, auditLog('RETURN_DISPATCH'), returnDispatchItems);
/**
 * Taking the money for what the agent sold on the field. This one writes a
 * real sale, so it lands in the day's takings and on the CEO's dashboard like
 * any other.
 *
 * Open to the agent for their OWN sheet — the controller allows a field agent
 * nowhere near anyone else's — and to Manager and above for all of them. A
 * Sales hand at the counter cannot settle another person's field sheet.
 *
 * Note what this does not prove: that the money reached the shop. It records
 * that the goods were sold, on the agent's word. The check on that is the
 * sheet itself — what went out against what came back — read at the weekly
 * accounting.
 */
const mayTakeMoney = (req, res, next) => {
  const level = ROLE_LEVELS[req.user.role] || 0;
  if (req.user.role === 'Field Agent' || level >= 2) return next();
  return res.status(403).json({
    success: false,
    message: 'Only the agent or a manager can settle a field sheet.',
  });
};

router.post('/:id/pay', mayTakeMoney, auditLog('PAY_DISPATCH'), payDispatchItems);
// Closing writes off whatever is still out as gone, with no money against it.
// That is a counter decision, never the agent's own.
router.put('/:id/close', shopStaffOnly, auditLog('CLOSE_DISPATCH'), closeDispatch);

// Cancelling a sheet puts stock back, so it stays with CEO and above.
router.delete('/:id', requireLevel(3), auditLog('DELETE_DISPATCH'), deleteDispatch);

module.exports = router;
