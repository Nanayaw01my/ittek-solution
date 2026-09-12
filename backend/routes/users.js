const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getUsers, createUser, getUser, updateUser, deleteUser, toggleActive, resetPassword,
} = require('../controllers/usersController');
const { ROLE_LEVELS } = require('../middleware/rbac');

// Taken from the role table rather than typed out again. A second hardcoded
// list here is what made "Field Agent" fail as an invalid role after the model
// already accepted it — the two lists drifted the moment a role was added.
const ROLES = Object.keys(ROLE_LEVELS);

// Only CEO (3) and Super Admin (4) can access user management
const canAccess = [authenticate, requireLevel(3)];

router.get('/', canAccess, getUsers);

router.post(
  '/',
  canAccess,
  [
    body('username').notEmpty().withMessage('Username is required.').isLength({ min: 3 }),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email required.').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('role').isIn(ROLES).withMessage('Invalid role.'),
  ],
  auditLog('CREATE_USER', (req, body) => ({ created_username: req.body.username, role: req.body.role })),
  createUser
);

router.get('/:id', canAccess, getUser);

router.put(
  '/:id',
  canAccess,
  auditLog('UPDATE_USER', (req) => ({ user_id: req.params.id })),
  updateUser
);

router.delete(
  '/:id',
  canAccess,
  auditLog('DELETE_USER', (req) => ({ user_id: req.params.id })),
  deleteUser
);

router.put(
  '/:id/toggle-active',
  canAccess,
  auditLog('TOGGLE_USER_ACTIVE', (req) => ({ user_id: req.params.id })),
  toggleActive
);

router.put(
  '/:id/reset-password',
  canAccess,
  [body('new_password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.')],
  auditLog('RESET_USER_PASSWORD', (req) => ({ user_id: req.params.id })),
  resetPassword
);

module.exports = router;
