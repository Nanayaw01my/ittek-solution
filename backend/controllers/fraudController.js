const FraudAlert = require('../models/FraudAlert');
const fraud = require('../utils/fraudDetection');

/** GET /api/fraud/alerts */
const getAlerts = async (req, res) => {
  try {
    const { status = 'open', severity, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (severity) filter.severity = severity;

    const skip = (Number(page) - 1) * Number(limit);
    const [alerts, total] = await Promise.all([
      FraudAlert.find(filter)
        .populate('user_id', 'username role')
        .populate('reviewed_by', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      FraudAlert.countDocuments(filter),
    ]);

    const summary = {
      open: await FraudAlert.countDocuments({ status: 'open' }),
      high: await FraudAlert.countDocuments({ status: 'open', severity: 'high' }),
      last_24h: await FraudAlert.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86400000) } }),
    };

    return res.status(200).json({
      success: true,
      data: alerts,
      summary,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get fraud alerts error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PATCH /api/fraud/alerts/:id — mark an alert reviewed or dismissed.
 * A dismissal needs a note: these are judgement calls and the reasoning
 * matters more than the flag itself.
 */
const reviewAlert = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!['reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be reviewed or dismissed.' });
    }
    if (status === 'dismissed' && !String(note || '').trim()) {
      return res.status(400).json({ success: false, message: 'Give a reason when dismissing an alert.' });
    }

    const alert = await FraudAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });

    alert.status = status;
    alert.review_note = String(note || '').trim();
    alert.reviewed_by = req.user._id;
    alert.reviewed_at = new Date();
    await alert.save();

    return res.status(200).json({ success: true, message: `Alert ${status}.`, data: alert });
  } catch (err) {
    console.error('Review alert error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/fraud/scan — run the periodic sweep on demand. */
const runScan = async (req, res) => {
  try {
    const created = await fraud.runDailyScan();
    return res.status(200).json({
      success: true,
      message: created.length ? `Scan complete — ${created.length} new alert(s).` : 'Scan complete — nothing flagged.',
      data: created,
    });
  } catch (err) {
    console.error('Fraud scan error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getAlerts, reviewAlert, runScan };
