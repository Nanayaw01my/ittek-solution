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
  // "this is a reminder about" rather than "a reminder about" pushed this one
  // variant to 161 characters — a single character over the 160 an SMS
  // carries, which doubles what every undated reminder costs to send.
  if (days === null) line = `a reminder about your ${about}${owing}.`;
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
 * The next time a yearly date comes round.
 *
 * A birthday on 4 March is not in the past in December — it is due in March.
 * Carried forward to this year, or next if this year's has already gone, so
 * "in 320 days" is what it says rather than "280 days overdue".
 */
const nextYearly = (date) => {
  if (!date) return null;
  const today = startOfDay();
  const next = new Date(date);
  next.setFullYear(today.getFullYear());
  next.setHours(0, 0, 0, 0);
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next;
};

/**
 * What a goodwill message says.
 *
 * Deliberately separate from the money wording above. A birthday that opens
 * "your outstanding balance" is worse than no birthday message at all, and
 * the same few words have to work whether it is sent today or next week.
 */
const composeGoodwill = ({ company, name, about, purpose, days }) => {
  const first = String(name || '').split(' ')[0] || 'there';
  const sign = company || 'DAN & DOR SOLAR COMPANY LIMITED';
  const subject = String(about || '').trim();

  if (purpose === 'wish') {
    return [
      `Good day ${first},`, '',
      `${subject || 'Warmest wishes to you'} from all of us at ${sign}.`,
      '',
      'Thank you for your custom — it is a pleasure serving you.',
      sign,
    ].join('\n');
  }

  if (purpose === 'checkup') {
    return [
      `Good day ${first},`, '',
      subject
        ? `We are checking in on your ${subject}. How is it working for you?`
        : 'We are checking in to see how everything has been since your purchase.',
      '',
      'If anything needs looking at, tell us and we will come round.',
      'Thank you for choosing us.',
      sign,
    ].join('\n');
  }

  // A plain note. The date is mentioned only when there is one worth saying.
  const when = days === null ? ''
    : days === 0 ? ' today'
      : days === 1 ? ' tomorrow'
        : days > 1 ? ` in ${days} days` : '';
  return [
    `Good day ${first},`, '',
    `A reminder about ${subject || 'your appointment with us'}${when}.`,
    '',
    'Please call us if you need anything.',
    sign,
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
    // Chasing money, or keeping in touch — two jobs, two lists. Asking for
    // one must not drag the other's rows along, or the kind thing stays
    // buried among the debts and never gets done.
    const kind = req.query.kind === 'goodwill' ? 'goodwill' : 'money';
    const goodwill = kind === 'goodwill';

    // Money is chased within weeks; a birthday is next March. Capping both at
    // ninety days hid every yearly wish more than a quarter away, which is
    // most of them for most of the year.
    const cap = goodwill ? 366 : 90;
    const within = Math.min(cap, Math.max(0, Number(req.query.within) || (goodwill ? 30 : 7)));
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + within);

    const settings = await Settings.findOne().select('company_name').lean();
    const company = settings?.company_name;

    const none = () => Promise.resolve([]);
    const [debts, layaways, credits, phones, custom] = await Promise.all([
      goodwill ? none() : Debt.find({ status: { $ne: 'paid' } }).lean(),
      goodwill ? none() : Layaway.find({ status: { $nin: ['completed', 'cancelled'] } }).lean(),
      goodwill ? none() : CreditAgreement.find({ status: 'active' }).lean(),
      goodwill ? none() : PhoneSale.find({ status: 'approved' }).lean(),
      Reminder.find({
        status: { $in: ['pending', 'sent'] },
        // Rows written before this split have no kind and are money, which is
        // what the default on the field says — but a lean query sees the
        // stored document, so the absence is matched here too.
        ...(goodwill ? { kind: 'goodwill' } : { kind: { $ne: 'goodwill' } }),
      })
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
      // A birthday is due again next year, not overdue since last year.
      const due = r.yearly ? nextYearly(r.due_date) : r.due_date;
      add({
        _id: String(r._id), source: 'custom', about: r.about,
        customer_name: r.customer_name, customer_phone: r.customer_phone,
        amount: r.amount, due_date: due,
        note: r.message, status: r.status,
        sends: r.sends || [],
        created_by: r.created_by?.username,
        is_custom: true,
        kind: r.kind || 'money',
        purpose: r.purpose || 'note',
        yearly: !!r.yearly,
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
      message: r.kind === 'goodwill'
        ? composeGoodwill({
          company, name: r.customer_name, about: r.about, purpose: r.purpose, days: r.days,
        })
        : composeMessage({
          company, name: r.customer_name, about: r.about, amount: r.amount, days: r.days,
        }),
      // "No date set" reads as neglect on a debt. On a birthday card with no
      // date it only means there is nothing stopping you sending it.
      when: r.kind === 'goodwill' && r.days === null ? 'whenever you like' : whenWords(r.days),
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
          // Nobody has heard from us in a month — the people a check-up is for.
          out_of_touch: withMessage.filter((r) => !r.last_contacted
            || Date.now() - new Date(r.last_contacted).getTime() > 30 * 86400000).length,
        },
        kind,
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
    const {
      customer_name, customer_phone, about, message, due_date, amount,
      kind, purpose, yearly,
    } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ success: false, message: "Enter the customer's name." });
    }
    if (!customer_phone || !String(customer_phone).trim()) {
      return res.status(400).json({ success: false, message: 'Enter a phone number to remind them on.' });
    }
    if (!about || !String(about).trim()) {
      return res.status(400).json({ success: false, message: 'What is the reminder about?' });
    }

    const isGoodwill = kind === 'goodwill';
    const how = ['wish', 'note', 'checkup'].includes(purpose) ? purpose : 'note';

    // A yearly date with no date is nothing to repeat.
    const when = due_date ? new Date(due_date) : undefined;
    if (when && Number.isNaN(when.getTime())) {
      return res.status(400).json({ success: false, message: 'That date did not make sense.' });
    }
    if (yearly && !when) {
      return res.status(400).json({
        success: false,
        message: 'Set the date it falls on, or it cannot come round each year.',
      });
    }

    const record = await Reminder.create({
      customer_name: String(customer_name).trim(),
      customer_phone: String(customer_phone).trim(),
      about: String(about).trim(),
      message,
      due_date: when,
      // Goodwill is not about money, so no amount rides along with it — an
      // amount on a birthday card is how a kind message turns into a demand.
      amount: isGoodwill ? 0 : Math.max(0, Number(amount) || 0),
      kind: isGoodwill ? 'goodwill' : 'money',
      purpose: isGoodwill ? how : undefined,
      yearly: isGoodwill && !!yearly,
      source: 'custom',
      created_by: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: isGoodwill
        ? `Noted — ${record.customer_name} is on the keeping-in-touch list.`
        : `Reminder set for ${record.customer_name}.`,
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

/**
 * POST /api/reminders/send
 *
 * Actually send it, through Arkesel, and write down that it went.
 *
 * The WhatsApp button opens a chat with the words ready and trusts somebody
 * to press send; the log then says a message was prepared, which is not the
 * same as saying it arrived. This sends it outright, and only logs the ones
 * the gateway accepted — a log that records failures as sends is worse than
 * no log, because it is believed.
 *
 * Takes a list, because the thing a shop actually wants to do is chase
 * everybody overdue at once. Each is reported on separately: a wrong number
 * in the middle must not stop the rest.
 */
const sendBySms = async (req, res) => {
  try {
    const { smsCredentials } = require('./settingsController');
    const { sendSms } = require('../utils/arkesel');

    const { apiKey, sender, enabled } = await smsCredentials();
    if (!enabled) {
      return res.status(400).json({ success: false, message: 'Texting is switched off in Settings.' });
    }
    if (!apiKey || !sender) {
      return res.status(400).json({
        success: false,
        message: 'Set the Arkesel key and sender ID in Settings before texting.',
      });
    }

    const items = Array.isArray(req.body?.messages) ? req.body.messages : [req.body];
    if (!items.length) return res.status(400).json({ success: false, message: 'Nothing to send.' });
    if (items.length > 100) {
      return res.status(400).json({ success: false, message: 'Send at most 100 at a time.' });
    }

    // Whoever has asked not to be messaged. Looked up once for the whole run
    // rather than per message: the only decent answer to "stop texting me" is
    // a switch that works, and it has to work on a list of forty as well as on
    // a single send.
    const Contact = require('../models/Contact');
    const { normaliseGhanaPhone } = require('../utils/phone');
    const numbers = items
      .map((i) => normaliseGhanaPhone(i?.customer_phone))
      .filter(Boolean);
    const optedOut = new Set(
      (await Contact.find({ phone: { $in: numbers }, do_not_contact: true })
        .select('phone').lean().catch(() => []))
        .map((c) => c.phone)
    );

    // Written here when the caller sends facts rather than words, so the Debts
    // screen and this one say exactly the same thing to a customer. Two
    // screens composing their own wording is two wordings to keep in step,
    // and the customer eventually gets both.
    const shop = await Settings.findOne().select('company_name').lean();
    const company = shop?.company_name;
    const wordsFor = (item) => {
      if (item.message && String(item.message).trim()) return String(item.message);
      // Nothing to compose around. Composing anyway produces "a reminder about
      // your ." , which is worse than not sending at all.
      if (!item.about || !String(item.about).trim()) return '';
      const days = item.due_date === undefined ? null : daysAway(item.due_date);
      return item.kind === 'goodwill'
        ? composeGoodwill({
          company, name: item.customer_name, about: item.about, purpose: item.purpose, days,
        })
        : composeMessage({
          company, name: item.customer_name, about: item.about, amount: item.amount, days,
        });
    };

    const results = [];
    for (const item of items) {
      const { reminder_id, customer_name, customer_phone, about, amount } = item || {};
      const who = customer_name || 'Customer';
      const message = wordsFor(item || {});

      if (!message || !String(message).trim()) {
        results.push({ reminder_id, customer_name: who, ok: false, message: 'There was nothing to send.' });
        continue;
      }

      if (optedOut.has(normaliseGhanaPhone(customer_phone))) {
        results.push({
          reminder_id, customer_name: who, ok: false,
          message: 'They asked not to be messaged.',
        });
        continue;
      }

      // One at a time rather than one call with every number: the gateway
      // answers for the batch as a whole, and "some of them failed" is not an
      // answer anybody can act on.
      const sent = await sendSms({ apiKey, sender, to: customer_phone, message });
      results.push({
        reminder_id, customer_name: who, ok: sent.ok, message: sent.message, credits: sent.credits,
      });
      if (!sent.ok) continue;

      // Only now is it true.
      const send = { channel: 'sms', sent_at: new Date(), sent_by: req.user._id, note: 'Sent by Arkesel' };
      try {
        const existing = reminder_id ? await Reminder.findById(reminder_id).catch(() => null) : null;
        if (existing) {
          existing.sends.push(send);
          existing.status = 'sent';
          await existing.save();
        } else if (customer_phone) {
          await Reminder.create({
            customer_name: who,
            customer_phone,
            about: about || 'reminder',
            amount: Math.max(0, Number(amount) || 0),
            kind: item.kind === 'goodwill' ? 'goodwill' : 'money',
            purpose: ['wish', 'note', 'checkup'].includes(item.purpose) ? item.purpose : undefined,
            source: 'custom',
            status: 'sent',
            sends: [send],
            created_by: req.user._id,
          });
        }
      } catch (logErr) {
        // The message is gone and cannot be unsent. Say so rather than
        // reporting a failure that would have somebody send it twice.
        console.error('Logged send failed for', who, '-', logErr.message);
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    return res.status(200).json({
      success: sent > 0,
      message: failed === 0
        ? `Sent to ${sent}.`
        : sent === 0
          ? (results[0]?.message || 'None of them went.')
          : `Sent to ${sent}. ${failed} did not go.`,
      data: { sent, failed, results },
    });
  } catch (err) {
    console.error('Send reminder SMS error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** PUT /api/reminders/:id — settle or cancel a hand-written one. */
const updateReminder = async (req, res) => {
  try {
    const record = await Reminder.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Reminder not found.' });

    const { status, about, message, due_date, amount } = req.body;
    if (['pending', 'sent', 'done', 'cancelled'].includes(status)) {
      // Finishing a birthday for ever is how a shop forgets it next year. It
      // goes back to pending instead, and the date rolls forward on its own.
      record.status = (status === 'done' && record.yearly) ? 'pending' : status;
    }
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
  getReminders, createReminder, logSend, sendBySms, updateReminder, deleteReminder,
  composeMessage, composeGoodwill,
};
