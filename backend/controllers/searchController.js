const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Debt = require('../models/Debt');
const Expense = require('../models/Expense');
const CreditAgreement = require('../models/CreditAgreement');

const ROLE_LEVELS = { 'Super Admin': 4, CEO: 3, Manager: 2, Sales: 1 };

/**
 * POST /api/search
 * Universal search across collections based on role.
 */
const universalSearch = async (req, res) => {
  try {
    const { query, startDate, endDate, limit = 10 } = req.body;
    if (!query && !startDate && !endDate) {
      return res.status(400).json({ success: false, message: 'Search query or date range required.' });
    }

    const userLevel = ROLE_LEVELS[req.user.role] || 0;
    const results = { products: [], sales: [], debts: [], expenses: [], creditAgreements: [] };

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.$gte = startDate ? new Date(startDate) : new Date('2000-01-01');
      dateFilter.$lte = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
    }

    // Products - all roles
    if (query) {
      results.products = await Product.find({
        is_active: true,
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { barcode: { $regex: query, $options: 'i' } },
        ],
      }).limit(Number(limit)).select('name barcode selling_price quantity');
    }

    // Sales
    if (userLevel >= 1) {
      const saleFilter = {};
      if (req.user.role === 'Sales') saleFilter.user_id = req.user._id;
      if (Object.keys(dateFilter).length > 0) saleFilter.sale_date = dateFilter;
      if (query) {
        saleFilter.$or = [
          { invoice_no: { $regex: query, $options: 'i' } },
          { customer_name: { $regex: query, $options: 'i' } },
          { customer_phone: { $regex: query, $options: 'i' } },
        ];
      }
      results.sales = await Sale.find(saleFilter)
        .populate('user_id', 'username')
        .limit(Number(limit))
        .select('invoice_no customer_name total_amount sale_date payment_status');
    }

    // Expenses - Manager and above (all), Sales (own only)
    if (userLevel >= 1) {
      const expFilter = {};
      if (req.user.role === 'Sales') expFilter.user_id = req.user._id;
      if (Object.keys(dateFilter).length > 0) expFilter.expense_date = dateFilter;
      if (query) expFilter.$or = [
        { description: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } },
      ];
      results.expenses = await Expense.find(expFilter)
        .populate('user_id', 'username')
        .limit(Number(limit))
        .select('category amount description expense_date');
    }

    // Debts - Manager and above
    if (userLevel >= 2) {
      const debtFilter = {};
      if (Object.keys(dateFilter).length > 0) debtFilter.createdAt = dateFilter;
      if (query) debtFilter.$or = [
        { customer_name: { $regex: query, $options: 'i' } },
        { customer_phone: { $regex: query, $options: 'i' } },
      ];
      results.debts = await Debt.find(debtFilter)
        .limit(Number(limit))
        .select('customer_name customer_phone amount_owed amount_paid status');
    }

    // Credit Agreements - Manager and above
    if (userLevel >= 2) {
      const caFilter = {};
      if (Object.keys(dateFilter).length > 0) caFilter.createdAt = dateFilter;
      if (query) caFilter.$or = [
        { customer_name: { $regex: query, $options: 'i' } },
        { customer_phone: { $regex: query, $options: 'i' } },
        { product_description: { $regex: query, $options: 'i' } },
      ];
      results.creditAgreements = await CreditAgreement.find(caFilter)
        .limit(Number(limit))
        .select('customer_name customer_phone total_amount remaining status');
    }

    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error('Universal search error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/search/suggestions
 * Autocomplete for product name/barcode.
 */
const getSuggestions = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.length < 2) {
      return res.status(200).json({ success: true, data: [] });
    }

    const products = await Product.find({
      is_active: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { barcode: { $regex: q, $options: 'i' } },
      ],
    })
      .limit(Number(limit))
      .select('name barcode selling_price quantity is_low_stock');

    return res.status(200).json({ success: true, data: products });
  } catch (err) {
    console.error('Suggestions error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { universalSearch, getSuggestions };
