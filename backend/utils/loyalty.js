const LoyaltyAccount = require('../models/LoyaltyAccount');
const Settings = require('../models/Settings');
const { normaliseGhanaPhone } = require('./phone');

const DEFAULTS = {
  enabled: true,
  points_per_currency: 1,
  currency_per_point: 0.01,
  min_points_to_redeem: 100,
  max_redeem_percent: 50,
};

const getLoyaltySettings = async () => {
  const settings = await Settings.findOne().lean();
  return { ...DEFAULTS, ...(settings?.loyalty_settings || {}) };
};

/** Fetch (or create) the account for a phone number, in any format. */
const getOrCreateAccount = async (rawPhone, name) => {
  const phone = normaliseGhanaPhone(rawPhone);
  if (!phone) return null;

  let account = await LoyaltyAccount.findOne({ phone });
  if (!account) {
    account = await LoyaltyAccount.create({ phone, name: name || '' });
  } else if (name && !account.name) {
    account.name = name;
    await account.save();
  }
  return account;
};

const getAccount = async (rawPhone) => {
  const phone = normaliseGhanaPhone(rawPhone);
  if (!phone) return null;
  return LoyaltyAccount.findOne({ phone });
};

/** Base-currency value of a points balance. */
const pointsToCurrency = (points, cfg) => Number((Math.max(0, points) * cfg.currency_per_point).toFixed(2));

/**
 * How much of `cartTotal` a customer may actually pay with points right now.
 * Bounded by their balance, the redemption cap, and the cart itself.
 */
const maxRedeemable = (account, cartTotal, cfg) => {
  if (!account || !cfg.enabled) return { points: 0, amount: 0 };
  if (account.points_balance < cfg.min_points_to_redeem) return { points: 0, amount: 0 };

  const capByPercent = (Number(cartTotal) || 0) * (cfg.max_redeem_percent / 100);
  const capByBalance = pointsToCurrency(account.points_balance, cfg);
  const amount = Number(Math.min(capByPercent, capByBalance).toFixed(2));
  const points = Math.floor(amount / cfg.currency_per_point);

  return { points, amount: pointsToCurrency(points, cfg) };
};

/**
 * Apply a sale to a loyalty account: redeem first, then earn on what was
 * actually paid. Returns the deltas so the Sale can record them.
 */
const applySale = async ({ rawPhone, customerName, amountPaid, redeemPoints = 0, sale, userId }) => {
  const cfg = await getLoyaltySettings();
  if (!cfg.enabled) return { points_earned: 0, points_redeemed: 0, loyalty_discount: 0, account: null };

  const account = await getOrCreateAccount(rawPhone, customerName);
  if (!account) return { points_earned: 0, points_redeemed: 0, loyalty_discount: 0, account: null };

  let redeemed = 0;
  let discount = 0;
  if (redeemPoints > 0) {
    redeemed = Math.min(Math.floor(redeemPoints), account.points_balance);
    discount = pointsToCurrency(redeemed, cfg);
    if (redeemed > 0) {
      account.points_balance -= redeemed;
      account.transactions.push({
        type: 'redeem',
        points: -redeemed,
        sale_id: sale?._id,
        invoice_no: sale?.invoice_no,
        note: `Redeemed for a ${discount.toFixed(2)} discount`,
        created_by: userId,
      });
    }
  }

  const earned = Math.floor((Number(amountPaid) || 0) * cfg.points_per_currency);
  if (earned > 0) {
    account.points_balance += earned;
    account.lifetime_points += earned;
    account.transactions.push({
      type: 'earn',
      points: earned,
      sale_id: sale?._id,
      invoice_no: sale?.invoice_no,
      created_by: userId,
    });
  }

  account.total_spent += Number(amountPaid) || 0;
  account.visits += 1;
  account.last_visit = new Date();
  await account.save();

  return { points_earned: earned, points_redeemed: redeemed, loyalty_discount: discount, account };
};

module.exports = {
  getLoyaltySettings,
  getOrCreateAccount,
  getAccount,
  pointsToCurrency,
  maxRedeemable,
  applySale,
};
