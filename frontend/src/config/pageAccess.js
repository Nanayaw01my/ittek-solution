/**
 * Page access grants — the browser's copy of backend/config/pageAccess.js.
 *
 * A screen opens for a user when their role level reaches it, or when the CEO
 * granted it to them individually. Some pages can be granted in a limited
 * form: Products as 'inventory' lets someone add products and correct stock
 * counts without ever seeing a cost price, a selling price or a margin.
 *
 * This decides what the sidebar shows and how a page renders. It is not the
 * security boundary — the server checks every request again. Keep the page
 * ids and modes here in step with the backend file.
 */

export const GRANTABLE_PAGES = {
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
}

export const MODE_LABELS = {
  view: 'View only',
  inventory: 'Inventory only',
  full: 'Full access',
}

const ROLE_LEVELS = { Sales: 1, Manager: 2, CEO: 3, 'Super Admin': 4 }

/** What a user can do on a page: 'full' by role, else the granted mode, else null. */
export function effectiveMode(user, page) {
  const def = GRANTABLE_PAGES[page]
  if (!def) return null
  if ((ROLE_LEVELS[user?.role] || 0) >= def.defaultLevel) return 'full'
  const mode = user?.page_access?.[page]
  return mode && def.modes.includes(mode) ? mode : null
}

export function canAccessPage(user, page) {
  return effectiveMode(user, page) !== null
}
