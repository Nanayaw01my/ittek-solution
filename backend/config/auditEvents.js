/**
 * What each recorded action is called, and how loudly to say it.
 *
 * Every action that changes anything already passes through the audit log, so
 * that is where the owners are told. Two levels:
 *
 *   'high' — worth interrupting somebody for: money out, records destroyed,
 *            stock corrected by hand, staff and security. Bell and phone.
 *   'low'  — the ordinary work of a shop: a sale, a product edited. Bell
 *            only, so the day's trading is on the record without the phone
 *            buzzing a hundred times.
 *
 * The CEO can set every action to 'high' in Settings if they want everything
 * on the phone. It is not the default because a phone that buzzes at every
 * sale is a phone with notifications switched off by Friday, which leaves the
 * shop worse off than before.
 */

const EVENTS = {
  // ── Money leaving, or being undone ──────────────────────────────────
  CREATE_REFUND: ['refunded a sale', 'high'],
  APPROVE_REFUND: ['approved a refund', 'high'],
  REJECT_REFUND: ['rejected a refund', 'high'],
  UPDATE_REFUND: ['changed a refund', 'high'],
  DELETE_REFUND: ['deleted a refund', 'high'],
  PROCESS_SHORT_PAYMENT: ['took a part payment', 'high'],
  CREATE_EXPENSE: ['recorded an expense', 'low'],
  UPDATE_EXPENSE: ['changed an expense', 'high'],
  DELETE_EXPENSE: ['deleted an expense', 'high'],
  CREATE_WORKER_PAYMENT: ['paid a worker', 'high'],
  DELETE_WORKER_PAYMENT: ['deleted a worker payment', 'high'],
  CREATE_DEBT: ['wrote down a debt', 'high'],
  DELETE_DEBT: ['deleted a debt', 'high'],
  CLOSE_DAY: ['closed the day', 'high'],
  REOPEN_DAY: ['reopened a closed day', 'high'],

  // ── Ordinary trading ────────────────────────────────────────────────
  PROCESS_SALE: ['made a sale', 'low'],
  HOLD_SALE: ['held a sale', 'low'],
  DELETE_HELD_SALE: ['dropped a held sale', 'low'],
  DEBT_PAYMENT: ['took a debt payment', 'low'],
  CREATE_SERVICE_CHARGE: ['recorded a service charge', 'low'],
  DELETE_SERVICE_CHARGE: ['deleted a service charge', 'high'],
  LAYAWAY_PAYMENT: ['took a layaway payment', 'low'],
  LAYAWAY_COLLECT: ['released a layaway', 'low'],
  LAYAWAY_CANCEL: ['cancelled a layaway', 'high'],
  CREATE_LAYAWAY: ['started a layaway', 'low'],
  CREDIT_AGREEMENT_PAYMENT: ['took a credit payment', 'low'],
  CREATE_CREDIT_AGREEMENT: ['created a credit agreement', 'low'],
  UPDATE_CREDIT_AGREEMENT: ['changed a credit agreement', 'high'],

  // ── Stock ───────────────────────────────────────────────────────────
  CREATE_PRODUCT: ['added a product', 'low'],
  UPDATE_PRODUCT: ['changed a product', 'low'],
  DELETE_PRODUCT: ['deleted a product', 'high'],
  STOCK_COUNT: ['corrected stock by hand', 'high'],
  CREATE_DAMAGED_GOOD: ['wrote off damaged stock', 'high'],
  UPDATE_DAMAGED_GOOD: ['changed a damage record', 'low'],
  DELETE_DAMAGED_GOOD: ['deleted a damage record', 'high'],
  BULK_IMPORT_PRODUCTS: ['imported products in bulk', 'high'],
  IMPORT_PRODUCTS: ['imported products', 'high'],
  MERGE_DUPLICATE_PRODUCTS: ['merged duplicate products', 'high'],
  AUTO_MERGE_DUPLICATE_PRODUCTS: ['auto-merged duplicate products', 'high'],
  GENERATE_ALL_BARCODES: ['barcoded the whole catalogue', 'high'],
  CREATE_PURCHASE: ['recorded a purchase', 'low'],
  DELETE_PURCHASE: ['deleted a purchase', 'high'],
  CREATE_CATEGORY: ['added a category', 'low'],
  UPDATE_CATEGORY: ['changed a category', 'low'],
  DELETE_CATEGORY: ['deleted a category', 'high'],
  CREATE_SUPPLIER: ['added a supplier', 'low'],
  UPDATE_SUPPLIER: ['changed a supplier', 'low'],
  DELETE_SUPPLIER: ['deleted a supplier', 'high'],

  // ── Goods leaving with somebody ─────────────────────────────────────
  CREATE_DISPATCH: ['issued goods to a field agent', 'high'],
  RETURN_DISPATCH: ['took back field goods', 'low'],
  PAY_DISPATCH: ['paid in field sales', 'low'],
  CLOSE_DISPATCH: ['closed a dispatch', 'low'],
  DELETE_DISPATCH: ['deleted a dispatch', 'high'],

  // ── Credit on phones ────────────────────────────────────────────────
  CREATE_PHONE_SALE: ['took a phone credit application', 'high'],
  APPROVE_PHONE_SALE: ['approved a phone credit sale', 'high'],
  REJECT_PHONE_SALE: ['rejected a phone credit sale', 'low'],
  PAY_PHONE_SALE: ['took a phone instalment', 'low'],
  DELETE_PHONE_SALE: ['deleted a phone credit record', 'high'],

  // ── Paperwork ───────────────────────────────────────────────────────
  REQUEST_RECEIPT_APPROVAL: ['sent a receipt for approval', 'high'],
  APPROVE_RECEIPT: ['approved a receipt', 'low'],
  REJECT_RECEIPT: ['turned down a receipt', 'low'],
  DELETE_RECEIPT_APPROVAL: ['deleted a receipt request', 'low'],
  CREATE_QUOTATION: ['wrote a quotation', 'low'],
  UPDATE_QUOTATION: ['changed a quotation', 'low'],
  ACCEPT_QUOTATION: ['turned a quote into a sale', 'high'],
  DELETE_QUOTATION: ['deleted a quotation', 'low'],
  CREATE_WARRANTY: ['registered a warranty', 'low'],
  CLAIM_WARRANTY: ['recorded a warranty claim', 'low'],
  DELETE_WARRANTY: ['deleted a warranty', 'high'],
  CREATE_REMINDER: ['set a customer reminder', 'low'],
  UPDATE_CONTACT: ['changed a customer contact', 'low'],
  BACKFILL_CONTACTS: ['gathered past customers into the contact book', 'high'],
  SEND_REMINDER: ['reminded a customer', 'low'],
  DELETE_REMINDER: ['deleted a reminder', 'low'],
  CREATE_INSTALLATION: ['booked an installation', 'low'],
  UPDATE_INSTALLATION: ['updated an installation', 'low'],
  DELETE_INSTALLATION: ['deleted an installation', 'high'],
  CREATE_STOCK_REQUEST: ['requested stock', 'low'],
  APPROVE_STOCK_REQUEST: ['approved a stock request', 'low'],
  REJECT_STOCK_REQUEST: ['rejected a stock request', 'low'],
  DELETE_STOCK_REQUEST: ['deleted a stock request', 'low'],

  // ── People and security ─────────────────────────────────────────────
  ISSUE_BADGE: ['issued a staff badge', 'high'],
  REVOKE_BADGE: ['revoked a staff badge', 'high'],
  CREATE_USER: ['created a user account', 'high'],
  UPDATE_USER: ['changed a user account', 'high'],
  DELETE_USER: ['deleted a user account', 'high'],
  TOGGLE_USER_ACTIVE: ['enabled or disabled a user', 'high'],
  RESET_USER_PASSWORD: ["reset somebody's password", 'high'],
  CHANGE_PASSWORD: ['changed their own password', 'high'],
  LOGIN: ['signed in', 'low'],
  LOGOUT: ['signed out', 'low'],
  FAILED_LOGIN: ['failed to sign in', 'high'],
  LOGIN_BLOCKED: ['tried to sign in to a disabled account', 'high'],
  REVIEW_FRAUD_ALERT: ['reviewed a fraud alert', 'high'],
  ADJUST_LOYALTY_POINTS: ['adjusted loyalty points', 'high'],

  // ── The system itself ───────────────────────────────────────────────
  UPDATE_SETTINGS: ['changed the settings', 'high'],
  UPDATE_EMAIL_CONFIG: ['changed the email settings', 'high'],
  UPDATE_SMS_CONFIG: ['changed the SMS settings', 'high'],
  TEST_SMS: ['sent a test SMS', 'low'],
  SEND_SMS: ['texted a customer', 'low'],
  UPLOAD_LOGO: ['changed the logo', 'low'],
  CREATE_BACKUP: ['made a backup', 'high'],
  RESTORE_BACKUP: ['restored a backup', 'high'],
  DELETE_RECORDS: ['deleted records in bulk', 'high'],
  CLEAR_ALL_DATA: ['cleared all data', 'high'],
};

/** Anything not named above still gets reported, in its own words. */
const describe = (action) => {
  const known = EVENTS[action];
  if (known) return { label: known[0], level: known[1] };
  return {
    label: String(action || 'did something').toLowerCase().replace(/_/g, ' '),
    // Unknown means new, and new is worth seeing until somebody says otherwise.
    level: 'high',
  };
};

module.exports = { EVENTS, describe };
