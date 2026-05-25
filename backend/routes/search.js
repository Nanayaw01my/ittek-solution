const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { universalSearch, getSuggestions } = require('../controllers/searchController');

router.use(authenticate);

router.post('/', universalSearch);
router.get('/suggestions', getSuggestions);

module.exports = router;
