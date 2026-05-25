const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Debt = require('../models/Debt');
const Product = require('../models/Product');

const getDateRange = (startDate, endDate) => {
  const range = {};
  if (startDate || endDate) {
    range.$gte = startDate ? new Date(startDate) : new Date('2000-01-01');
    range.$lte = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
  }
  return Object.keys(range).length > 0 ? range : null;
};

/**
 * GET /api/financial/dashboard
 */
const getDashboard = async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    const [todaySales, monthSales, monthExpenses, totalDebts, stockValue] = await Promise.all([
      Sale.aggregate([
        { $match: { sale_date: { $gte: startOfToday, $lte: endOfToday } } },
        { $group: { _id: null, revenue: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { sale_date: { $gte: startOfMonth, $lte: endOfMonth } } },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total_amount' },
            cogs: { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', { $multiply: ['$$this.cost_price', '$$this.quantity'] }] } } } },
            count: { $sum: 1 },
          },
        },
      ]),
      Expense.aggregate([
        { $match: { expense_date: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Debt.aggregate([
        { $match: { status: { $in: ['active', 'overdue'] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$amount_owed', '$amount_paid'] } }, count: { $sum: 1 } } },
      ]),
      Product.aggregate([
        { $match: { is_active: true } },
        {
          $group: {
            _id: null,
            cost_value: { $sum: { $multiply: ['$quantity', '$cost_price'] } },
            selling_value: { $sum: { $multiply: ['$quantity', '$selling_price'] } },
          },
        },
      ]),
    ]);

    const monthRevenue = monthSales[0]?.revenue || 0;
    const monthCOGS = monthSales[0]?.cogs || 0;
    const monthGrossProfit = monthRevenue - monthCOGS;
    const monthExpense = monthExpenses[0]?.total || 0;
    const monthNetProfit = monthGrossProfit - monthExpense;

    return res.status(200).json({
      success: true,
      data: {
        today: {
          revenue: todaySales[0]?.revenue || 0,
          transactions: todaySales[0]?.count || 0,
        },
        this_month: {
          revenue: monthRevenue,
          cogs: monthCOGS,
          gross_profit: monthGrossProfit,
          expenses: monthExpense,
          net_profit: monthNetProfit,
          transactions: monthSales[0]?.count || 0,
        },
        outstanding_debts: {
          total: totalDebts[0]?.total || 0,
          count: totalDebts[0]?.count || 0,
        },
        inventory: {
          cost_value: stockValue[0]?.cost_value || 0,
          selling_value: stockValue[0]?.selling_value || 0,
        },
      },
    });
  } catch (err) {
    console.error('Financial dashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/financial/profit-loss
 */
const getProfitLoss = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateRange = getDateRange(startDate, endDate);

    const saleMatch = dateRange ? { sale_date: dateRange } : {};
    const expenseMatch = dateRange ? { expense_date: dateRange } : {};

    const [salesData, expensesData] = await Promise.all([
      Sale.aggregate([
        { $match: saleMatch },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total_amount' },
            cogs: { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', { $multiply: ['$$this.cost_price', '$$this.quantity'] }] } } } },
          },
        },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: '$category', amount: { $sum: '$amount' } } },
        { $sort: { amount: -1 } },
      ]),
    ]);

    const revenue = salesData[0]?.revenue || 0;
    const cogs = salesData[0]?.cogs || 0;
    const gross_profit = revenue - cogs;
    const total_expenses = expensesData.reduce((sum, e) => sum + e.amount, 0);
    const net_profit = gross_profit - total_expenses;

    return res.status(200).json({
      success: true,
      data: {
        revenue,
        cogs,
        gross_profit,
        gross_margin: revenue > 0 ? ((gross_profit / revenue) * 100).toFixed(2) : 0,
        expenses: expensesData,
        total_expenses,
        net_profit,
        net_margin: revenue > 0 ? ((net_profit / revenue) * 100).toFixed(2) : 0,
      },
    });
  } catch (err) {
    console.error('P&L error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/financial/balance-sheet
 */
const getBalanceSheet = async (req, res) => {
  try {
    const [stockValue, totalDebts, salesRevenue, totalExpenses] = await Promise.all([
      Product.aggregate([
        { $match: { is_active: true } },
        { $group: { _id: null, cost_value: { $sum: { $multiply: ['$quantity', '$cost_price'] } } } },
      ]),
      Debt.aggregate([
        { $match: { status: { $in: ['active', 'overdue'] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$amount_owed', '$amount_paid'] } } } },
      ]),
      Sale.aggregate([{ $group: { _id: null, revenue: { $sum: '$total_amount' } } }]),
      Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const inventory = stockValue[0]?.cost_value || 0;
    const receivables = totalDebts[0]?.total || 0;
    const total_assets = inventory + receivables;

    const revenue = salesRevenue[0]?.revenue || 0;
    const expenses = totalExpenses[0]?.total || 0;
    const retained_earnings = revenue - expenses;

    return res.status(200).json({
      success: true,
      data: {
        assets: {
          inventory,
          receivables,
          total: total_assets,
        },
        liabilities: {
          total: 0, // No liability tracking currently
        },
        equity: {
          retained_earnings,
          total: retained_earnings,
        },
      },
    });
  } catch (err) {
    console.error('Balance sheet error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/financial/cash-flow
 */
const getCashFlow = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateRange = getDateRange(startDate, endDate);

    const saleMatch = dateRange ? { sale_date: dateRange } : {};
    const expenseMatch = dateRange ? { expense_date: dateRange } : {};

    const [salesInflow, expenseOutflow, debtInflow] = await Promise.all([
      Sale.aggregate([
        { $match: { ...saleMatch, payment_status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Sale.aggregate([
        { $match: { ...saleMatch, payment_status: 'debt_payment' } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]),
    ]);

    const total_inflow = (salesInflow[0]?.total || 0) + (debtInflow[0]?.total || 0);
    const total_outflow = expenseOutflow[0]?.total || 0;
    const net_cash = total_inflow - total_outflow;

    return res.status(200).json({
      success: true,
      data: {
        inflows: {
          sales: salesInflow[0]?.total || 0,
          debt_collections: debtInflow[0]?.total || 0,
          total: total_inflow,
        },
        outflows: {
          expenses: total_outflow,
          total: total_outflow,
        },
        net_cash,
      },
    });
  } catch (err) {
    console.error('Cash flow error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getDashboard, getProfitLoss, getBalanceSheet, getCashFlow };
