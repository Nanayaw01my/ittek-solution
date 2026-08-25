/**
 * DC freezer packages sold on installment.
 *
 * Kept here rather than in the database because these are a handful of fixed
 * offers the shop advertises, not catalogue stock — editing this file is the
 * whole job of changing a price.
 *
 * The instalment figures are printed exactly as given. `monthly * months` and
 * `weekly * weeks` are shown alongside the balance so nothing is hidden: if a
 * schedule does not add up to the balance, the sheet says so rather than
 * quietly rounding it away.
 */
const FREEZER_PACKAGES = [
  {
    name: '118L DC Freezer',
    total: 23000,
    deposit: 15000,
    months: 3,
    monthly: 2700,
    weeks: 12,
    weekly: 667,
    cashPrice: 20000,
    contents: [
      '118L Bona Freezer',
      '2 × 100AH gel batteries',
      '100AH MPPT controller',
      '2 × 570W panels',
      '3 DC bulbs',
    ],
  },
  {
    name: '218L DC Freezer',
    total: 28500,
    deposit: 18000,
    months: 3,
    monthly: 3500,
    weeks: 12,
    weekly: 875,
    cashPrice: 25000,
    contents: [
      '218L Bona Freezer',
      '2 × 100AH gel batteries',
      '100AH MPPT controller',
      '2 × 570W panels',
      '3 DC bulbs',
    ],
  },
  {
    name: '318L DC Freezer Solar',
    total: 39000,
    deposit: 23000,
    months: 3,
    monthly: 5334,
    weeks: 12,
    weekly: 1334,
    cashPrice: 35000,
    contents: [
      '318L Bona Freezer',
      '3 × 100AH gel batteries',
      '2.2KW hybrid inverter',
      '3 × 570W panels',
      '3 DC bulbs',
    ],
  },
];

module.exports = { FREEZER_PACKAGES };
