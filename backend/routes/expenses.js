const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const {
  createExpense, getExpenses, getExpense, updateExpense, deleteExpense, getExpenseSummary,
} = require('../controllers/expensesController');

router.use(authenticate);

router.get('/summary', getExpenseSummary);
router.get('/', getExpenses);

router.post(
  '/',
  [
    body('category')
      .isIn(['Rent', 'Utilities', 'Transport', 'Salaries', 'Maintenance', 'Marketing', 'Other'])
      .withMessage('Invalid expense category.'),
    body('amount').isNumeric({ min: 0.01 }).withMessage('Amount must be a positive number.'),
  ],
  auditLog('CREATE_EXPENSE', (req) => ({ category: req.body.category, amount: req.body.amount })),
  createExpense
);

router.get('/:id', getExpense);
router.put('/:id', auditLog('UPDATE_EXPENSE'), updateExpense);
router.delete('/:id', auditLog('DELETE_EXPENSE'), deleteExpense);

module.exports = router;
