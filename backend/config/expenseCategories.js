/**
 * The one list of expense categories on the server.
 *
 * It used to be written out in three places — the model, the route validator
 * and the screen — so adding a category meant remembering all three, and
 * missing one meant the server rejecting what the form offered.
 *
 * Commission and Salaries are separate on purpose: a shop needs to see what it
 * pays in wages apart from what it pays on sales, because one is fixed and the
 * other rises with takings.
 */
const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Transport',
  'Salaries',
  'Commission',
  'Maintenance',
  'Marketing',
  'Other',
];

module.exports = { EXPENSE_CATEGORIES };
