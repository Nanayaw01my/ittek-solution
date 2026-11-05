const PackagePlan = require('../models/PackagePlan');
const Sale = require('../models/Sale');
const Notification = require('../models/Notification');
const { isOwner } = require('../middleware/rbac');
const { PLAN_SETS } = require('../config/installmentPlans');

/**
 * Packages bought on instalments, and the money paid against them.
 *
 * The one rule worth stating: a payment is money, so it writes a Sale. The
 * day's takings are the sum of the day's sales, so a payment that does not
 * write one is money the shop took and cannot see. Debt payments have worked
 * this way for a long time and this follows them exactly.
 */

/** Two decimal places, and never NaN. */
const money = (n) => Number((Number(n) || 0).toFixed(2));

/**
 * What the counter actually taps.
 *
 * 'full' and 'half' are the whole point of the feature: a customer pays the
 * instalment, or half of it now and the rest before the month is out. The
 * figure comes from the plan rather than from the browser, so a tampered or
 * stale screen cannot decide what half of anything is.
 */
const amountFor = (plan, portion, typed) => {
  const scheduled = Number(plan.installment_amount) || 0;
  if (portion === 'full') return money(scheduled);
  if (portion === 'half') return money(scheduled / 2);
  return money(typed);
};

/**
 * The Sale that puts a payment into the day.
 *
 * It carries no items: nothing left the shelf today. The goods went when the
 * package was handed over, and counting them again here would turn one
 * freezer into four.
 */
const recordAsSale = async (plan, payment, user) => {
  const now = payment.payment_date || new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const invoice = `PKG-${datePart}-${String(plan._id).slice(-4).toUpperCase()}-${String(payment._id).slice(-4).toUpperCase()}`;

  return Sale.create({
    invoice_no: invoice,
    user_id: user._id,
    customer_name: plan.customer_name,
    customer_phone: plan.customer_phone,
    package_ref: plan._id,
    subtotal: payment.amount,
    discount: 0,
    total_amount: payment.amount,
    cart_total: payment.amount,
    debt_amount: 0,
    // Money collected against something already agreed, not goods sold
    // today — the same status a debt payment carries, so every report that
    // already separates collections from counter sales keeps working.
    payment_status: 'debt_payment',
    payment_method: payment.payment_method || 'cash',
    sale_date: now,
    items: [],
  });
};

/** The plan as the browser wants it: with the sums already done. */
const withTotals = (plan) => {
  const obj = typeof plan.toObject === 'function' ? plan.toObject() : { ...plan };
  const paid = (obj.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  obj.amount_paid = money(paid);
  obj.outstanding = money(Math.max(0, (Number(obj.total_amount) || 0) - paid));
  obj.installments_paid = (obj.payments || []).filter((p) => p.portion !== 'deposit').length;
  return obj;
};

/**
 * GET /api/package-plans
 */
const getPackagePlans = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { customer_name: { $regex: search, $options: 'i' } },
        { customer_phone: { $regex: search, $options: 'i' } },
        { package_name: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [plans, total] = await Promise.all([
      PackagePlan.find(filter)
        .populate('created_by', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      PackagePlan.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: plans.map(withTotals),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get package plans error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/package-plans/catalogue
 *
 * The printed offers, so the counter picks a package instead of copying four
 * figures off a sheet and getting one of them wrong.
 */
const getCatalogue = async (_req, res) => {
  try {
    const sets = Object.entries(PLAN_SETS).map(([key, set]) => ({
      key,
      title: set.title,
      packages: (set.packages || []).map((p) => ({
        name: p.name,
        total: p.total,
        deposit: p.deposit,
        months: p.months,
        monthly: p.monthly,
        weeks: p.weeks,
        weekly: p.weekly,
        cashPrice: p.cashPrice,
      })),
    }));
    return res.status(200).json({ success: true, data: sets });
  } catch (err) {
    console.error('Package catalogue error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/package-plans
 *
 * Starting a plan, and taking the deposit in the same breath — because at
 * the counter they are one act, and a plan saved without the deposit it was
 * paid with is a plan somebody has to remember to come back to.
 */
const createPackagePlan = async (req, res) => {
  try {
    const {
      customer_name, customer_phone, package_set, package_name,
      total_amount, installment_amount, frequency, installments_count,
      deposit, payment_method, notes,
    } = req.body;

    if (!String(customer_name || '').trim()) {
      return res.status(400).json({ success: false, message: 'Whose plan is this? A customer name is needed.' });
    }
    if (!String(package_name || '').trim()) {
      return res.status(400).json({ success: false, message: 'Which package? Pick one or type its name.' });
    }
    const total = money(total_amount);
    if (!(total > 0)) {
      return res.status(400).json({ success: false, message: 'What does the package come to in total?' });
    }
    const perInstalment = money(installment_amount);
    if (!(perInstalment > 0)) {
      return res.status(400).json({ success: false, message: 'What is one instalment? Full and half are worked out from it.' });
    }

    const down = money(deposit);
    if (down > total) {
      return res.status(400).json({ success: false, message: 'The deposit is more than the package costs.' });
    }

    const plan = new PackagePlan({
      customer_name: String(customer_name).trim(),
      customer_phone: String(customer_phone || '').trim(),
      package_set: String(package_set || 'custom').trim(),
      package_name: String(package_name).trim(),
      total_amount: total,
      installment_amount: perInstalment,
      frequency: frequency === 'weekly' ? 'weekly' : 'monthly',
      installments_count: Number(installments_count) || undefined,
      notes: String(notes || '').trim(),
      created_by: req.user._id,
      payments: [],
    });

    if (down > 0) {
      plan.payments.push({
        amount: down,
        portion: 'deposit',
        payment_date: new Date(),
        payment_method: payment_method || 'cash',
        recorded_by: req.user._id,
      });
    }
    await plan.save();

    // The deposit is money taken today, so it goes into today, exactly as
    // every instalment after it will.
    if (down > 0) {
      const payment = plan.payments[plan.payments.length - 1];
      const sale = await recordAsSale(plan, payment, req.user);
      payment.sale_ref = sale._id;
      await plan.save();
    }

    await Notification.create({
      user_id: null,
      type: 'info',
      title: 'Package plan started',
      message: `${plan.customer_name} — ${plan.package_name}, GH₵${total.toFixed(2)}`
        + (down > 0 ? `, deposit GH₵${down.toFixed(2)}` : ', no deposit yet'),
      link: '/package-plans',
    });

    return res.status(201).json({ success: true, data: withTotals(plan) });
  } catch (err) {
    console.error('Create package plan error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/package-plans/:id
 */
const getPackagePlan = async (req, res) => {
  try {
    const plan = await PackagePlan.findById(req.params.id)
      .populate('created_by', 'username')
      .populate('payments.recorded_by', 'username');
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });
    return res.status(200).json({ success: true, data: withTotals(plan) });
  } catch (err) {
    console.error('Get package plan error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/package-plans/:id/payments
 *
 * Full, half, or a figure somebody typed.
 */
const recordPayment = async (req, res) => {
  try {
    const plan = await PackagePlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });
    if (plan.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'That plan was cancelled.' });
    }

    const outstanding = plan.outstanding();
    if (outstanding <= 0) {
      return res.status(400).json({ success: false, message: 'This package is already paid off.' });
    }

    const portion = ['full', 'half', 'part'].includes(req.body?.portion) ? req.body.portion : 'part';
    const wanted = amountFor(plan, portion, req.body?.amount);
    if (!(wanted > 0)) {
      return res.status(400).json({ success: false, message: 'How much was paid?' });
    }

    /**
     * Never take more than is owed.
     *
     * A full instalment on the last month is usually more than the balance,
     * and recording the whole of it would show the shop money it did not
     * take and leave the plan owing a negative amount.
     */
    const amount = money(Math.min(wanted, outstanding));

    plan.payments.push({
      amount,
      // If a 'full' was clipped by the balance it was not a full instalment,
      // and calling it one would hide that this was the last payment.
      portion: amount < wanted ? 'part' : portion,
      payment_date: new Date(),
      payment_method: req.body?.payment_method || 'cash',
      note: String(req.body?.note || '').trim(),
      recorded_by: req.user._id,
    });
    await plan.save();

    const payment = plan.payments[plan.payments.length - 1];
    const sale = await recordAsSale(plan, payment, req.user);
    payment.sale_ref = sale._id;
    await plan.save();

    await Notification.create({
      user_id: null,
      type: 'info',
      title: plan.outstanding() <= 0 ? 'Package paid off' : 'Package instalment',
      message: `${plan.customer_name} paid GH₵${amount.toFixed(2)} on ${plan.package_name}. `
        + `Remaining: GH₵${plan.outstanding().toFixed(2)}`,
      link: '/package-plans',
    });

    return res.status(200).json({
      success: true,
      data: {
        ...withTotals(plan),
        message: plan.outstanding() <= 0
          ? `GH₵${amount.toFixed(2)} taken — that clears the package.`
          : `GH₵${amount.toFixed(2)} taken. GH₵${plan.outstanding().toFixed(2)} still to pay.`,
      },
    });
  } catch (err) {
    console.error('Record package payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/package-plans/:id
 *
 * Cancelled, not deleted, and only by an owner. The payments against it were
 * real money that reached real days, and removing the plan would leave those
 * sales pointing at nothing.
 */
const cancelPackagePlan = async (req, res) => {
  try {
    const plan = await PackagePlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });
    if (!isOwner(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only an owner can cancel a plan.' });
    }
    plan.status = 'cancelled';
    plan.notes = [plan.notes, String(req.body?.reason || '').trim()].filter(Boolean).join(' — ');
    await plan.save();
    return res.status(200).json({ success: true, data: withTotals(plan) });
  } catch (err) {
    console.error('Cancel package plan error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getPackagePlans, getCatalogue, createPackagePlan, getPackagePlan,
  recordPayment, cancelPackagePlan,
  // exported for tests
  amountFor, withTotals,
};
