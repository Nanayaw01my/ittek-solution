const mongoose = require('mongoose');

const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Purchase = require('../models/Purchase');
const Refund = require('../models/Refund');
const Debt = require('../models/Debt');
const Layaway = require('../models/Layaway');
const CreditAgreement = require('../models/CreditAgreement');
const WorkerPayment = require('../models/WorkerPayment');
const StockRequest = require('../models/StockRequest');
const Supplier = require('../models/Supplier');
const Category = require('../models/Category');
const Customer = require('../models/Customer');
const FraudAlert = require('../models/FraudAlert');
const Notification = require('../models/Notification');

const money = (v) => (typeof v === 'number' ? `GH₵${v.toFixed(2)}` : '');

/**
 * What the Delete Records screen can work on.
 *
 * Each entry says how to find records, how to describe one in a list, and how
 * to get rid of it. Products are deactivated rather than removed, because past
 * sales reference them and a hard delete would leave holes in the sales
 * history; everything else is deleted outright.
 *
 * `warning` is shown in the browser before anything is deleted — these are the
 * records whose removal changes what the reports say.
 */
const TYPES = {
  products: {
    label: 'Products',
    model: Product,
    searchFields: ['name', 'barcode'],
    sort: { name: 1 },
    // Soft delete: past sales point at these documents.
    softDelete: true,
    baseFilter: { is_active: true },
    row: (d) => ({
      id: d._id,
      primary: d.name,
      secondary: d.barcode || '',
      detail: `${d.quantity ?? 0} in stock`,
    }),
    warning: 'Products are deactivated, not erased, so past sales keep their history. They disappear from the POS and the product list.',
  },
  sales: {
    label: 'Sales',
    model: Sale,
    searchFields: ['invoice_no', 'customer_name', 'customer_phone'],
    sort: { sale_date: -1 },
    row: (d) => ({
      id: d._id,
      primary: d.invoice_no || 'Sale',
      secondary: d.customer_name || 'Walk-in',
      detail: money(d.total_amount),
      date: d.sale_date,
    }),
    warning: 'Deleting a sale removes it from every sales and profit report, and does not put the stock back. Refund it instead if the goods came back.',
  },
  expenses: {
    label: 'Expenses',
    model: Expense,
    searchFields: ['category', 'description'],
    sort: { expense_date: -1 },
    row: (d) => ({
      id: d._id,
      primary: d.category || 'Expense',
      secondary: d.description || '',
      detail: money(d.amount),
      date: d.expense_date,
    }),
    warning: 'Deleting an expense raises your reported profit for that period.',
  },
  purchases: {
    label: 'Purchases',
    model: Purchase,
    searchFields: ['notes'],
    sort: { purchase_date: -1 },
    row: (d) => ({
      id: d._id,
      primary: `${d.items?.length || 0} item(s)`,
      secondary: d.notes || '',
      detail: money(d.total_amount),
      date: d.purchase_date,
    }),
    warning: 'Deleting a purchase does not take the stock back off the shelf.',
  },
  refunds: {
    label: 'Refunds',
    model: Refund,
    searchFields: ['invoice_ref', 'customer_name', 'reason'],
    sort: { refund_date: -1 },
    row: (d) => ({
      id: d._id,
      primary: d.invoice_ref || 'Refund',
      secondary: d.customer_name || '',
      detail: money(d.refund_amount),
      date: d.refund_date,
    }),
    warning: 'Deleting a refund makes the original sale count in full again.',
  },
  debts: {
    label: 'Debts',
    model: Debt,
    searchFields: ['customer_name', 'customer_phone'],
    sort: { createdAt: -1 },
    row: (d) => ({
      id: d._id,
      primary: d.customer_name || 'Debtor',
      secondary: d.customer_phone || '',
      detail: `${money(d.amount_owed)} owed, ${money(d.amount_paid)} paid`,
      date: d.createdAt,
    }),
    warning: 'The record of what this customer owes is removed permanently.',
  },
  layaways: {
    label: 'Pay & Pick Later',
    model: Layaway,
    searchFields: ['reference', 'customer_name', 'customer_phone'],
    sort: { createdAt: -1 },
    row: (d) => ({
      id: d._id,
      primary: d.reference || 'Layaway',
      secondary: d.customer_name || '',
      detail: `${money(d.amount_paid)} paid of ${money(d.total_amount)}`,
      date: d.createdAt,
    }),
    warning: 'Money already collected against these agreements disappears from your cash flow, and reserved stock is not returned. Cancel the agreement instead if the customer pulled out.',
  },
  'credit-agreements': {
    label: 'Credit Agreements',
    model: CreditAgreement,
    searchFields: ['customer_name', 'customer_phone', 'serial_number'],
    sort: { createdAt: -1 },
    row: (d) => ({
      id: d._id,
      primary: d.customer_name || 'Agreement',
      secondary: d.product_type || '',
      detail: money(d.total_amount),
      date: d.createdAt,
    }),
    warning: 'The signed agreement record and its payment history are removed permanently.',
  },
  'worker-payments': {
    label: 'Worker Payments',
    model: WorkerPayment,
    searchFields: ['worker_name', 'worker_phone'],
    sort: { payment_date: -1 },
    row: (d) => ({
      id: d._id,
      primary: d.worker_name || 'Payment',
      secondary: d.worker_phone || '',
      detail: money(d.amount_paid),
      date: d.payment_date,
    }),
  },
  'stock-requests': {
    label: 'Stock Requests',
    model: StockRequest,
    searchFields: ['status'],
    sort: { request_date: -1 },
    row: (d) => ({
      id: d._id,
      primary: `${d.items?.length || 0} item(s)`,
      secondary: d.status || '',
      detail: money(d.total_amount),
      date: d.request_date,
    }),
  },
  suppliers: {
    label: 'Suppliers',
    model: Supplier,
    searchFields: ['name', 'phone'],
    sort: { name: 1 },
    row: (d) => ({ id: d._id, primary: d.name, secondary: d.phone || '' }),
    warning: 'Products linked to a deleted supplier keep working; they simply lose the link.',
  },
  categories: {
    label: 'Categories',
    model: Category,
    searchFields: ['name'],
    sort: { name: 1 },
    row: (d) => ({ id: d._id, primary: d.name, secondary: d.description || '' }),
    warning: 'Products in a deleted category are left without one, and any staff member confined to it loses their section.',
  },
  customers: {
    label: 'Customers',
    model: Customer,
    searchFields: ['full_name', 'phone', 'email'],
    sort: { createdAt: -1 },
    row: (d) => ({ id: d._id, primary: d.full_name, secondary: d.phone || d.email || '', date: d.createdAt }),
  },
  'fraud-alerts': {
    label: 'Fraud Alerts',
    model: FraudAlert,
    searchFields: ['title', 'username'],
    sort: { createdAt: -1 },
    row: (d) => ({ id: d._id, primary: d.title, secondary: d.username || '', detail: d.severity, date: d.createdAt }),
  },
  notifications: {
    label: 'Notifications',
    model: Notification,
    searchFields: ['title', 'message'],
    sort: { createdAt: -1 },
    row: (d) => ({ id: d._id, primary: d.title, secondary: d.message || '', date: d.createdAt }),
  },
};

/** One delete call is capped, so a mis-click cannot take out the whole table. */
const MAX_PER_DELETE = 200;

/**
 * GET /api/data-admin/types
 * What the dropdown offers, with the count of records behind each one.
 */
const getTypes = async (req, res) => {
  try {
    const entries = await Promise.all(
      Object.entries(TYPES).map(async ([key, def]) => ({
        key,
        label: def.label,
        warning: def.warning || null,
        softDelete: !!def.softDelete,
        count: await def.model.countDocuments(def.baseFilter || {}),
      }))
    );
    return res.status(200).json({ success: true, data: entries });
  } catch (err) {
    console.error('Data admin types error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/data-admin/:type?search=&page=&limit=
 * The records of one type, described plainly enough to pick from.
 */
const listRecords = async (req, res) => {
  try {
    const def = TYPES[req.params.type];
    if (!def) return res.status(400).json({ success: false, message: 'Unknown record type.' });

    const { search = '', page = 1, limit = 25 } = req.query;
    const filter = { ...(def.baseFilter || {}) };
    if (search.trim() && def.searchFields?.length) {
      filter.$or = def.searchFields.map((f) => ({ [f]: { $regex: search.trim(), $options: 'i' } }));
    }

    const perPage = Math.min(100, Math.max(1, Number(limit) || 25));
    const skip = (Math.max(1, Number(page) || 1) - 1) * perPage;

    const [docs, total] = await Promise.all([
      def.model.find(filter).sort(def.sort || { _id: -1 }).skip(skip).limit(perPage).lean(),
      def.model.countDocuments(filter),
    ]);

    // Everything the screen needs goes inside `data`. The client unwraps
    // { success, data } and keeps only `data`, so anything sitting beside it
    // here — the pagination, the warning — never reached the browser at all.
    return res.status(200).json({
      success: true,
      data: {
        records: docs.map(def.row),
        warning: def.warning || null,
        softDelete: !!def.softDelete,
        pagination: { total, page: Number(page), limit: perPage, pages: Math.ceil(total / perPage) },
      },
    });
  } catch (err) {
    console.error('Data admin list error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/data-admin/:type/delete  { ids: [...] }
 * Deletes only the ids named — there is deliberately no "delete everything"
 * shortcut, and the audit log records who removed what.
 */
const deleteRecords = async (req, res) => {
  try {
    const def = TYPES[req.params.type];
    if (!def) return res.status(400).json({ success: false, message: 'Unknown record type.' });

    const ids = (req.body.ids || []).filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one record to delete.' });
    }
    if (ids.length > MAX_PER_DELETE) {
      return res.status(400).json({
        success: false,
        message: `Delete at most ${MAX_PER_DELETE} records at a time.`,
      });
    }

    let removed;
    if (def.softDelete) {
      const result = await def.model.updateMany({ _id: { $in: ids } }, { $set: { is_active: false } });
      removed = result.modifiedCount ?? 0;
    } else {
      const result = await def.model.deleteMany({ _id: { $in: ids } });
      removed = result.deletedCount ?? 0;
    }

    return res.status(200).json({
      success: true,
      message: def.softDelete
        ? `${removed} ${def.label.toLowerCase()} deactivated.`
        : `${removed} ${def.label.toLowerCase()} deleted.`,
      data: { removed },
    });
  } catch (err) {
    console.error('Data admin delete error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getTypes, listRecords, deleteRecords, TYPES, MAX_PER_DELETE };
