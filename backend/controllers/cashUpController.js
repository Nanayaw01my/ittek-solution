const CashUp = require('../models/CashUp');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Refund = require('../models/Refund');

/** Midnight of whatever day the date falls in. */
const dayStart = (d) => {
  const start = new Date(d || Date.now());
  start.setHours(0, 0, 0, 0);
  return start;
};
const dayEnd = (d) => {
  const end = new Date(d || Date.now());
  end.setHours(23, 59, 59, 999);
  return end;
};

/**
 * What the system believes came in on a given day, split by tender.
 *
 * A sale settled with more than one tender carries the breakdown in
 * `payments` and 'split' in `payment_method`, so those are unpacked rather
 * than counted whole against a method that does not exist in the drawer.
 */
const reckonDay = async (date) => {
  const from = dayStart(date);
  const to = dayEnd(date);

  const [sales, expenseAgg, refundAgg] = await Promise.all([
    Sale.find({ sale_date: { $gte: from, $lte: to } })
      .select('total_amount payment_method payments')
      .lean(),
    Expense.aggregate([
      { $match: { expense_date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Refund.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$refund_amount' } } },
    ]),
  ]);

  const tender = { cash: 0, mobile_money: 0, card: 0 };
  for (const sale of sales) {
    if (sale.payment_method === 'split' && Array.isArray(sale.payments) && sale.payments.length) {
      for (const part of sale.payments) {
        if (tender[part.method] !== undefined) tender[part.method] += Number(part.amount) || 0;
      }
    } else if (tender[sale.payment_method] !== undefined) {
      tender[sale.payment_method] += Number(sale.total_amount) || 0;
    }
  }

  const expenses = expenseAgg[0]?.total || 0;
  const refunds = refundAgg[0]?.total || 0;

  return {
    cash: Number(tender.cash.toFixed(2)),
    mobile_money: Number(tender.mobile_money.toFixed(2)),
    card: Number(tender.card.toFixed(2)),
    expenses: Number(expenses.toFixed(2)),
    refunds: Number(refunds.toFixed(2)),
    // Money paid out of the drawer leaves the drawer, so it is not expected
    // to still be in it at closing.
    cash_in_hand: Number((tender.cash - expenses - refunds).toFixed(2)),
    sales_count: sales.length,
  };
};

/**
 * GET /api/cash-up/today?date=YYYY-MM-DD
 * What the drawer should hold, and the cash-up if the day is already closed.
 */
const getDayReckoning = async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ success: false, message: 'Bad date.' });
    }

    const [expected, existing] = await Promise.all([
      reckonDay(date),
      CashUp.findOne({ business_date: dayStart(date) }).populate('closed_by', 'username'),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        business_date: dayStart(date),
        expected,
        // Present when the day has already been closed — the screen then shows
        // the record instead of the form.
        cash_up: existing || null,
      },
    });
  } catch (err) {
    console.error('Cash-up reckoning error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/cash-up — the closed days, newest first. */
const getCashUps = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [records, total] = await Promise.all([
      CashUp.find()
        .populate('closed_by', 'username')
        .sort({ business_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      CashUp.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        records,
        pagination: {
          total, page: Number(page), limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
    });
  } catch (err) {
    console.error('Get cash-ups error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/cash-up
 *
 * Closing the day. What the system expected is worked out here rather than
 * taken from the browser: a figure the person closing could edit is not a
 * figure worth counting against.
 */
const closeDay = async (req, res) => {
  try {
    const { date, counted, float_kept, note } = req.body;
    const when = date ? new Date(date) : new Date();
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ success: false, message: 'Bad date.' });
    }

    const business_date = dayStart(when);
    const already = await CashUp.findOne({ business_date });
    if (already) {
      return res.status(400).json({
        success: false,
        message: 'This day has already been closed.',
      });
    }

    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0;
    };

    const expected = await reckonDay(when);
    const record = await CashUp.create({
      business_date,
      expected,
      counted: {
        cash: num(counted?.cash),
        mobile_money: num(counted?.mobile_money),
        card: num(counted?.card),
      },
      float_kept: num(float_kept),
      note,
      closed_by: req.user._id,
      closed_at: new Date(),
    });

    const off = record.variance.total;
    return res.status(201).json({
      success: true,
      message: Math.abs(off) < 0.005
        ? 'Day closed — everything balances.'
        : `Day closed — ${off > 0 ? 'over' : 'short'} by GHC${Math.abs(off).toFixed(2)}.`,
      data: record,
    });
  } catch (err) {
    console.error('Close day error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not close: ${err.message}` });
  }
};

/** DELETE /api/cash-up/:id — reopen a day that was closed in error. */
const reopenDay = async (req, res) => {
  try {
    const record = await CashUp.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Cash-up not found.' });
    }
    const { business_date } = record;
    await record.deleteOne();
    return res.status(200).json({
      success: true,
      message: 'Day reopened — it can be counted again.',
      data: { business_date },
    });
  } catch (err) {
    console.error('Reopen day error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getDayReckoning, getCashUps, closeDay, reopenDay, reckonDay };
