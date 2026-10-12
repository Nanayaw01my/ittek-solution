const Contact = require('../models/Contact');
const Sale = require('../models/Sale');
const { normaliseGhanaPhone } = require('../utils/phone');

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Day and month only — a birthday is not an anniversary of the year. */
const birthdaySoon = (birthday, within) => {
  if (!birthday) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(birthday);
  next.setFullYear(today.getFullYear());
  next.setHours(0, 0, 0, 0);
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  const days = Math.round((next - today) / 86400000);
  return days <= within ? days : null;
};

/**
 * GET /api/contacts
 *
 * The shop's contact book. Sorted by who was in most recently, because the
 * question being asked is almost always "who have we seen lately" rather than
 * "who is alphabetically first".
 *
 *   ?q=            name or number
 *   ?sort=spent    biggest spenders first
 *   ?sort=visits   most frequent first
 *   ?birthday=30   only those whose birthday falls inside N days
 *   ?contactable=1 skip the ones who asked not to be messaged
 */
const getContacts = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const filter = {};
    if (q) {
      // A number may be typed any way at all, so search the normalised form
      // when it looks like one and fall back to a plain match when it does not.
      const asPhone = normaliseGhanaPhone(q);
      const rx = new RegExp(esc(q), 'i');
      filter.$or = asPhone
        ? [{ phone: asPhone }, { name: rx }]
        : [{ name: rx }, { phone: rx }];
    }
    if (req.query.contactable === '1') filter.do_not_contact = { $ne: true };

    const sort = req.query.sort === 'spent' ? { total_spent: -1 }
      : req.query.sort === 'visits' ? { visits: -1 }
        : req.query.sort === 'name' ? { name: 1 }
          : { last_seen: -1 };

    let rows = await Contact.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Contact.countDocuments(filter);

    // Narrowing to upcoming birthdays is done here rather than in the query:
    // it is a day-and-month comparison that rolls over the end of the year,
    // which mongo cannot express without an aggregation nobody could read.
    const within = Number(req.query.birthday);
    if (Number.isFinite(within) && within > 0) {
      rows = rows
        .map((r) => ({ ...r, birthday_in: birthdaySoon(r.birthday, within) }))
        .filter((r) => r.birthday_in !== null)
        .sort((a, b) => a.birthday_in - b.birthday_in);
    } else {
      rows = rows.map((r) => ({ ...r, birthday_in: birthdaySoon(r.birthday, 366) }));
    }

    return res.status(200).json({
      success: true,
      data: {
        contacts: rows,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    console.error('Get contacts error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/contacts/summary — what the book holds, for the page header. */
const getContactsSummary = async (req, res) => {
  try {
    const monthAgo = new Date(Date.now() - 30 * 86400000);
    const [total, contactable, recent, withBirthday] = await Promise.all([
      Contact.countDocuments({}),
      Contact.countDocuments({ do_not_contact: { $ne: true } }),
      Contact.countDocuments({ last_seen: { $gte: monthAgo } }),
      Contact.find({ birthday: { $ne: null } }).select('birthday').lean(),
    ]);

    const birthdaysThisMonth = withBirthday
      .filter((c) => birthdaySoon(c.birthday, 30) !== null).length;

    return res.status(200).json({
      success: true,
      data: { total, contactable, recent, birthdays_this_month: birthdaysThisMonth },
    });
  } catch (err) {
    console.error('Contacts summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** PUT /api/contacts/:id — a birthday, a note, or "stop texting me". */
const updateContact = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ success: false, message: 'Not in the book.' });

    const { name, birthday, do_not_contact, notes } = req.body;
    if (typeof name === 'string') contact.name = name.trim();
    if (typeof notes === 'string') contact.notes = notes.trim();
    if (typeof do_not_contact === 'boolean') contact.do_not_contact = do_not_contact;
    if (birthday !== undefined) {
      if (!birthday) contact.birthday = undefined;
      else {
        const d = new Date(birthday);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ success: false, message: 'That date did not make sense.' });
        }
        contact.birthday = d;
      }
    }

    await contact.save();
    return res.status(200).json({ success: true, message: 'Saved.', data: contact });
  } catch (err) {
    console.error('Update contact error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/contacts/backfill
 *
 * Every number already sitting in a past sale, gathered into the book.
 *
 * Without this the list starts empty and only fills from today, so a shop
 * that has been trading for a year has a year of customers it cannot reach.
 * Safe to run more than once: each number lands on the same row.
 */
const backfillContacts = async (req, res) => {
  try {
    const rows = await Sale.aggregate([
      { $match: { customer_phone: { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$customer_phone',
          name: { $last: '$customer_name' },
          first_seen: { $min: '$sale_date' },
          last_seen: { $max: '$sale_date' },
          visits: { $sum: 1 },
          total_spent: { $sum: '$total_amount' },
        },
      },
    ]);

    // Several written forms of one number collapse to a single row, so the
    // totals have to be added up here rather than written straight out.
    const merged = new Map();
    let skipped = 0;
    for (const r of rows) {
      const phone = normaliseGhanaPhone(r._id);
      if (!phone) { skipped += 1; continue; }
      const prev = merged.get(phone);
      if (!prev) {
        merged.set(phone, {
          phone,
          name: (r.name || '').trim(),
          first_seen: r.first_seen || new Date(),
          last_seen: r.last_seen || new Date(),
          visits: r.visits || 0,
          total_spent: r.total_spent || 0,
        });
        continue;
      }
      prev.visits += r.visits || 0;
      prev.total_spent += r.total_spent || 0;
      if (r.name && !prev.name) prev.name = r.name.trim();
      if (r.first_seen && r.first_seen < prev.first_seen) prev.first_seen = r.first_seen;
      if (r.last_seen && r.last_seen > prev.last_seen) prev.last_seen = r.last_seen;
    }

    let added = 0;
    let updated = 0;
    for (const c of merged.values()) {
      const existing = await Contact.findOne({ phone: c.phone }).select('_id name').lean();
      await Contact.findOneAndUpdate(
        { phone: c.phone },
        {
          $set: {
            // Counts are rewritten rather than added to, so running this twice
            // does not double everybody's visits.
            visits: c.visits,
            total_spent: Number(c.total_spent.toFixed(2)),
            last_seen: c.last_seen,
            ...(c.name ? { name: c.name } : {}),
          },
          $setOnInsert: { phone: c.phone, first_seen: c.first_seen },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      if (existing) updated += 1; else added += 1;
    }

    return res.status(200).json({
      success: true,
      message: added || updated
        ? `${added} added, ${updated} updated${skipped ? `, ${skipped} skipped as unusable numbers` : ''}.`
        : 'No numbers found on past sales.',
      data: { added, updated, skipped },
    });
  } catch (err) {
    console.error('Backfill contacts error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not do it: ${err.message}` });
  }
};

/**
 * POST /api/contacts
 *
 * Somebody added to the book by hand.
 *
 * The book fills itself from the till, which covers everyone who has bought
 * something. It does not cover the people the shop wants to keep in touch
 * with anyway — the customer who rang and did not buy yet, the landlord of
 * the site being quoted, the old customer whose number arrived on paper.
 * Those had nowhere to go.
 *
 * Keyed on the normalised number like everything else here, so a person
 * entered by hand and the same person arriving later from a sale are one row
 * and not two.
 */
const createContact = async (req, res) => {
  try {
    const { name, phone, notes, birthday } = req.body;

    const number = normaliseGhanaPhone(phone);
    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'That does not look like a Ghana phone number.',
      });
    }

    const clean = String(name || '').trim();

    let when;
    if (birthday) {
      when = new Date(birthday);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ success: false, message: 'That date did not make sense.' });
      }
    }

    // Already known: keep the row, fill in what is new rather than refusing
    // over a duplicate the person cannot see.
    const existing = await Contact.findOne({ phone: number });
    if (existing) {
      const was = existing.name;
      if (clean) existing.name = clean;
      if (notes !== undefined) existing.notes = String(notes || '').trim();
      if (when) existing.birthday = when;
      await existing.save();
      return res.status(200).json({
        success: true,
        message: clean && clean !== was
          ? `Already in the book — saved as ${clean}.`
          : 'Already in the book.',
        data: existing,
        created: false,
      });
    }

    const contact = await Contact.create({
      phone: number,
      name: clean,
      notes: notes ? String(notes).trim() : undefined,
      birthday: when,
      // Entered by hand, so nothing has been bought and nothing was spent.
      // Left at zero rather than invented, or the spending figures lie.
      visits: 0,
      total_spent: 0,
    });

    return res.status(201).json({
      success: true,
      message: `${clean || number} added to the book.`,
      data: contact,
      created: true,
    });
  } catch (err) {
    console.error('Create contact error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not save them: ${err.message}` });
  }
};

module.exports = { getContacts, getContactsSummary, createContact, updateContact, backfillContacts };
