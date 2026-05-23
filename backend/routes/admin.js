const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getDashboard,
  getCustomers,
  getCustomerDetail,
  updateCustomer,
  deleteCustomer,
  getStaff,
  addStaff,
  updateStaff,
  deleteStaff,
  getDevices,
  addDevice,
  updateDevice,
  deleteDevice,
  lockDevice,
  unlockDevice,
  getTransactions,
  getReports,
  getAuditLogs,
  resetCustomerPassword,
  getSettings,
  updateSettings,
} = require('../controllers/adminController');

// Apply authentication and admin authorization to all routes
router.use(authenticate, authorize('admin'));

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
router.get('/dashboard', getDashboard);

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
router.get('/customers', getCustomers);
router.get('/customers/:id', getCustomerDetail);
router.put(
  '/customers/:id',
  [
    param('id').isMongoId().withMessage('Invalid customer ID.'),
  ],
  updateCustomer
);
router.delete(
  '/customers/:id',
  [param('id').isMongoId().withMessage('Invalid customer ID.')],
  deleteCustomer
);
router.post(
  '/reset-customer-password/:id',
  [
    param('id').isMongoId().withMessage('Invalid customer ID.'),
    body('new_password')
      .notEmpty()
      .withMessage('New password is required.')
      .isLength({ max: 5 })
      .withMessage('Customer password must be at most 5 characters.'),
  ],
  resetCustomerPassword
);

// ─── STAFF ────────────────────────────────────────────────────────────────────
router.get('/staff', getStaff);
router.post(
  '/staff',
  [
    body('name').notEmpty().trim().withMessage('Name is required.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
    body('password').notEmpty().isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('phone').optional().trim(),
  ],
  addStaff
);
router.put(
  '/staff/:id',
  [param('id').isMongoId().withMessage('Invalid staff ID.')],
  updateStaff
);
router.delete(
  '/staff/:id',
  [param('id').isMongoId().withMessage('Invalid staff ID.')],
  deleteStaff
);

// ─── DEVICES ──────────────────────────────────────────────────────────────────
router.get('/devices', getDevices);
router.post(
  '/devices',
  [
    body('model').notEmpty().trim().withMessage('Device model is required.'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number.'),
    body('serial_number').optional().trim(),
    body('udid').optional().trim(),
    body('imei').optional().trim(),
  ],
  addDevice
);
router.put(
  '/devices/:id',
  [param('id').isMongoId().withMessage('Invalid device ID.')],
  updateDevice
);
router.delete(
  '/devices/:id',
  [param('id').isMongoId().withMessage('Invalid device ID.')],
  deleteDevice
);
router.post(
  '/devices/:id/lock',
  [param('id').isMongoId().withMessage('Invalid device ID.')],
  lockDevice
);
router.post(
  '/devices/:id/unlock',
  [param('id').isMongoId().withMessage('Invalid device ID.')],
  unlockDevice
);

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
router.get('/transactions', getTransactions);

// ─── REPORTS ──────────────────────────────────────────────────────────────────
router.get('/reports', getReports);

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
router.get('/audit-logs', getAuditLogs);

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
