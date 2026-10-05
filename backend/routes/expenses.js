const { EXPENSE_CATEGORIES } = require('../config/expenseCategories');
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  createExpense, getExpenses, getExpense, updateExpense, deleteExpense, approveExpense, rejectExpense, getExpenseSummary,
} = require('../controllers/expensesController');

router.use(authenticate);

router.get('/summary', getExpenseSummary);
router.get('/', getExpenses);

router.post(
  '/',
  [
    body('category')
      .isIn(EXPENSE_CATEGORIES)
      .withMessage('Invalid expense category.'),
    body('amount').isNumeric({ min: 0.01 }).withMessage('Amount must be a positive number.'),
  ],
  auditLog('CREATE_EXPENSE', (req) => ({ category: req.body.category, amount: req.body.amount })),
  createExpense
);

router.get('/:id', getExpense);
router.put('/:id', auditLog('UPDATE_EXPENSE'), updateExpense);
router.delete('/:id', auditLog('DELETE_EXPENSE'), deleteExpense);

// Only an owner lets money leave the books.
router.put('/:id/approve', requireLevel(3), auditLog('APPROVE_EXPENSE', (req) => ({ id: req.params.id })), approveExpense);
router.put('/:id/reject', requireLevel(3), auditLog('REJECT_EXPENSE', (req) => ({ id: req.params.id, reason: req.body.reason })), rejectExpense);

module.exports = router;
