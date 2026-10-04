const Installation = require('../models/Installation');
const User = require('../models/User');
const { notifyUser, notifyOwners } = require('../utils/notify');

const ROLE_LEVELS = { 'Super Admin': 4, CEO: 3, Manager: 2, Sales: 1, 'Field Agent': 1 };
const levelOf = (role) => ROLE_LEVELS[role] || 0;

const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** INS-YYYYMMDD-0001, worked out from the highest issued today. */
const nextReference = async () => {
  const now = new Date();
  const part = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const todays = await Installation.find({ reference: { $regex: `^INS-${part}-` } })
    .select('reference').sort({ reference: -1 }).limit(50).lean();
  const highest = todays.reduce((max, j) => {
    const n = parseInt(String(j.reference).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `INS-${part}-${String(highest + 1).padStart(4, '0')}`;
};

/**
 * GET /api/installations
 *
 * Somebody who only fits things sees the jobs they are on and nothing else —
 * the fitter does not need the whole book, and a list of every customer's
 * address is not something to hand out by default.
 */
const getInstallations = async (req, res) => {
  try {
    const { status, from, to, assigned, q } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      if (status === 'open') filter.status = { $in: ['scheduled', 'in_progress'] };
      else filter.status = status;
    }
    if (from || to) {
      filter.scheduled_for = {};
      if (from) filter.scheduled_for.$gte = startOfDay(from);
      if (to) filter.scheduled_for.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    if (assigned) filter.assigned_to = assigned;
    if (q) {
      const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [{ customer_name: rx }, { location: rx }, { reference: rx }, { work: rx }];
    }

    if (levelOf(req.user.role) < 2) filter.assigned_to = req.user._id;

    const jobs = await Installation.find(filter)
      .populate('assigned_to', 'username role')
      .populate('created_by', 'username')
      .populate('completed_by', 'username')
      .sort({ scheduled_for: 1 })
      .limit(300)
      .lean();

    const now = new Date();
    const today = startOfDay();
    const tomorrow = new Date(today.getTime() + 86400000);
    const open = (j) => ['scheduled', 'in_progress'].includes(j.status);

    return res.status(200).json({
      success: true,
      data: {
        installations: jobs.map((j) => ({
          ...j,
          overdue: open(j) && new Date(new Date(j.scheduled_for).setHours(23, 59, 59, 999)) < now,
        })),
        summary: {
          today: jobs.filter((j) => open(j)
            && new Date(j.scheduled_for) >= today && new Date(j.scheduled_for) < tomorrow).length,
          upcoming: jobs.filter((j) => open(j) && new Date(j.scheduled_for) >= tomorrow).length,
          overdue: jobs.filter((j) => open(j)
            && new Date(new Date(j.scheduled_for).setHours(23, 59, 59, 999)) < now).length,
          unassigned: jobs.filter((j) => open(j) && (j.assigned_to || []).length === 0).length,
        },
      },
    });
  } catch (err) {
    console.error('Get installations error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/installations — put a job in the book. */
const createInstallation = async (req, res) => {
  try {
    const {
      customer_name, customer_phone, location, work,
      scheduled_for, slot, assigned_to, notes, invoice_ref, sale_id,
    } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ success: false, message: "Enter the customer's name." });
    }
    if (!location || !String(location).trim()) {
      return res.status(400).json({ success: false, message: 'Where is the team going?' });
    }
    if (!work || !String(work).trim()) {
      return res.status(400).json({ success: false, message: 'What is being done there?' });
    }
    const when = scheduled_for ? new Date(scheduled_for) : null;
    if (!when || Number.isNaN(when.getTime())) {
      return res.status(400).json({ success: false, message: 'Give it a day.' });
    }

    // Only real accounts, so a job cannot be assigned to somebody who is not
    // there to be told about it.
    let team = [];
    if (Array.isArray(assigned_to) && assigned_to.length) {
      const found = await User.find({ _id: { $in: assigned_to }, is_active: true })
        .select('_id username').lean();
      team = found.map((u) => u._id);
    }

    const job = await Installation.create({
      reference: await nextReference(),
      customer_name: String(customer_name).trim(),
      customer_phone,
      location: String(location).trim(),
      work: String(work).trim(),
      scheduled_for: when,
      slot: ['morning', 'afternoon'].includes(slot) ? slot : '',
      assigned_to: team,
      notes,
      invoice_ref,
      sale_id: sale_id || undefined,
      created_by: req.user._id,
    });

    // Being given a job is something you should hear about, not discover.
    const day = when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    for (const id of team) {
      await notifyUser(id, {
        type: 'installation',
        title: 'You are on a job',
        message: `${job.customer_name} at ${job.location}, ${day}${job.slot ? ` (${job.slot})` : ''}.`,
        link: '/installations',
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: `${job.reference} booked for ${day}.`,
      data: job,
    });
  } catch (err) {
    console.error('Create installation error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not book it: ${err.message}` });
  }
};

/**
 * PUT /api/installations/:id
 *
 * Somebody on the job can start it and finish it — that is the point of
 * giving it to them. Everything else about it is the office's.
 */
const updateInstallation = async (req, res) => {
  try {
    const job = await Installation.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const isManager = levelOf(req.user.role) >= 2;
    const onTheJob = (job.assigned_to || []).some((u) => String(u) === String(req.user._id));
    if (!isManager && !onTheJob) {
      return res.status(403).json({ success: false, message: 'That job is not yours.' });
    }

    const { status, outcome, notes } = req.body;

    if (status && ['scheduled', 'in_progress', 'done', 'cancelled'].includes(status)) {
      if (status === 'in_progress' && !job.started_at) job.started_at = new Date();
      if (status === 'done') {
        job.completed_at = new Date();
        job.completed_by = req.user._id;
      }
      if (status === 'scheduled') {
        // Reopened. The old finish is no longer true and must not be left
        // behind to be read as this one's.
        job.completed_at = undefined;
        job.completed_by = undefined;
      }
      job.status = status;
    }
    if (typeof outcome === 'string') job.outcome = outcome.trim();
    if (typeof notes === 'string') job.notes = notes.trim();

    // The rest is the office's to change.
    if (isManager) {
      const { customer_name, customer_phone, location, work, scheduled_for, slot, assigned_to } = req.body;
      if (customer_name) job.customer_name = String(customer_name).trim();
      if (customer_phone !== undefined) job.customer_phone = customer_phone;
      if (location) job.location = String(location).trim();
      if (work) job.work = String(work).trim();
      if (scheduled_for) {
        const when = new Date(scheduled_for);
        if (Number.isNaN(when.getTime())) {
          return res.status(400).json({ success: false, message: 'That date did not make sense.' });
        }
        job.scheduled_for = when;
      }
      if (slot !== undefined) job.slot = ['morning', 'afternoon'].includes(slot) ? slot : '';
      if (Array.isArray(assigned_to)) {
        const found = await User.find({ _id: { $in: assigned_to }, is_active: true }).select('_id').lean();
        job.assigned_to = found.map((u) => u._id);
      }
    }

    await job.save();

    if (status === 'done') {
      await notifyOwners({
        type: 'installation',
        title: 'Job finished',
        message: `${job.reference} — ${job.customer_name} at ${job.location}.`,
        link: '/installations',
        exclude_user_id: req.user._id,
      }).catch(() => {});
    }

    return res.status(200).json({ success: true, message: 'Saved.', data: job });
  } catch (err) {
    console.error('Update installation error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** DELETE /api/installations/:id */
const deleteInstallation = async (req, res) => {
  try {
    const job = await Installation.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    await job.deleteOne();
    return res.status(200).json({ success: true, message: `${job.reference} removed.`, data: {} });
  } catch (err) {
    console.error('Delete installation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * The morning's rounds, for the scheduler.
 *
 * Told to the owners rather than left on a screen somebody has to remember to
 * open — a job nobody looked at is a customer waiting at home all day.
 */
const announceTodaysJobs = async () => {
  const today = startOfDay();
  const tomorrow = new Date(today.getTime() + 86400000);

  const [todays, overdue] = await Promise.all([
    Installation.find({
      scheduled_for: { $gte: today, $lt: tomorrow },
      status: { $in: ['scheduled', 'in_progress'] },
    }).populate('assigned_to', 'username').lean(),
    Installation.countDocuments({
      scheduled_for: { $lt: today },
      status: { $in: ['scheduled', 'in_progress'] },
    }),
  ]);

  if (todays.length === 0 && overdue === 0) return 'No jobs today.';

  const lines = todays.map((j) => {
    const who = (j.assigned_to || []).map((u) => u.username).join(', ') || 'nobody assigned';
    return `${j.customer_name} at ${j.location} — ${who}`;
  });

  const title = todays.length
    ? `${todays.length} job${todays.length === 1 ? '' : 's'} today`
    : `${overdue} job${overdue === 1 ? '' : 's'} still open`;

  await notifyOwners({
    type: 'installation',
    title,
    message: [...lines, overdue ? `${overdue} from earlier still not closed.` : '']
      .filter(Boolean).join('\n'),
    link: '/installations',
    tag: 'installations-today',
  }).catch(() => {});

  // Each fitter is told their own, which is the part they act on.
  for (const job of todays) {
    for (const u of job.assigned_to || []) {
      await notifyUser(u._id, {
        type: 'installation',
        title: 'On today',
        message: `${job.customer_name} at ${job.location}${job.slot ? ` (${job.slot})` : ''}.`,
        link: '/installations',
      }).catch(() => {});
    }
  }

  return `${todays.length} today, ${overdue} still open from before.`;
};

module.exports = {
  getInstallations, createInstallation, updateInstallation, deleteInstallation,
  announceTodaysJobs, nextReference,
};
