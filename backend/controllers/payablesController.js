const Payable = require('../models/Payable');

const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/**
 * GET /api/payables
 *
 * Grouped by whoever is owed, because that is who gets paid. Eleven separate
 * entries is not an answer to "what do we owe Kofi Trading?".
 */
const getPayables = async (req, res) => {
  try {
    const showSettled = req.query.settled === '1';
    const filter = showSettled ? {} : { status: { $ne: 'paid' } };

    const rows = await Payable.find(filter)
      .populate('created_by', 'username')
      .sort({ due_date: 1, incurred_on: 1 })
      .lean();

    const today = startOfDay();
    const byName = new Map();
    let total = 0;
    let overdue = 0;

    for (const r of rows) {
      const owed = Math.max(0, Number(((r.amount_owed || 0) - (r.amount_paid || 0)).toFixed(2)));
      if (!showSettled && owed <= 0) continue;
      total += owed;

      const late = r.due_date && new Date(r.due_date) < today && owed > 0;
      if (late) overdue += owed;

      // Keyed on the name as typed, since that is what the owner wrote and
      // what they will look for.
      const key = r.supplier_name.trim().toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, {
          supplier_name: r.supplier_name.trim(),
          supplier_phone: r.supplier_phone || '',
          owed: 0,
          overdue: 0,
          entries: [],
        });
      }
      const group = byName.get(key);
      group.owed = Number((group.owed + owed).toFixed(2));
      if (late) group.overdue = Number((group.overdue + owed).toFixed(2));
      if (!group.supplier_phone && r.supplier_phone) group.supplier_phone = r.supplier_phone;
      group.entries.push({
        _id: String(r._id),
        about: r.about,
        amount_owed: r.amount_owed,
        amount_paid: r.amount_paid || 0,
        owed,
        incurred_on: r.incurred_on,
        due_date: r.due_date || null,
        overdue: !!late,
        status: r.status,
        notes: r.notes || '',
        payments: (r.payments || []).length,
        written_by: r.created_by?.username || '',
      });
    }

    const suppliers = [...byName.values()].sort((a, b) => b.owed - a.owed);

    return res.status(200).json({
      success: true,
      data: {
        suppliers,
        summary: {
          owed: Number(total.toFixed(2)),
          overdue: Number(overdue.toFixed(2)),
          suppliers: suppliers.length,
          entries: suppliers.reduce((n, s) => n + s.entries.length, 0),
        },
      },
    });
  } catch (err) {
    console.error('Get payables error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/payables — write down something the shop owes. */
const createPayable = async (req, res) => {
  try {
    const {
      supplier_name, supplier_phone, supplier_id, about,
      amount_owed, amount_paid, incurred_on, due_date, notes,
    } = req.body;

    if (!supplier_name || !String(supplier_name).trim()) {
      return res.status(400).json({ success: false, message: 'Who is owed?' });
    }
    if (!about || !String(about).trim()) {
      return res.status(400).json({ success: false, message: 'What is it for?' });
    }

    const owed = Number(amount_owed);
    if (!Number.isFinite(owed) || owed <= 0) {
      return res.status(400).json({ success: false, message: 'How much is owed?' });
    }

    // Often something has already been paid against it before anybody writes
    // it down, so it can be entered part-settled rather than needing a second
    // step immediately afterwards.
    const already = Number(amount_paid) || 0;
    if (already < 0) {
      return res.status(400).json({ success: false, message: 'Paid cannot be less than nothing.' });
    }
    if (already > owed + 0.004) {
      return res.status(400).json({
        success: false,
        message: 'Paid is more than the amount owed. Check the figures.',
      });
    }

    const dates = {};
    for (const [key, value] of [['incurred_on', incurred_on], ['due_date', due_date]]) {
      if (!value) continue;
      const when = new Date(value);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ success: false, message: 'That date did not make sense.' });
      }
      dates[key] = when;
    }

    const record = await Payable.create({
      supplier_name: String(supplier_name).trim(),
      supplier_phone,
      supplier_id: supplier_id || undefined,
      about: String(about).trim(),
      amount_owed: Number(owed.toFixed(2)),
      payments: already > 0
        ? [{
          amount: Number(already.toFixed(2)),
          method: 'cash',
          note: 'Paid before this was written down',
          paid_by: req.user._id,
        }]
        : [],
      incurred_on: dates.incurred_on || new Date(),
      due_date: dates.due_date,
      notes,
      created_by: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: `Noted — ${record.supplier_name} is owed GH¢${record.balance().toFixed(2)}.`,
      data: record,
    });
  } catch (err) {
    console.error('Create payable error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not save it: ${err.message}` });
  }
};

/**
 * POST /api/payables/:id/pay
 *
 * Writes no Expense, deliberately. The goods were already bought and already
 * cost what they cost; this settles the debt that purchase created. Recording
 * it as an expense as well would charge the shop twice for the same thing.
 */
const payPayable = async (req, res) => {
  try {
    const record = await Payable.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Not found.' });

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'How much was paid?' });
    }

    const owed = record.balance();
    if (owed <= 0) {
      return res.status(400).json({ success: false, message: 'This one is already settled.' });
    }
    // Paying more than is owed is a typo every time, and a balance that reads
    // as negative for ever is worse than a rejected keystroke.
    if (amount > owed + 0.004) {
      return res.status(400).json({
        success: false,
        message: `Only GH¢${owed.toFixed(2)} is still owed on this.`,
      });
    }

    const method = ['cash', 'bank', 'mobile_money', 'cheque', 'other'].includes(req.body?.method)
      ? req.body.method : 'cash';

    record.payments.push({
      amount: Number(amount.toFixed(2)),
      method,
      reference: req.body?.reference,
      note: req.body?.note,
      paid_at: new Date(),
      paid_by: req.user._id,
    });
    await record.save();

    const left = record.balance();
    return res.status(200).json({
      success: true,
      message: left > 0
        ? `GH¢${amount.toFixed(2)} paid to ${record.supplier_name}. GH¢${left.toFixed(2)} still owed.`
        : `GH¢${amount.toFixed(2)} paid to ${record.supplier_name}. Settled in full.`,
      data: record,
    });
  } catch (err) {
    console.error('Pay payable error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not record it: ${err.message}` });
  }
};

/** PUT /api/payables/:id — correct what was written down. */
const updatePayable = async (req, res) => {
  try {
    const record = await Payable.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Not found.' });

    const { supplier_name, supplier_phone, about, amount_owed, due_date, notes } = req.body;

    if (supplier_name !== undefined) {
      if (!String(supplier_name).trim()) {
        return res.status(400).json({ success: false, message: 'Who is owed?' });
      }
      record.supplier_name = String(supplier_name).trim();
    }
    if (supplier_phone !== undefined) record.supplier_phone = supplier_phone;
    if (about !== undefined && String(about).trim()) record.about = String(about).trim();
    if (notes !== undefined) record.notes = notes;

    if (amount_owed !== undefined) {
      const owed = Number(amount_owed);
      if (!Number.isFinite(owed) || owed <= 0) {
        return res.status(400).json({ success: false, message: 'How much is owed?' });
      }
      // Correcting the figure below what has been handed over would leave a
      // record claiming the shop overpaid, which it did not.
      if (owed + 0.004 < (record.amount_paid || 0)) {
        return res.status(400).json({
          success: false,
          message: `GH¢${(record.amount_paid || 0).toFixed(2)} has already been paid against this.`,
        });
      }
      record.amount_owed = Number(owed.toFixed(2));
    }

    if (due_date === null || due_date === '') record.due_date = undefined;
    else if (due_date !== undefined) {
      const when = new Date(due_date);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ success: false, message: 'That date did not make sense.' });
      }
      record.due_date = when;
    }

    await record.save();
    return res.status(200).json({ success: true, message: 'Saved.', data: record });
  } catch (err) {
    console.error('Update payable error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** DELETE /api/payables/:id */
const deletePayable = async (req, res) => {
  try {
    const record = await Payable.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Not found.' });
    await record.deleteOne();
    return res.status(200).json({
      success: true,
      message: `Removed what was owed to ${record.supplier_name}.`,
      data: {},
    });
  } catch (err) {
    console.error('Delete payable error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getPayables, createPayable, payPayable, updatePayable, deletePayable };
