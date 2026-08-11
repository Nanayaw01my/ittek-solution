const LoyaltyAccount = require('../models/LoyaltyAccount');
const loyalty = require('../utils/loyalty');
const { normaliseGhanaPhone } = require('../utils/phone');

/**
 * GET /api/loyalty/lookup?phone=...&cart_total=...
 * Called from the till while ringing up: returns the balance and how much of
 * this specific cart the customer could pay with points.
 */
const lookup = async (req, res) => {
  try {
    const { phone, cart_total = 0 } = req.query;
    const normalised = normaliseGhanaPhone(phone);
    if (!normalised) {
      return res.status(400).json({ success: false, message: 'Not a valid Ghana phone number.' });
    }

    const cfg = await loyalty.getLoyaltySettings();
    const account = await LoyaltyAccount.findOne({ phone: normalised });

    if (!account) {
      return res.status(200).json({
        success: true,
        data: {
          exists: false, phone: normalised, points_balance: 0,
          redeemable: { points: 0, amount: 0 }, settings: cfg,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        exists: true,
        phone: account.phone,
        name: account.name,
        points_balance: account.points_balance,
        lifetime_points: account.lifetime_points,
        total_spent: account.total_spent,
        visits: account.visits,
        points_value: loyalty.pointsToCurrency(account.points_balance, cfg),
        redeemable: loyalty.maxRedeemable(account, Number(cart_total) || 0, cfg),
        settings: cfg,
      },
    });
  } catch (err) {
    console.error('Loyalty lookup error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/loyalty/accounts — paged list for the loyalty admin page. */
const listAccounts = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (search) {
      const normalised = normaliseGhanaPhone(search);
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: normalised || { $regex: String(search).replace(/\D/g, ''), $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [accounts, total] = await Promise.all([
      LoyaltyAccount.find(filter).select('-transactions').sort({ points_balance: -1 }).skip(skip).limit(Number(limit)),
      LoyaltyAccount.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: accounts,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('List loyalty accounts error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/loyalty/accounts/:id — one account with its points history. */
const getAccount = async (req, res) => {
  try {
    const account = await LoyaltyAccount.findById(req.params.id).populate('transactions.created_by', 'username');
    if (!account) return res.status(404).json({ success: false, message: 'Loyalty account not found.' });

    const cfg = await loyalty.getLoyaltySettings();
    return res.status(200).json({
      success: true,
      data: { ...account.toObject(), points_value: loyalty.pointsToCurrency(account.points_balance, cfg) },
    });
  } catch (err) {
    console.error('Get loyalty account error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/loyalty/accounts/:id/adjust — manual correction by a manager.
 * Every adjustment is written to the account's transaction log with a reason,
 * so points can't be quietly conjured up.
 */
const adjustPoints = async (req, res) => {
  try {
    const { points, note } = req.body;
    const delta = Math.round(Number(points));

    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ success: false, message: 'Enter a non-zero number of points.' });
    }
    if (!note || !String(note).trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required for manual adjustments.' });
    }

    const account = await LoyaltyAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Loyalty account not found.' });

    if (delta < 0 && account.points_balance + delta < 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot deduct ${Math.abs(delta)} points — balance is ${account.points_balance}.`,
      });
    }

    account.points_balance += delta;
    if (delta > 0) account.lifetime_points += delta;
    account.transactions.push({ type: 'adjust', points: delta, note: String(note).trim(), created_by: req.user._id });
    await account.save();

    return res.status(200).json({ success: true, message: 'Points adjusted.', data: account });
  } catch (err) {
    console.error('Adjust points error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { lookup, listAccounts, getAccount, adjustPoints };
