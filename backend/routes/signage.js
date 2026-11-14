const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getBoard } = require('../controllers/signageController');

/**
 * The customer-facing board on the shop wall.
 *
 * Behind a login like everything else, even though what it shows is
 * public by nature — a price on a shelf is not a secret. The sign-in is
 * not protecting the prices; it is stopping the whole catalogue, with
 * stock levels, from being enumerable by anyone who finds the URL.
 *
 * Read only. There is no POST here and there should never be one: a
 * screen on a wall in a public room is the last device in the shop that
 * should be able to change anything.
 */
router.use(authenticate);
router.get('/board', getBoard);

module.exports = router;
