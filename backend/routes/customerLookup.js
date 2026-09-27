const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const {
  lookupCustomers, getCustomerProfile,
} = require('../controllers/customerLookupController');

// A profile gathers a customer's debts and credit deals in one place, which is
// more than the counter needs to sell to them. Manager and above.
router.use(authenticate, requireLevel(2));

router.get('/lookup', lookupCustomers);
router.get('/profile/:phone', getCustomerProfile);

module.exports = router;
