/**
 * The Starlink offer, as the shop advertises it.
 *
 * Kept here rather than inside the drawing code so the prices can be changed
 * by somebody reading figures, not PDF layout. Every per-period amount is
 * worked out from the balance at render time rather than typed in twice —
 * two copies of a number is one of them going stale, and on a flyer a stale
 * number is one the customer holds the shop to.
 */

const PACKAGES = [
  {
    key: 'commercial',
    name: 'COMMERCIAL STARLINK',
    strap: 'Built for business',
    cash: 20000,
    installment_total: 25000,
    down_payment: 18000,
    options: [
      { label: '2 months', periods: 2, unit: 'per month' },
      { label: '8 weeks', periods: 8, unit: 'per week' },
    ],
    who: ['Offices', 'Hotels', 'Schools', 'Commercial establishments', 'Starlink hotspot businesses'],
    featured: true,
  },
  {
    key: 'standard',
    name: 'RESIDENTIAL STANDARD',
    strap: 'The family connection',
    cash: 9000,
    installment_total: 12000,
    down_payment: 9500,
    options: [
      { label: '3 months', periods: 3, unit: 'per month' },
      { label: '12 weeks', periods: 12, unit: 'per week' },
    ],
    who: ['Homes', 'Families', 'Small offices', 'Students', 'Residential internet users'],
  },
  {
    key: 'mini',
    name: 'RESIDENTIAL MINI',
    strap: 'Small, portable, powerful',
    // Priced in two parts, so both are shown rather than only the sum.
    cash_parts: [
      { label: 'Starlink Mini + mount', amount: 4800 },
      { label: 'Installation fee', amount: 1000 },
    ],
    cash: 5800,
    installment_total: 8500,
    down_payment: 5800,
    options: [
      { label: '2 months', periods: 2, unit: 'per month' },
      { label: '8 weeks', periods: 8, unit: 'per week' },
    ],
    who: ['Homes', 'Students', 'Travel and site work', 'Small offices'],
  },
];

const SERVICES = [
  'Solar panel installations',
  'Solar accessories and equipment',
  'Residential & commercial Starlink installations',
  'Starlink hotspot business installations',
  'Networking equipment and accessories',
  'CCTV camera sales',
  'CCTV camera installations',
  'CCTV equipment and technical support',
];

const WHY_US = [
  'Genuine Starlink products',
  'Professional installation services',
  'Flexible installment payment plans',
  'Reliable customer support',
  'Quality products and equipment',
  'Residential and commercial solutions',
];

const CONTACT = {
  company: 'DAN AND DOR SOLAR COMPANY LIMITED',
  location: 'Bogoso, Ghana',
  phones: ['0598565277', '0595413632'],
  cta: 'GET CONNECTED TODAY!',
  slogan: 'Your Reliable Tech & Solar Partner.',
};

/**
 * The balance and what each period costs.
 *
 * Remaining = installment total − down payment, and each period is that
 * balance divided by the number of periods. The down payment is never
 * divided: it is paid once, up front.
 *
 * The monthly and weekly options are alternatives — a customer takes one.
 */
const priced = (pkg) => {
  const remaining = Number((pkg.installment_total - pkg.down_payment).toFixed(2));
  return {
    ...pkg,
    remaining,
    options: pkg.options.map((o) => {
      const amount = Number((remaining / o.periods).toFixed(2));
      return {
        ...o,
        amount,
        // 833.33 a month comes to 2,499.99 over three months, not 2,500. A
        // customer who adds the figures up deserves to have been told it is
        // approximate rather than to think the shop cannot count. Compared
        // on the rounded figure, which is the one actually printed.
        approx: Math.abs(amount * o.periods - remaining) > 0.005,
      };
    }),
  };
};

module.exports = {
  PACKAGES: PACKAGES.map(priced),
  SERVICES,
  WHY_US,
  CONTACT,
};
