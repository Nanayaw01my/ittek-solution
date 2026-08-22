/**
 * Page access grants.
 *
 * Every screen in the sidebar has a role level that opens it by default.
 * On top of that, a Super Admin or CEO can hand an individual user access to a
 * specific screen — and, where it makes sense, a limited version of it.
 *
 * The clearest example is Products: granted as 'inventory', a user can add
 * products and correct stock counts, but never sees a cost price, a selling
 * price, a margin or a supplier, and cannot delete anything. Granted as 'full'
 * they get the page as an owner sees it.
 *
 * A grant can only ever *add* access. It cannot take away what a user's role
 * already gives them, and the four pages that control the business itself —
 * users, audit logs, backup and settings — are not grantable at all.
 */

/**
 * mode meanings, per page:
 *   view      — read the screen, change nothing
 *   inventory — products only: add products and adjust stock, no money shown
 *   full      — the screen as a CEO sees it
 */
const GRANTABLE_PAGES = {
  products: {
    label: 'Products',
    defaultLevel: 3,
    modes: ['inventory', 'full'],
    modeLabels: {
      inventory: 'Inventory only — add products and adjust stock, no prices',
      full: 'Full access',
    },
  },
  categories: { label: 'Categories', defaultLevel: 3, modes: ['view', 'full'] },
  suppliers: { label: 'Suppliers', defaultLevel: 3, modes: ['view', 'full'] },
  purchases: { label: 'Purchases', defaultLevel: 3, modes: ['view', 'full'] },
  workers: { label: 'Worker Payments', defaultLevel: 3, modes: ['view', 'full'] },
  'sales-history': { label: 'Sales History', defaultLevel: 3, modes: ['view'] },
  reports: { label: 'Reports', defaultLevel: 3, modes: ['view'] },
  financial: { label: 'Financial', defaultLevel: 3, modes: ['view'] },
  search: { label: 'Search', defaultLevel: 3, modes: ['view'] },
  debts: { label: 'Debts', defaultLevel: 2, modes: ['view', 'full'] },
  'stock-requests': { label: 'Stock Requests', defaultLevel: 2, modes: ['view', 'full'] },
  'credit-agreements': { label: 'Credit Agreements', defaultLevel: 2, modes: ['view', 'full'] },
  'fraud-alerts': { label: 'Fraud Alerts', defaultLevel: 2, modes: ['view', 'full'] },
};

const ROLE_LEVELS = { 'Super Admin': 4, CEO: 3, Manager: 2, Sales: 1 };

/** The mode a user was explicitly granted for a page, or null. */
const grantedMode = (user, page) => {
  const grants = user?.page_access;
  if (!grants) return null;
  // Mongoose stores this as a Map; a lean() document gives a plain object.
  const mode = typeof grants.get === 'function' ? grants.get(page) : grants[page];
  return mode && GRANTABLE_PAGES[page]?.modes.includes(mode) ? mode : null;
};

/**
 * What this user can do on a page: 'full' when their role already opens it,
 * otherwise whatever they were granted, otherwise null for no access.
 */
const effectiveMode = (user, page) => {
  const def = GRANTABLE_PAGES[page];
  if (!def) return null;
  if ((ROLE_LEVELS[user?.role] || 0) >= def.defaultLevel) return 'full';
  return grantedMode(user, page);
};

/** True when the user reaches the page at one of the listed modes. */
const canAccessPage = (user, page, modes = null) => {
  const mode = effectiveMode(user, page);
  if (!mode) return false;
  return modes ? modes.includes(mode) : true;
};

/**
 * Reduce a submitted grants object to valid page/mode pairs.
 * Anything unrecognised is dropped rather than rejected, so an older client
 * cannot wipe out grants it does not know about by round-tripping them.
 */
const sanitizeGrants = (input) => {
  const clean = {};
  if (!input || typeof input !== 'object') return clean;
  Object.entries(input).forEach(([page, mode]) => {
    if (GRANTABLE_PAGES[page]?.modes.includes(mode)) clean[page] = mode;
  });
  return clean;
};

module.exports = {
  GRANTABLE_PAGES,
  ROLE_LEVELS,
  grantedMode,
  effectiveMode,
  canAccessPage,
  sanitizeGrants,
};
