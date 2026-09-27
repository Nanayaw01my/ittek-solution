const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { getReorderSuggestions } = require('../controllers/reorderController');

// It shows cost prices and what the shop's money is tied up in. Manager up.
router.use(authenticate, requireLevel(2));

router.get('/', getReorderSuggestions);

module.exports = router;
