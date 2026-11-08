const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const { isOwner, seesOwnRecordsOnly } = require('../middleware/rbac');

/**
 * Complaints.
 *
 * Whoever heard it writes it down; the owners see all of them and settle
 * them. A sales attendant sees their own, for the same reason they see
 * their own sales and nobody else's.
 */

const scopeFor = (user) => {
  // Owners and the managers above the counter see the lot — a complaint
  // nobody senior can see is a complaint that was never raised.
  if (isOwner(user?.role) || !seesOwnRecordsOnly(user?.role)) return {};
  return { raised_by: user._id };
};

/** GET /api/complaints */
const getComplaints = async (req, res) => {
  try {
    const { status, from, to, page = 1, limit = 50 } = req.query;
    const filter = scopeFor(req.user);
    if (status && status !== 'all') filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [complaints, total, open] = await Promise.all([
      Complaint.find(filter)
        .populate('raised_by', 'username')
        .populate('resolved_by', 'username')
        .sort({ status: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Complaint.countDocuments(filter),
      Complaint.countDocuments({ ...filter, status: 'open' }),
    ]);

    return res.status(200).json({
      success: true,
      data: complaints,
      open,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get complaints error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/complaints */
const createComplaint = async (req, res) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const detail = String(req.body?.detail || '').trim();
    if (!subject) return res.status(400).json({ success: false, message: 'What is the complaint about?' });
    if (!detail) return res.status(400).json({ success: false, message: 'Say what happened.' });

    const complaint = await Complaint.create({
      subject,
      detail,
      customer_name: String(req.body?.customer_name || '').trim(),
      customer_phone: String(req.body?.customer_phone || '').trim(),
      about: String(req.body?.about || '').trim(),
      severity: ['low', 'medium', 'high'].includes(req.body?.severity) ? req.body.severity : 'medium',
      raised_by: req.user._id,
    });

    /**
     * The owners are told as it is raised.
     *
     * A complaint sitting in a list nobody opens is the paper notebook
     * again, with extra steps.
     */
    await Notification.create({
      user_id: null,
      type: complaint.severity === 'high' ? 'important' : 'info',
      title: 'Complaint raised',
      message: `${req.user.username}: ${subject}`
        + (complaint.customer_name ? ` — ${complaint.customer_name}` : ''),
      link: '/complaints',
    });

    return res.status(201).json({ success: true, data: complaint });
  } catch (err) {
    console.error('Create complaint error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** PUT /api/complaints/:id/resolve */
const resolveComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    /**
     * Settling one is not for the person who raised it.
     *
     * An attendant marking their own complaint resolved is the complaint
     * disappearing, not being dealt with.
     */
    if (seesOwnRecordsOnly(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'A manager or an owner settles a complaint.',
      });
    }
    if (complaint.status === 'resolved') {
      return res.status(400).json({ success: false, message: 'That one is already settled.' });
    }

    const resolution = String(req.body?.resolution || '').trim();
    if (!resolution) {
      return res.status(400).json({ success: false, message: 'Say what was done about it.' });
    }

    complaint.status = 'resolved';
    complaint.resolution = resolution;
    complaint.resolved_by = req.user._id;
    complaint.resolved_at = new Date();
    await complaint.save();

    return res.status(200).json({ success: true, data: complaint });
  } catch (err) {
    console.error('Resolve complaint error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getComplaints, createComplaint, resolveComplaint, scopeFor };
