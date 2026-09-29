const Reminder = require('../models/Reminder');
const Debt = require('../models/Debt');
const Layaway = require('../models/Layaway');
const CreditAgreement = require('../models/CreditAgreement');
const PhoneSale = require('../models/PhoneSale');
const Settings = require('../models/Settings');

const gh = (n) => `GH¢${Number(n || 0).toFixed(2)}`;

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Whole days from today. Negative means it was due that many days ago. */
const daysAway = (date) => {
  if (!date) return null;
  return Math.round((startOfDay(date) - startOfDay()) / 86400000);
};

const whenWords = (days) => {
  if (days === null) return 'no date set';
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return 'a day overdue';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
};

/**
 * The message a customer actually reads.
 *
 * Written here rather than on the screen so every channel says the same
 * thing, and so it can be changed in one place when the shop decides how it
 * wants to sound.
 */
const composeMessage = ({ company, name, about, amount, days }) => {
  const greeting = `Good day ${String(name || '').split(' ')[0] || 'there'},`;
  const owing = amount > 0 ? ` of ${gh(amount)}` : '';

  let line;
  if (days === null) line = `this is a reminder about your ${about}${owing}.`;
  else if (days < 0) line = `your ${about}${owing} was due ${whenWords(days).replace(' overdue', ' ago')}.`;
  else if (days === 0) line = `your ${about}${owing} is due today.`;
  else line = `your ${about}${owing} is ${whenWords(days)}.`;

  return [
    greeting,
    '',
    line,
    '',
    'Kindly come in or call us to settle it. Thank you.',
    company || 'DAN & DOR SOLAR COMPANY LIMITED',
  ].join('\n');
};

/**
 * GET /api/reminders?within=7
 *
 * Everyone worth chasing: what the system already knows is owed, plus
 * whatever somebody wrote down by hand. Worked out on the spot rather than
 * kept as a second list that would drift out of step with the debts.
 */
const getReminders = async (req, res) => {
  try {
    const within = Math.min(90, Math.max(0, Number(req.query.within) || 7));
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + within);

    const settings = await Settings.findOne().select('company_name').lean();
    const company = settings?.company_name;

    const [debts, layaways, credits, phones, custom] = await Promise.all([
      Debt.find({ status: { $ne: 'paid' } }).lean(),
      Layaway.find({ status: { $nin: ['completed', 'cancelled'] } }).lean(),
      CreditAgreement.find({ status: 'active' }).lean(),
      PhoneSale.find({ status: 'approved' }).lean(),
      Reminder.find({ status: { $in: ['pending', 'sent'] } })
        .populate('created_by', 'username')
        .lean(),
    ]);

    const rows = [];
    const add = (r) => {
      // No number, nothing to send to — but still worth showing, because the
      // shop can go and ask for one.
      rows.push({ ...r, days: daysAway(r.due_date), can_message: !!r.customer_phone });
    };

    for (const d of debts) {
      const left = Math.max(0, (d.amount_owed || 0) - (d.amount_paid || 0));
      if (left <= 0) continue;
      add({
        _id: String(d._id), source: 'debt', about: 'outstanding balance',
        customer_name: d.customer_name, customer_phone: d.customer_phone,
        amount: left, due_date: d.due_date,
      });
    }

    for (const l of layaways) {
      if ((l.balance || 0) <= 0) continue;
      add({
        _id: String(l._id), source: 'layaway', about: `layaway ${l.reference || ''}`.trim(),
        customer_name: l.customer_name, customer_phone: l.customer_phone,
        amount: l.balance, due_date: l.next_due_date || l.due_date,
      });
    }

    for (const c of credits) {
      if ((c.remaining || 0) <= 0) continue;
      add({
        _id: String(c._id), source: 'credit', about: 'credit agreement',
        customer_name: c.customer_name, customer_phone: c.customer_phone,
        amount: c.remaining, due_date: c.next_due_date || c.due_date,
      });
    }

    for (const p of phones) {
      if ((p.balance || 0) <= 0) continue;
      add({
        _id: String(p._id), source: 'phone_credit', about: `${p.phone_model} instalment`,
        customer_name: p.customer_name, customer_phone: p.customer_phone,
        amount: p.balance, due_date: p.final_due_date,
      });
    }

    for (const r of custom) {
      add({
        _id: String(r._id), source: 'custom', about: r.about,
        customer_name: r.customer_name, customer_phone: r.customer_phone,
        amount: r.amount, due_date: r.due_date,
        note: r.message, status: r.status,
        sends: r.sends || [],
        created_by: r.created_by?.username,
        is_custom: true,
      });
    }

    // Everything already due, and anything falling due inside the window.
    // A deal with no date at all is shown too: nobody is chasing it
    // otherwise, which is how a balance quietly becomes a bad debt.
    const due = rows.filter((r) => r.days === null || r.days <= within);

    due.sort((a, b) => {
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });

    // The last time anybody reached out to this number, whatever it was for.
    const phonesTouched = await Reminder.find({
      customer_phone: { $in: due.map((r) => r.customer_phone).filter(Boolean) },
      'sends.0': { $exists: true },
    }).select('customer_phone sends').lean();

    const lastContact = new Map();
    for (const r of phonesTouched) {
      const latest = r.sends.reduce((m, s) => (!m || s.sent_at > m ? s.sent_at : m), null);
      const key = String(r.customer_phone);
      if (!lastContact.has(key) || latest > lastContact.get(key)) lastContact.set(key, latest);
    }

    const withMessage = due.map((r) => ({
      ...r,
      last_contacted: lastContact.get(String(r.customer_phone)) || null,
      message: composeMessage({
        company, name: r.customer_name, about: r.about, amount: r.amount, days: r.days,
      }),
      when: whenWords(r.days),
    }));

    return res.status(200).json({
      success: true,
      data: {
        reminders: withMessage,
        summary: {
          total: withMessage.length,
          overdue: withMessage.filter((r) => r.days !== null && r.days < 0).length,
          today: withMessage.filter((r) => r.days === 0).length,
          no_number: withMessage.filter((r) => !r.can_message).length,
          owed: Number(withMessage.reduce((t, r) => t + (r.amount || 0), 0).toFixed(2)),
        },
        within,
      },
    });
  } catch (err) {
    console.error('Get reminders error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/reminders — something to remember that the system could not know. */
const createReminder = async (req, res) => {
  try {
    const { customer_name, customer_phone, about, message, due_date, amount } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ success: false, message: "Enter the customer's name." });
    }
    if (!customer_phone || !String(customer_phone).trim()) {
      return res.status(400).json({ success: false, message: 'Enter a phone number to remind them on.' });
    }
    if (!about || !String(about).trim()) {
      return res.status(400).json({ success: false, message: 'What is the reminder about?' });
    }

    const record = await Reminder.create({
      customer_name: String(customer_name).trim(),
      customer_phone: String(customer_phone).trim(),
      about: String(about).trim(),
      message,
      due_date: due_date ? new Date(due_date) : undefined,
      amount: Math.max(0, Number(amount) || 0),
      source: 'custom',
      created_by: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: `Reminder set for ${record.customer_name}.`,
      data: record,
    });
  } catch (err) {
    console.error('Create reminder error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not save it: ${err.message}` });
  }
};

/**
 * POST /api/reminders/sent
 *
 * Somebody reached out. Logged against the customer's number rather than a
 * particular debt, because that is how "when did we last chase them?" is
 * asked — about the person, not the paperwork.
 */
const logSend = async (req, res) => {
  try {
    const { reminder_id, customer_name, customer_phone, about, channel, note, amount } = req.body;

    const how = ['whatsapp', 'sms', 'call', 'other'].includes(channel) ? channel : 'whatsapp';
    const send = { channel: how, sent_at: new Date(), sent_by: req.user._id, note };

    // A hand-written reminder keeps its own log.
    if (reminder_id) {
      const existing = await Reminder.findById(reminder_id).catch(() => null);
      if (existing) {
        existing.sends.push(send);
        existing.status = 'sent';
        await existing.save();
        return res.status(200).json({
          success: true, message: `Logged against ${existing.customer_name}.`, data: existing,
        });
      }
    }

    // One raised from a debt or a layaway has nowhere of its own to be
    // written, so the log entry is what creates the record.
    if (!customer_phone) {
      return res.status(400).json({ success: false, message: 'No number to log against.' });
    }
    const record = await Reminder.create({
      customer_name: customer_name || 'Customer',
      customer_phone,
      about: about || 'reminder',
      amount: Math.max(0, Number(amount) || 0),
      source: 'custom',
      status: 'sent',
      sends: [send],
      created_by: req.user._id,
    });

    return res.status(201).json({
      success: true, message: `Logged against ${record.customer_name}.`, data: record,
    });
  } catch (err) {
    console.error('Log reminder send error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not log it.' });
  }
};

/** PUT /api/reminders/:id — settle or cancel a hand-written one. */
const updateReminder = async (req, res) => {
  try {
    const record = await Reminder.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Reminder not found.' });

    const { status, about, message, due_date, amount } = req.body;
    if (['pending', 'sent', 'done', 'cancelled'].includes(status)) record.status = status;
    if (about !== undefined) record.about = about;
    if (message !== undefined) record.message = message;
    if (due_date !== undefined) record.due_date = due_date ? new Date(due_date) : undefined;
    if (amount !== undefined) record.amount = Math.max(0, Number(amount) || 0);

    await record.save();
    return res.status(200).json({ success: true, message: 'Updated.', data: record });
  } catch (err) {
    console.error('Update reminder error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** DELETE /api/reminders/:id */
const deleteReminder = async (req, res) => {
  try {
    const record = await Reminder.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Reminder not found.' });
    await record.deleteOne();
    return res.status(200).json({ success: true, message: 'Reminder deleted.', data: {} });
  } catch (err) {
    console.error('Delete reminder error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getReminders, createReminder, logSend, updateReminder, deleteReminder, composeMessage,
};
