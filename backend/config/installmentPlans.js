/**
 * Packages sold on installment, grouped by the kind of product.
 *
 * Kept here rather than in the database because these are a handful of fixed
 * offers the shop advertises, not catalogue stock — editing this file is the
 * whole job of changing a price.
 *
 * `cashPrice` is optional. Where there is no ready-cash alternative the sheet
 * simply leaves that panel out rather than printing an empty box.
 *
 * The instalment figures print exactly as given, with `monthly * months` and
 * `weekly * weeks` shown beside the balance they clear. That is deliberate: if
 * a schedule does not land on the balance, the sheet says so rather than
 * rounding the difference away where nobody sees it.
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

const POWER_STATION_PACKAGES = [
  {
    name: '3KW Power Station',
    total: 40000,
    deposit: 20000,
    months: 3,
    monthly: 6667,
    weeks: 12,
    weekly: 1667,
    contents: ['3KW Power Station', '400W panel', 'Adapter'],
  },
  {
    name: '1.2KW Power Station',
    total: 20000,
    deposit: 10000,
    months: 3,
    monthly: 3334,
    weeks: 12,
    weekly: 834,
    contents: ['1.2KW Power Station', 'Panel', '2 bulbs', 'Adapter'],
  },
  {
    name: '550W Power Station',
    total: 10000,
    deposit: 5000,
    months: 3,
    monthly: 1667,
    weeks: 12,
    weekly: 417,
    contents: ['550W Power Station', 'Panel', '3 bulbs', 'Adapter', 'USB charger'],
  },
  {
    name: '500W Power Station',
    total: 8000,
    deposit: 4000,
    months: 3,
    monthly: 1334,
    weeks: 12,
    weekly: 334,
    contents: ['500W Power Station', 'Panel', '3 bulbs', 'Adapter', 'USB charger'],
  },
];


const LITHIUM_PACKAGES = [
  {
    name: '2.56KW Solar Power',
    total: 45000,
    deposit: 22500,
    months: 4,
    monthly: 5625,
    weeks: 16,
    weekly: 1406.25,
    cashPrice: 32000,
    contents: [
      '2.56KW lithium battery',
      '2 × 570W panels',
      '3.2KW hybrid inverter',
    ],
  },
  {
    name: '2KW Solar Power',
    total: 35000,
    deposit: 17500,
    months: 3,
    monthly: 5834,
    weeks: 12,
    weekly: 487,
    cashPrice: 27000,
    contents: [
      '2 × 100AH gel batteries',
      '2 × 570W panels',
      '3.2KW hybrid inverter',
    ],
  },
];


/**
 * Straight price lists — a product and what it costs, nothing more.
 *
 * Deliberately separate from the installment sets: these carry no deposit, no
 * schedule and no late-payment term, and the sheet must not imply one.
 */
const SOLAR_SYSTEM_PRICES = [
  { name: '4KW Solar Power', price: 45000 },
  { name: '5KW Solar Power', price: 65000 },
  { name: '10KW Solar Power', price: 95000 },
  { name: '15KW Solar Power', price: 120000 },
  { name: '20KW Solar Power', price: 200000 },
  { name: '25KW Solar Power', price: 250000 },
  { name: '30KW Solar Power', price: 308000 },
];

const PRICE_LISTS = {
  'solar-systems': {
    title: 'SOLAR POWER SYSTEM',
    subtitle: 'Price list for solar systems',
    filename: 'solar-system-prices.pdf',
    items: SOLAR_SYSTEM_PRICES,
  },
};

/** What the printable-sheet route can be asked for. */
const PLAN_SETS = {
  freezer: {
    title: 'DC FREEZER INSTALLMENT PLAN',
    filename: 'dc-freezer-plan.pdf',
    packages: FREEZER_PACKAGES,
  },
  'power-station': {
    title: 'POWER STATION INSTALLMENT PLAN',
    filename: 'power-station-plan.pdf',
    packages: POWER_STATION_PACKAGES,
  },
  lithium: {
    title: 'LITHIUM BATTERY INSTALLMENT PLAN',
    filename: 'lithium-battery-plan.pdf',
    packages: LITHIUM_PACKAGES,
  },
};

module.exports = {
  FREEZER_PACKAGES, POWER_STATION_PACKAGES, LITHIUM_PACKAGES,
  SOLAR_SYSTEM_PRICES, PLAN_SETS, PRICE_LISTS,
};
