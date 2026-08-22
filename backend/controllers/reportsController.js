const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Product = require('../models/Product');
const Debt = require('../models/Debt');
const User = require('../models/User');
const StockRequest = require('../models/StockRequest');
const WorkerPayment = require('../models/WorkerPayment');
const Purchase = require('../models/Purchase');
const Refund = require('../models/Refund');
const Layaway = require('../models/Layaway');
const { generateReport, generatePriceList } = require('../utils/pdfGenerator');
const Settings = require('../models/Settings');

/**
 * GET /api/reports/dashboard-stats
 * Accessible to all authenticated roles.
 */
const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const isLimitedRole = ['Sales', 'Manager'].includes(req.user.role);
    const userId = req.user._id;

    if (isLimitedRole) {
      const [myTodaySalesAgg, myTodayExpensesAgg, myTodayLayawayAgg, outstandingDebtsCount, pendingStockCount, totalProducts, lowStockCount] = await Promise.all([
        Sale.aggregate([
          { $match: { user_id: userId, sale_date: { $gte: startOfToday } } },
          { $group: { _id: null, total: { $sum: '$total_amount' } } },
        ]),
        Expense.aggregate([
          { $match: { user_id: userId, expense_date: { $gte: startOfToday } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        // Pay & Pick Later instalments taken by this user today. No Sale is
        // written until the goods are released, so these would otherwise be
        // missing from the day's takings entirely.
        Layaway.aggregate([
          { $unwind: '$payments' },
          { $match: { 'payments.received_by': userId, 'payments.paid_at': { $gte: startOfToday } } },
          { $group: { _id: null, total: { $sum: '$payments.amount' } } },
        ]),
        Debt.countDocuments({ status: { $in: ['active', 'overdue'] } }),
        StockRequest.countDocuments({ status: 'pending' }),
        Product.countDocuments({ is_active: true }),
        Product.countDocuments({ is_active: true, $expr: { $lte: ['$quantity', '$low_stock_level'] } }),
      ]);
      return res.status(200).json({
        success: true,
        data: {
          myTodaySales: myTodaySalesAgg[0]?.total || 0,
          myTodayExpenses: myTodayExpensesAgg[0]?.total || 0,
          myTodayLayawayCollections: myTodayLayawayAgg[0]?.total || 0,
          outstandingDebts: outstandingDebtsCount,
          pendingStockRequests: pendingStockCount,
          totalProducts,
          lowStockCount,
        },
      });
    }

    // CEO / Super Admin — full stats
    const [
      todaySalesAgg, monthlySalesAgg, monthlyCOGSAgg,
      totalProducts, lowStockProducts,
      todayExpensesAgg, monthlyExpensesAgg,
      outstandingDebts, activeUsers,
      todayRefundsAgg, monthlyRefundsAgg,
      todayLayawayAgg, monthlyLayawayAgg,
    ] = await Promise.all([
      Sale.aggregate([{ $match: { sale_date: { $gte: startOfToday } } }, { $group: { _id: null, total: { $sum: '$total_amount' } } }]),
      Sale.aggregate([{ $match: { sale_date: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$total_amount' } } }]),
      Sale.aggregate([
        { $match: { sale_date: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', { $multiply: ['$$this.cost_price', '$$this.quantity'] }] } } } } } },
      ]),
      Product.countDocuments({ is_active: true }),
      Product.find({ is_active: true, $expr: { $lte: ['$quantity', '$low_stock_level'] } })
        .populate('category_id', 'name').sort({ quantity: 1 }).limit(10),
      Expense.aggregate([{ $match: { expense_date: { $gte: startOfToday } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { expense_date: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Debt.find({ status: { $in: ['active', 'overdue'] } }, 'amount_owed amount_paid'),
      User.countDocuments({ is_active: true }),
      // Only an approved refund reduces the day's sales; a pending request has not
      // given any money back yet.
      Refund.aggregate([{ $match: { status: 'approved', refund_date: { $gte: startOfToday } } }, { $group: { _id: null, total: { $sum: '$refund_amount' } } }]),
      Refund.aggregate([{ $match: { status: 'approved', refund_date: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$refund_amount' } } }]),
      // Pay & Pick Later instalments — cash in hand that no Sale records yet.
      Layaway.aggregate([
        { $unwind: '$payments' },
        { $match: { 'payments.paid_at': { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$payments.amount' } } },
      ]),
      Layaway.aggregate([
        { $unwind: '$payments' },
        { $match: { 'payments.paid_at': { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$payments.amount' } } },
      ]),
    ]);

    const todayRefunds = todayRefundsAgg[0]?.total || 0;
    const monthlyRefunds = monthlyRefundsAgg[0]?.total || 0;
    const todaySales = Math.max(0, (todaySalesAgg[0]?.total || 0) - todayRefunds);
    const monthlySales = Math.max(0, (monthlySalesAgg[0]?.total || 0) - monthlyRefunds);
    const monthlyCOGS = monthlyCOGSAgg[0]?.total || 0;
    const todayExpenses = todayExpensesAgg[0]?.total || 0;
    const monthlyExpenses = monthlyExpensesAgg[0]?.total || 0;
    const netProfit = monthlySales - monthlyCOGS - monthlyExpenses;
    const outstandingDebtAmount = outstandingDebts.reduce((sum, d) => sum + Math.max(0, (d.amount_owed || 0) - (d.amount_paid || 0)), 0);

    return res.status(200).json({
      success: true,
      data: {
        todaySales,
        monthlySales,
        totalProducts,
        lowStockCount: lowStockProducts.length,
        todayExpenses,
        netProfit,
        todayLayawayCollections: todayLayawayAgg[0]?.total || 0,
        monthlyLayawayCollections: monthlyLayawayAgg[0]?.total || 0,
        outstandingDebtAmount,
        activeUsers,
        lowStockProducts: lowStockProducts.map(p => ({
          _id: p._id,
          name: p.name,
          quantity: p.quantity,
          low_stock_level: p.low_stock_level,
          category: p.category_id,
        })),
      },
    });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/sales-trend?days=7
 * Accessible to all authenticated roles.
 */
const getSalesTrend = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const trend = await Sale.aggregate([
      { $match: { sale_date: { $gte: startDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sale_date' } }, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const found = trend.find(t => t._id === dateStr);
      result.push({ date: dateStr.slice(5), total: found?.total || 0, count: found?.count || 0 });
    }

    return res.status(200).json({ success: true, data: { trend: result } });
  } catch (err) {
    console.error('Sales trend error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const getDateFilter = (startDate, endDate) => {
  const filter = {};
  if (startDate || endDate) {
    filter.$gte = startDate ? new Date(startDate) : new Date('2000-01-01');
    filter.$lte = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
  }
  return Object.keys(filter).length > 0 ? filter : null;
};

/**
 * GET /api/reports/daily-sales
 */
const getDailySales = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);
    const match = {};
    if (dateFilter) match.sale_date = dateFilter;

    const dailySales = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$sale_date' } },
          total_revenue: { $sum: '$total_amount' },
          total_transactions: { $sum: 1 },
          total_cost: { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', { $multiply: ['$$this.cost_price', '$$this.quantity'] }] } } } },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    const salesByUser = await Sale.aggregate([
      { $match: match },
      { $group: { _id: '$user_id', total_revenue: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { username: '$user.username', total_revenue: 1, count: 1 } },
    ]);

    return res.status(200).json({ success: true, data: { daily: dailySales, by_user: salesByUser } });
  } catch (err) {
    console.error('Daily sales report error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/sales-by-user
 */
const getSalesByUser = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);
    const match = {};
    if (dateFilter) match.sale_date = dateFilter;

    const data = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$user_id',
          total_revenue: { $sum: '$total_amount' },
          transactions: { $sum: 1 },
          avg_sale: { $avg: '$total_amount' },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { username: '$user.username', email: '$user.email', total_revenue: 1, transactions: 1, avg_sale: 1 } },
      { $sort: { total_revenue: -1 } },
    ]);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Sales by user report error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/top-products
 */
const getTopProducts = async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);
    const match = {};
    if (dateFilter) match.sale_date = dateFilter;

    const data = await Sale.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product_id',
          product_name: { $first: '$items.product_name' },
          total_quantity: { $sum: '$items.quantity' },
          total_revenue: { $sum: '$items.total' },
          total_cost: { $sum: { $multiply: ['$items.cost_price', '$items.quantity'] } },
        },
      },
      { $addFields: { profit: { $subtract: ['$total_revenue', '$total_cost'] } } },
      { $sort: { total_quantity: -1 } },
      { $limit: Number(limit) },
    ]);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Top products report error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/profit-loss
 */
const getProfitLoss = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);
    const saleMatch = {};
    const expenseMatch = {};
    if (dateFilter) {
      saleMatch.sale_date = dateFilter;
      expenseMatch.expense_date = dateFilter;
    }

    const [salesAgg, expensesAgg] = await Promise.all([
      Sale.aggregate([
        { $match: saleMatch },
        {
          $group: {
            _id: null,
            total_revenue: { $sum: '$total_amount' },
            total_cogs: { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', { $multiply: ['$$this.cost_price', '$$this.quantity'] }] } } } },
            transactions: { $sum: 1 },
          },
        },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: null, total_expenses: { $sum: '$amount' } } },
      ]),
    ]);

    const revenue = salesAgg[0]?.total_revenue || 0;
    const cogs = salesAgg[0]?.total_cogs || 0;
    const gross_profit = revenue - cogs;
    const total_expenses = expensesAgg[0]?.total_expenses || 0;
    const net_profit = gross_profit - total_expenses;

    return res.status(200).json({
      success: true,
      data: {
        revenue,
        cogs,
        gross_profit,
        gross_margin: revenue > 0 ? ((gross_profit / revenue) * 100).toFixed(2) : 0,
        total_expenses,
        net_profit,
        net_margin: revenue > 0 ? ((net_profit / revenue) * 100).toFixed(2) : 0,
        transactions: salesAgg[0]?.transactions || 0,
      },
    });
  } catch (err) {
    console.error('Profit loss report error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/debtors
 */
const getDebtors = async (req, res) => {
  try {
    const debts = await Debt.find({ status: { $in: ['active', 'overdue'] } })
      .populate('sale_id', 'invoice_no sale_date')
      .populate('created_by', 'username')
      .sort({ due_date: 1 });

    const total_outstanding = debts.reduce((sum, d) => sum + (d.amount_owed - d.amount_paid), 0);
    return res.status(200).json({ success: true, data: { debts, total_outstanding } });
  } catch (err) {
    console.error('Debtors report error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/stock-valuation
 */
const getStockValuation = async (req, res) => {
  try {
    const products = await Product.find({ is_active: true })
      .populate('category_id', 'name')
      .sort({ name: 1 });

    const items = products.map((p) => ({
      name: p.name,
      quantity: p.quantity,
      cost_price: p.cost_price,
      selling_price: p.selling_price,
      cost_value: p.quantity * p.cost_price,
      selling_value: p.quantity * p.selling_price,
      potential_profit: p.quantity * (p.selling_price - p.cost_price),
      category: p.category_id?.name || 'Uncategorized',
    }));

    const total_cost_value = items.reduce((sum, i) => sum + i.cost_value, 0);
    const total_selling_value = items.reduce((sum, i) => sum + i.selling_value, 0);
    const total_potential_profit = items.reduce((sum, i) => sum + i.potential_profit, 0);

    return res.status(200).json({
      success: true,
      data: { items, total_cost_value, total_selling_value, total_potential_profit },
    });
  } catch (err) {
    console.error('Stock valuation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/expense-breakdown
 */
const getExpenseBreakdown = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);
    const match = {};
    if (dateFilter) match.expense_date = dateFilter;

    const data = await Expense.aggregate([
      { $match: match },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    const grand_total = data.reduce((sum, d) => sum + d.total, 0);
    return res.status(200).json({ success: true, data: { by_category: data, grand_total } });
  } catch (err) {
    console.error('Expense breakdown error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/export/excel/:reportType
 */
const exportData = async (req, res) => {
  try {
    const { reportType } = req.params;
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    let data = [];

    if (reportType === 'sales') {
      const match = {};
      if (dateFilter) match.sale_date = dateFilter;
      data = await Sale.find(match).populate('user_id', 'username').lean();
    } else if (reportType === 'expenses') {
      const match = {};
      if (dateFilter) match.expense_date = dateFilter;
      data = await Expense.find(match).populate('user_id', 'username').lean();
    } else if (reportType === 'products') {
      data = await Product.find({ is_active: true }).populate('category_id', 'name').lean();
    } else if (reportType === 'debts') {
      data = await Debt.find().lean();
    }

    return res.status(200).json({ success: true, data, report_type: reportType });
  } catch (err) {
    console.error('Export error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/financial-overview
 */
const getFinancialOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);
    const saleMatch = {};
    const expenseMatch = {};
    const purchaseMatch = {};
    const workerMatch = {};
    if (dateFilter) {
      saleMatch.sale_date = dateFilter;
      expenseMatch.expense_date = dateFilter;
      purchaseMatch.createdAt = dateFilter;
      workerMatch.payment_date = dateFilter;
    }

    const layawayMatch = dateFilter ? [{ $match: { 'payments.paid_at': dateFilter } }] : [];

    const [salesAgg, expensesAgg, expensesByCategory, purchasesAgg, workerAgg, layawayAgg] = await Promise.all([
      Sale.aggregate([
        { $match: saleMatch },
        {
          $group: {
            _id: null,
            total_revenue: { $sum: '$total_amount' },
            total_discount: { $sum: { $ifNull: ['$discount_amount', 0] } },
            total_cogs: { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', { $multiply: ['$$this.cost_price', '$$this.quantity'] }] } } } },
          },
        },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $project: { category: '$_id', total: 1, _id: 0 } },
      ]),
      Purchase.aggregate([
        { $match: purchaseMatch },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]),
      WorkerPayment.aggregate([
        { $match: workerMatch },
        { $group: { _id: null, total: { $sum: '$amount_paid' } } },
      ]),
      Layaway.aggregate([
        { $unwind: '$payments' },
        ...layawayMatch,
        { $group: { _id: null, total: { $sum: '$payments.amount' } } },
      ]),
    ]);

    const totalRevenue = salesAgg[0]?.total_revenue || 0;
    const grossRevenue = totalRevenue;
    const discounts = salesAgg[0]?.total_discount || 0;
    const cogs = salesAgg[0]?.total_cogs || 0;
    const grossProfit = totalRevenue - cogs;
    const totalExpenses = expensesAgg[0]?.total || 0;
    const purchases = purchasesAgg[0]?.total || 0;
    const workerPayments = workerAgg[0]?.total || 0;
    // Money received against Pay & Pick Later agreements. Reported separately
    // rather than folded into revenue: the goods have not been released, so
    // there is no matching cost of sale and adding it to revenue would
    // overstate both turnover and profit. It becomes revenue as a normal sale
    // when the goods are collected.
    const layawayCollections = layawayAgg[0]?.total || 0;
    const netProfit = grossProfit - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalRevenue,
        grossRevenue,
        discounts,
        cogs,
        grossProfit,
        totalExpenses,
        netProfit,
        profitMargin,
        purchases,
        workerPayments,
        layawayCollections,
        expensesByCategory,
      },
    });
  } catch (err) {
    console.error('Financial overview error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/reports/cash-flow
 */
const getCashFlow = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);
    const saleMatch = {};
    const expenseMatch = {};
    const debtPaymentMatch = {};
    if (dateFilter) {
      saleMatch.sale_date = dateFilter;
      expenseMatch.expense_date = dateFilter;
    }

    // Pay & Pick Later money is taken over the counter like any other cash, but
    // no Sale is written until the goods are released — so without this the
    // day's takings were understated by every instalment collected.
    const layawayPaymentStage = dateFilter ? [{ $match: { 'payments.paid_at': dateFilter } }] : [];

    const [salesAgg, expensesAgg, debtPayments, layawayPayments, dailySales, dailyExpenses, dailyLayaway] = await Promise.all([
      Sale.aggregate([
        { $match: { ...saleMatch, payment_status: { $in: ['paid', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Debt.aggregate([
        { $unwind: '$payments' },
        ...(dateFilter ? [{ $match: { 'payments.payment_date': dateFilter } }] : []),
        { $group: { _id: null, total: { $sum: '$payments.amount' } } },
      ]),
      Layaway.aggregate([
        { $unwind: '$payments' },
        ...layawayPaymentStage,
        { $group: { _id: null, total: { $sum: '$payments.amount' } } },
      ]),
      Sale.aggregate([
        { $match: saleMatch },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sale_date' } }, inflow: { $sum: '$total_amount' } } },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$expense_date' } }, outflow: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ]),
      Layaway.aggregate([
        { $unwind: '$payments' },
        ...layawayPaymentStage,
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$payments.paid_at' } }, inflow: { $sum: '$payments.amount' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const salesInflow = salesAgg[0]?.total || 0;
    const expenseOutflow = expensesAgg[0]?.total || 0;
    const debtCollections = debtPayments[0]?.total || 0;
    const layawayCollections = layawayPayments[0]?.total || 0;
    const netCashFlow = salesInflow + debtCollections + layawayCollections - expenseOutflow;

    // Merge daily inflow/outflow
    const dateMap = {};
    const bucket = (d) => (dateMap[d] ||= { date: d, inflow: 0, outflow: 0 });
    dailySales.forEach(d => { bucket(d._id).inflow += d.inflow; });
    dailyLayaway.forEach(d => { bucket(d._id).inflow += d.inflow; });
    dailyExpenses.forEach(d => { bucket(d._id).outflow += d.outflow; });
    const trend = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

    return res.status(200).json({
      success: true,
      data: { salesInflow, debtCollections, layawayCollections, expenseOutflow, netCashFlow, trend },
    });
  } catch (err) {
    console.error('Cash flow error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};


/**
 * GET /api/reports/price-list
 *
 * A printable list of what the shop sells and what it costs the customer.
 * Selling prices only — cost price, margin and supplier are deliberately never
 * read here, so the sheet is safe to hand to a customer.
 *
 * Query: ?category=<id>&in_stock_only=true
 */
const getPriceList = async (req, res) => {
  try {
    const { category, in_stock_only } = req.query;

    const filter = { is_active: true };
    if (category) filter.category_id = category;
    if (in_stock_only === 'true') filter.quantity = { $gt: 0 };

    const products = await Product.find(filter)
      .select('name selling_price quantity category_id has_variants variants')
      .populate('category_id', 'name')
      .sort({ name: 1 })
      .lean();

    // Group by category so the printed sheet is easy to scan.
    const byCategory = new Map();
    for (const p of products) {
      const cat = p.category_id?.name || 'Uncategorised';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      const bucket = byCategory.get(cat);

      if (p.has_variants && p.variants?.length) {
        // A product with variants is sold as its variants, each with its own price.
        p.variants
          .filter((v) => v.is_active !== false)
          .forEach((v) => bucket.push({
            name: `${p.name} — ${v.name}`,
            price: v.selling_price,
            in_stock: v.quantity > 0,
          }));
      } else {
        bucket.push({ name: p.name, price: p.selling_price, in_stock: p.quantity > 0 });
      }
    }

    const groups = [...byCategory.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, list]) => ({ category: cat, products: list.sort((a, b) => a.name.localeCompare(b.name)) }));

    const settings = (await Settings.findOne().lean()) || {};
    const pdf = await generatePriceList(groups, {
      logoUrl: settings.logo_url,
      company: {
        name: settings.company_name,
        address: settings.company_address,
        phone: settings.company_phone,
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="price-list.pdf"');
    return res.end(pdf);
  } catch (err) {
    console.error('Price list error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error generating the price list.' });
  }
};

module.exports = {
  getPriceList,
  getDashboardStats, getSalesTrend,
  getDailySales, getSalesByUser, getTopProducts, getProfitLoss,
  getDebtors, getStockValuation, getExpenseBreakdown, exportData,
  getFinancialOverview, getCashFlow,
};
