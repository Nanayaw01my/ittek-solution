const Settings = require('../models/Settings');

/**
 * Multi-currency support.
 *
 * The golden rule: every amount persisted on a Sale, Expense or report is in
 * the shop's BASE currency (GHS). Foreign currencies are a presentation layer
 * converted at the rate configured in Settings. That keeps totals, profit and
 * history comparable even when rates move.
 */

const DEFAULT_CURRENCIES = [
  { code: 'GHS', symbol: 'GH₵', rate: 1, is_active: true },
  { code: 'USD', symbol: '$', rate: 0.065, is_active: true },
  { code: 'EUR', symbol: '€', rate: 0.06, is_active: true },
  { code: 'GBP', symbol: '£', rate: 0.051, is_active: true },
];

/** All configured currencies, falling back to sane defaults. */
const getCurrencies = async () => {
  const settings = await Settings.findOne().lean();
  const list = settings?.currencies?.length ? settings.currencies : DEFAULT_CURRENCIES;
  return list.filter((c) => c.is_active !== false);
};

const getBaseCurrency = async () => {
  const settings = await Settings.findOne().lean();
  return settings?.base_currency || 'GHS';
};

/** Look up one currency by code (case-insensitive). */
const findCurrency = async (code) => {
  if (!code) return null;
  const list = await getCurrencies();
  return list.find((c) => c.code === String(code).toUpperCase()) || null;
};

/**
 * Convert an amount from the base currency into `code`.
 * Returns the base amount unchanged when the currency is unknown — better a
 * correct number in the wrong currency than a silently wrong one.
 */
const fromBase = async (amount, code) => {
  const currency = await findCurrency(code);
  if (!currency || !currency.rate) return { amount: Number(amount) || 0, rate: 1, currency: await getBaseCurrency() };
  return {
    amount: Number(((Number(amount) || 0) * currency.rate).toFixed(2)),
    rate: currency.rate,
    currency: currency.code,
    symbol: currency.symbol,
  };
};

/** Convert an amount expressed in `code` back into the base currency. */
const toBase = async (amount, code) => {
  const currency = await findCurrency(code);
  if (!currency || !currency.rate) return Number(amount) || 0;
  return Number(((Number(amount) || 0) / currency.rate).toFixed(2));
};

module.exports = { DEFAULT_CURRENCIES, getCurrencies, getBaseCurrency, findCurrency, fromBase, toBase };
