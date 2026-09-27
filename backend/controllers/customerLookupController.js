const Sale = require('../models/Sale');
const Debt = require('../models/Debt');
const Layaway = require('../models/Layaway');
const CreditAgreement = require('../models/CreditAgreement');
const PhoneSale = require('../models/PhoneSale');
const ServiceCharge = require('../models/ServiceCharge');

/**
 * One customer, everything they have ever done with the shop.
 *
 * There is no customer table behind the counter — a sale, a debt, a layaway
 * and a phone application each carry the name and number typed at the time.
 * So the phone number is the identity, matched on its last nine digits: the
 * same person is 0244555666 to one clerk and +233244555666 to the next, and
 * both should bring back the same customer.
 */
const digits = (v) => String(v || '').replace(/\D/g, '');

/**
 * Matches a stored number however it was typed, on its national part.
 *
 * The pattern has to survive the raw string as somebody entered it, spaces,
 * dashes and all — the regex runs against the stored value, not a cleaned
 * one — so anything that is not a digit is allowed between the digits.
 */
const phoneMatcher = (phone) => {
  const tail = digits(phone).slice(-9);
  if (tail.length < 9) return null;
  return new RegExp(`${tail.split('').join('\\D*')}\\D*$`);
};

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/customers/lookup?q=
 *
 * Who the shop knows, gathered from wherever their name was written down.
 * Each source is asked separately and the answers folded together by number,
 * because the same person appears in several of them.
 */
const lookupCustomers = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(200).json({ success: true, data: { customers: [] } });
    }

    const rx = new RegExp(esc(q), 'i');
    const by = { $or: [{ customer_name: rx }, { customer_phone: rx }] };
    const pick = 'customer_name customer_phone';

    const [sales, debts, layaways, credits, phones, services] = await Promise.all([
      Sale.find(by).select(`${pick} sale_date`).sort({ sale_date: -1 }).limit(40).lean(),
      Debt.find(by).select(pick).limit(40).lean(),
      Layaway.find(by).select(pick).limit(40).lean(),
      CreditAgreement.find(by).select(pick).limit(40).lean(),
      PhoneSale.find(by).select(pick).limit(40).lean(),
      ServiceCharge.find(by).select(pick).limit(40).lean(),
    ]);

    // Folded by the national part of the number, so one person is one row.
    const found = new Map();
    const add = (row, where) => {
      const key = digits(row.customer_phone).slice(-9);
      if (!key) return;
      const existing = found.get(key);
      if (existing) {
        existing.sources.add(where);
        // Keep the longest name seen — it is usually the fullest one.
        if ((row.customer_name || '').length > (existing.name || '').length) {
          existing.name = row.customer_name;
        }
        return;
      }
      found.set(key, {
        phone: row.customer_phone,
        name: row.customer_name,
        sources: new Set([where]),
      });
    };

    sales.forEach((r) => add(r, 'sales'));
    debts.forEach((r) => add(r, 'debts'));
    layaways.forEach((r) => add(r, 'layaway'));
    credits.forEach((r) => add(r, 'credit'));
    phones.forEach((r) => add(r, 'phone credit'));
    services.forEach((r) => add(r, 'service'));

    return res.status(200).json({
      success: true,
      data: {
        customers: [...found.values()]
          .map((c) => ({ ...c, sources: [...c.sources] }))
          .slice(0, 25),
      },
    });
  } catch (err) {
    console.error('Customer lookup error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/customers/profile/:phone
 *
 * Everything about one person on one page: what they have bought, what they
 * owe across all four kinds of credit, and what they have paid.
 */
const getCustomerProfile = async (req, res) => {
  try {
    const rx = phoneMatcher(req.params.phone);
    if (!rx) {
      return res.status(400).json({ success: false, message: 'That is not a phone number.' });
    }
    const by = { customer_phone: rx };

    const [sales, debts, layaways, credits, phones, services] = await Promise.all([
      Sale.find(by)
        .select('invoice_no total_amount payment_method sale_date items debt_amount')
        .sort({ sale_date: -1 })
        .limit(50)
        .lean(),
      Debt.find(by).sort({ createdAt: -1 }).lean(),
      Layaway.find(by).sort({ createdAt: -1 }).lean(),
      CreditAgreement.find(by).sort({ createdAt: -1 }).lean(),
      PhoneSale.find(by).sort({ submitted_at: -1 }).lean(),
      ServiceCharge.find(by).sort({ charged_at: -1 }).limit(50).lean(),
    ]);

    const sum = (rows, f) => Number(rows.reduce((t, r) => t + (Number(f(r)) || 0), 0).toFixed(2));

    // What is still owed, wherever it is owed from. Each kind keeps its own
    // shape, so each is asked its own way rather than guessed at.
    const owing = {
      debts: sum(debts.filter((d) => d.status !== 'paid'),
        (d) => Math.max(0, (d.amount_owed || 0) - (d.amount_paid || 0))),
      layaway: sum(layaways.filter((l) => !['completed', 'cancelled'].includes(l.status)),
        (l) => l.balance),
      credit: sum(credits.filter((c) => c.status === 'active'), (c) => c.remaining),
      phone_credit: sum(phones.filter((p) => p.status === 'approved'), (p) => p.balance),
    };
    owing.total = Number(
      (owing.debts + owing.layaway + owing.credit + owing.phone_credit).toFixed(2)
    );

    const name = sales[0]?.customer_name
      || debts[0]?.customer_name || layaways[0]?.customer_name
      || credits[0]?.customer_name || phones[0]?.customer_name
      || services[0]?.customer_name || 'Unknown';

    const spend = sum(sales, (s) => s.total_amount) + sum(services, (s) => s.amount);

    return res.status(200).json({
      success: true,
      data: {
        customer: {
          name,
          phone: req.params.phone,
          first_seen: sales.length ? sales[sales.length - 1].sale_date : null,
          last_seen: sales[0]?.sale_date || null,
        },
        totals: {
          spend: Number(spend.toFixed(2)),
          sales_count: sales.length,
          service_count: services.length,
          owing,
        },
        sales,
        debts,
        layaways,
        credits,
        phone_sales: phones,
        services,
      },
    });
  } catch (err) {
    console.error('Customer profile error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { lookupCustomers, getCustomerProfile };
