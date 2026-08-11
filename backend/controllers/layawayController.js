const crypto = require('crypto');
const Layaway = require('../models/Layaway');
const Notification = require('../models/Notification');
const { buildSaleItems, deductStock, restoreStock } = require('../utils/saleHelpers');

const makeReference = () => `LAY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const FREQUENCY_DAYS = { weekly: 7, biweekly: 14, monthly: 30 };

/** Build the due-date schedule for the outstanding balance. */
const buildSchedule = (balance, installments, frequency, startDate) => {
  const days = FREQUENCY_DAYS[frequency] || 7;
  const per = Number((balance / installments).toFixed(2));
  const schedule = [];
  let allocated = 0;

  for (let i = 1; i <= installments; i++) {
    const due = new Date(startDate);
    due.setDate(due.getDate() + i * days);
    // Last entry absorbs the rounding remainder so the schedule sums exactly.
    const amount = i === installments ? Number((balance - allocated).toFixed(2)) : per;
    allocated += amount;
    schedule.push({ due_date: due, amount, paid: false });
  }
  return schedule;
};

/**
 * POST /api/layaways — reserve goods against a payment plan.
 * Stock is deducted up front so reserved items can't be sold twice.
 */
const createLayaway = async (req, res) => {
  try {
    const {
      customer_name, customer_phone, cart, down_payment = 0,
      installments = 4, frequency = 'weekly', payment_method = 'cash',
    } = req.body;

    if (!customer_name || !customer_phone) {
      return res.status(400).json({ success: false, message: 'Customer name and phone are required.' });
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart cannot be empty.' });
    }

    const built = await buildSaleItems(cart);
    if (built.error) return res.status(400).json({ success: false, message: built.error });

    const items = built.items.map(({ cost_price, ...rest }) => rest); // no cost prices on a customer record
    const total = Number(built.items.reduce((sum, i) => sum + i.total, 0).toFixed(2));
    const down = Math.min(Number(down_payment) || 0, total);
    const balance = Number((total - down).toFixed(2));
    const count = Math.max(1, Number(installments) || 1);

    const start = new Date();
    const schedule = balance > 0 ? buildSchedule(balance, count, frequency, start) : [];

    const layaway = await Layaway.create({
      reference: makeReference(),
      customer_name,
      customer_phone,
      items,
      total_amount: total,
      down_payment: down,
      amount_paid: down,
      balance,
      frequency,
      installments: count,
      installment_amount: schedule[0]?.amount || 0,
      schedule,
      next_due_date: schedule[0]?.due_date || null,
      due_date: schedule[schedule.length - 1]?.due_date || null,
      status: balance <= 0 ? 'completed' : 'active',
      payments: down > 0
        ? [{ amount: down, method: payment_method, received_by: req.user._id, reference: 'Down payment' }]
        : [],
      created_by: req.user._id,
    });

    await deductStock(built.items);

    await Notification.create({
      user_id: null,
      type: 'info',
      title: 'New Layaway',
      message: `${customer_name} — ${layaway.reference}, balance GH₵${balance.toFixed(2)}`,
      link: `/layaways/${layaway._id}`,
    });

    return res.status(201).json({ success: true, message: 'Layaway created.', data: layaway });
  } catch (err) {
    console.error('Create layaway error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error creating layaway.' });
  }
};

/** GET /api/layaways */
const getLayaways = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { customer_name: { $regex: search, $options: 'i' } },
        { customer_phone: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [layaways, total] = await Promise.all([
      Layaway.find(filter).populate('created_by', 'username').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Layaway.countDocuments(filter),
    ]);

    const summary = {
      active: await Layaway.countDocuments({ status: 'active' }),
      overdue: await Layaway.countDocuments({ status: 'active', next_due_date: { $lt: new Date() } }),
      outstanding: (await Layaway.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$balance' } } },
      ]))[0]?.total || 0,
    };

    return res.status(200).json({
      success: true,
      data: layaways,
      summary,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get layaways error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/layaways/:id */
const getLayaway = async (req, res) => {
  try {
    const layaway = await Layaway.findById(req.params.id)
      .populate('created_by', 'username')
      .populate('payments.received_by', 'username');
    if (!layaway) return res.status(404).json({ success: false, message: 'Layaway not found.' });
    return res.status(200).json({ success: true, data: layaway });
  } catch (err) {
    console.error('Get layaway error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/layaways/:id/payments — record an installment. */
const addPayment = async (req, res) => {
  try {
    const { amount, method = 'cash', reference } = req.body;
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ success: false, message: 'Enter a payment amount greater than zero.' });
    }

    const layaway = await Layaway.findById(req.params.id);
    if (!layaway) return res.status(404).json({ success: false, message: 'Layaway not found.' });
    if (layaway.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This layaway was cancelled.' });
    }
    if (value > layaway.balance + 0.05) {
      return res.status(400).json({
        success: false,
        message: `Payment exceeds the outstanding balance of GH₵${layaway.balance.toFixed(2)}.`,
      });
    }

    layaway.payments.push({ amount: value, method, reference, received_by: req.user._id });
    layaway.recalculate();
    await layaway.save();

    if (layaway.status === 'completed') {
      await Notification.create({
        user_id: null,
        type: 'info',
        title: 'Layaway Fully Paid',
        message: `${layaway.customer_name} completed ${layaway.reference} — ready for collection.`,
        link: `/layaways/${layaway._id}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: layaway.status === 'completed' ? 'Paid in full — goods ready for collection.' : 'Payment recorded.',
      data: layaway,
    });
  } catch (err) {
    console.error('Layaway payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/layaways/:id/collect — hand the goods over once paid off. */
const collectLayaway = async (req, res) => {
  try {
    const layaway = await Layaway.findById(req.params.id);
    if (!layaway) return res.status(404).json({ success: false, message: 'Layaway not found.' });

    if (layaway.balance > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot release goods — GH₵${layaway.balance.toFixed(2)} still outstanding.`,
      });
    }
    if (layaway.collected) {
      return res.status(400).json({ success: false, message: 'These goods were already collected.' });
    }

    layaway.collected = true;
    layaway.collected_at = new Date();
    layaway.status = 'completed';
    await layaway.save();

    return res.status(200).json({ success: true, message: 'Goods released to customer.', data: layaway });
  } catch (err) {
    console.error('Collect layaway error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/layaways/:id/cancel — abandon the plan and return goods to stock.
 * Deliberately does NOT auto-refund: what happens to money already paid is a
 * shop policy decision, so it is reported and left to a human.
 */
const cancelLayaway = async (req, res) => {
  try {
    const { reason } = req.body;
    const layaway = await Layaway.findById(req.params.id);
    if (!layaway) return res.status(404).json({ success: false, message: 'Layaway not found.' });
    if (layaway.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Already cancelled.' });
    }
    if (layaway.collected) {
      return res.status(400).json({ success: false, message: 'Goods already collected — process a refund instead.' });
    }

    await restoreStock(layaway.items);

    layaway.status = 'cancelled';
    layaway.cancelled_reason = reason || 'No reason given';
    await layaway.save();

    return res.status(200).json({
      success: true,
      message: `Cancelled and stock returned. GH₵${layaway.amount_paid.toFixed(2)} was already paid — handle any refund separately.`,
      data: layaway,
    });
  } catch (err) {
    console.error('Cancel layaway error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { createLayaway, getLayaways, getLayaway, addPayment, collectLayaway, cancelLayaway };
