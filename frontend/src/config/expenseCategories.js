/**
 * The browser's copy of backend/config/expenseCategories.js. Keep the two in
 * step — the server rejects any category it does not know.
 *
 * Commission is separate from Salaries so the shop can see what it pays in
 * wages apart from what it pays on sales.
 */
export const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Transport',
  'Salaries',
  'Commission',
  'Maintenance',
  'Marketing',
  'Other',
]
