/**
 * Chasing overdue debts by text, without anybody pressing a button.
 *
 * The shop sets the due date when it records the debt. Nothing here guesses
 * when somebody is late — it reads the date that was typed in and follows up
 * after it, on the rhythm the shop chose in Settings.
 *
 * Deliberately conservative, because this spends money and talks to
 * customers on its own:
 *
 *   - off until switched on;
 *   - it stops after a set number of reminders, so a debt nobody can collect
 *     does not become a monthly nuisance to somebody who has stopped reading;
 *   - a debt with no date is never chased, because nobody has said it is
 *     late;
 *   - anyone who asked not to be messaged is skipped, which the sending code
 *     enforces again underneath this;
 *   - what it sent is written down against the debt, so a person looking at
 *     the record can see the customer has already been asked four times.
 */

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysOverdue = (due) => Math.round((startOfDay() - startOfDay(due)) / 86400000);

/**
 * Is today a day this debt gets chased?
 *
 * Exported so the decision can be tested on its own — it is the part that
 * decides whether a customer's phone buzzes, and it should be possible to
 * read the rule back out of a test rather than out of a log of real sends.
 */
const dueForChasing = (debt, rules, today = new Date()) => {
  const owed = Math.max(0, (debt.amount_owed || 0) - (debt.amount_paid || 0));
  if (owed <= 0) return false;
  if (debt.status === 'paid') return false;
  if (!debt.due_date) return false;
  if (!debt.customer_phone) return false;
  if (owed < (rules.minimum_amount || 0)) return false;
  if ((debt.reminders_sent || 0) >= (rules.max_reminders || 4)) return false;

  // Never twice in a day, whatever the rhythm says — a catch-up sweep and
  // the timer must not both decide today is the day.
  if (debt.last_reminded_at
    && startOfDay(debt.last_reminded_at).getTime() === startOfDay(today).getTime()) return false;

  const late = daysOverdue(debt.due_date);
  if (late < 0) return false;
  if (late === 0) return !!rules.on_due_day;

  const every = Number(rules.repeat_every_days) || 0;
  if (every <= 0) return false;
  return late % every === 0;
};

/**
 * Text everybody who is due a reminder today.
 *
 * Returns a sentence for the job log, so "is the chasing working?" has an
 * answer that does not require reading the customers' phones.
 */
const chaseOverdueDebts = async () => {
  const Settings = require('../models/Settings');
  const Debt = require('../models/Debt');
  const Contact = require('../models/Contact');
  const { sendSms } = require('./arkesel');
  const { normaliseGhanaPhone } = require('./phone');
  const { composeMessage } = require('../controllers/remindersController');

  const settings = await Settings.findOne()
    .select('+sms_config.api_key company_name company_address company_phone debt_chasing')
    .lean();

  const rules = settings?.debt_chasing || {};
  if (!rules.enabled) return 'Debt chasing is switched off.';

  const apiKey = settings?.sms_config?.api_key || process.env.ARKESEL_API_KEY || '';
  const sender = settings?.sms_config?.sender_id || process.env.ARKESEL_SENDER_ID || '';
  if (settings?.sms_config?.enabled === false) return 'Texting is switched off.';
  if (!apiKey || !sender) return 'No Arkesel key or sender ID — nothing sent.';

  const open = await Debt.find({ status: { $ne: 'paid' }, due_date: { $ne: null } }).lean();
  const wanted = open.filter((d) => dueForChasing(d, rules));
  if (wanted.length === 0) return 'Nobody was due a reminder today.';

  // Everybody who has asked not to be messaged, in one query rather than one
  // per debt — a shop with two hundred open debts should not make two hundred
  // round trips to find that out.
  const numbers = wanted.map((d) => normaliseGhanaPhone(d.customer_phone)).filter(Boolean);
  const optedOut = new Set(
    (await Contact.find({ phone: { $in: numbers }, do_not_contact: true })
      .select('phone').lean().catch(() => []))
      .map((c) => c.phone)
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const debt of wanted) {
    const phone = normaliseGhanaPhone(debt.customer_phone);
    if (!phone || optedOut.has(phone)) { skipped += 1; continue; }

    const owed = Math.max(0, (debt.amount_owed || 0) - (debt.amount_paid || 0));
    const message = composeMessage({
      company: settings?.company_name,
      address: settings?.company_address,
      phone: settings?.company_phone,
      // No sign-off: the sender ID beside a text already says who it is from,
      // and those characters are what take it past one message's worth.
      signoff: false,
      name: debt.customer_name,
      about: 'outstanding balance',
      amount: owed,
      days: -daysOverdue(debt.due_date),
    });

    const result = await sendSms({ apiKey, sender, to: phone, message });
    if (!result.ok) {
      failed += 1;
      console.error(`[DebtChaser] ${debt.customer_name}: ${result.message}`);
      continue;
    }

    sent += 1;
    // Only after it actually went. A count that includes failures would stop
    // chasing somebody who has never been reached.
    await Debt.updateOne(
      { _id: debt._id },
      { $inc: { reminders_sent: 1 }, $set: { last_reminded_at: new Date() } }
    ).catch((err) => console.error('[DebtChaser] could not record the send:', err.message));
  }

  const parts = [`Texted ${sent}`];
  if (failed) parts.push(`${failed} failed`);
  if (skipped) parts.push(`${skipped} skipped`);
  return `${parts.join(', ')}.`;
};

module.exports = { chaseOverdueDebts, dueForChasing, daysOverdue };
