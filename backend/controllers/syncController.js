const Sale = require('../models/Sale');
const Debt = require('../models/Debt');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const { generateInvoiceNo } = require('../utils/generateInvoice');
const { buildSaleItems, deductStock, validatePayments } = require('../utils/saleHelpers');
const { normaliseGhanaPhone } = require('../utils/phone');
const loyalty = require('../utils/loyalty');
const fraud = require('../utils/fraudDetection');

const calcTotals = (items, discount = 0, discount_type = 'fixed') => {
  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const discountAmount = discount_type === 'percentage'
    ? (subtotal * discount) / 100
    : discount;
  return { subtotal, cart_total: Math.max(0, subtotal - discountAmount) };
};

const processSingleSale = async (type, payload, userId, username) => {
  const {
    customer_name, customer_phone, cart, discount = 0, discount_type = 'fixed',
    payment_method, amount_paid, payments, redeem_points = 0, client_ref,
  } = payload;

  if (!cart || !cart.length) throw new Error('Empty cart');

  // The same sale can arrive twice: the till may have tried to send it live,
  // lost the reply after the server had written it, and queued it as well.
  // Treat that as already done rather than booking it a second time.
  if (client_ref) {
    const existing = await Sale.findOne({ client_ref });
    if (existing) {
      return { invoice_no: existing.invoice_no, sale_id: existing._id, duplicate: true, shortfalls: [] };
    }
  }

  // Use the same builder as the online till so variants are resolved and
  // priced identically — an offline sale of a variant must not sync back as
  // the parent product at the parent's price.
  //
  // allowShortStock: this sale already happened. The goods left the shop and
  // the customer paid, possibly hours ago. Refusing it because the server's
  // stock figure is now lower puts nothing back on the shelf — it only loses
  // the record of the money. The shortfall is reported instead.
  const built = await buildSaleItems(cart, { allowShortStock: true });
  if (built.error) throw new Error(built.error);
  const items = built.items;
  const shortfalls = built.shortfalls || [];

  const { subtotal, cart_total } = calcTotals(items, discount, discount_type);
  const invoice_no = await generateInvoiceNo();

  if (type === 'short_payment') {
    if (!customer_name) throw new Error('Customer name required for short payment');
    const paidAmount = Math.min(Number(amount_paid) || 0, cart_total);
    const debtAmount = cart_total - paidAmount;

    const tender = validatePayments(payments, paidAmount, payment_method || 'cash');
    if (tender.error) throw new Error(tender.error);

    const sale = await Sale.create({
      invoice_no, client_ref: client_ref || undefined,
      user_id: userId, customer_name, customer_phone,
      subtotal, discount, discount_type,
      total_amount: paidAmount, cart_total, debt_amount: debtAmount,
      payment_status: 'partial', payment_method: tender.method, payments: tender.payments,
      loyalty_phone: normaliseGhanaPhone(customer_phone) || undefined,
      items,
    });

    await deductStock(items);

    const debt = await Debt.create({
      sale_id: sale._id, customer_name, customer_phone,
      amount_owed: debtAmount, amount_paid: 0, created_by: userId,
    });

    await Notification.create({
      user_id: null, type: 'important', title: 'New Debt (offline sync)',
      message: `${customer_name} owes GH₵${debtAmount.toFixed(2)} — ${invoice_no}`,
      link: `/debts/${debt._id}`,
    });

    return { invoice_no, sale_id: sale._id, shortfalls };
  }

  // Regular full-payment sale
  const tender = validatePayments(payments, cart_total, payment_method || 'cash');
  if (tender.error) throw new Error(tender.error);

  const sale = await Sale.create({
    invoice_no, client_ref: client_ref || undefined,
    user_id: userId, customer_name, customer_phone,
    subtotal, discount, discount_type,
    total_amount: cart_total, cart_total, debt_amount: 0,
    payment_status: 'paid', payment_method: tender.method, payments: tender.payments,
    loyalty_phone: normaliseGhanaPhone(customer_phone) || undefined,
    items,
  });

  await deductStock(items);

  // Points are awarded on sync, not offline, because the balance lives on the
  // server and two tills could otherwise spend the same points.
  try {
    const result = await loyalty.applySale({
      rawPhone: customer_phone,
      customerName: customer_name,
      amountPaid: cart_total,
      redeemPoints: Math.max(0, Math.floor(Number(redeem_points) || 0)),
      sale,
      userId,
    });
    if (result.points_earned || result.points_redeemed) {
      sale.points_earned = result.points_earned;
      sale.points_redeemed = result.points_redeemed;
      await sale.save();
    }
  } catch (err) {
    console.error('Loyalty sync error:', err.message);
  }

  fraud.checkSale(sale, { _id: userId, username }).catch(() => {});

  await Notification.create({
    user_id: null, type: 'info', title: 'Sale synced (offline)',
    message: `${invoice_no} — GH₵${cart_total.toFixed(2)} by ${username}`,
    link: `/pos/sales/${sale._id}`,
  });

  // Stock that did not add up is worth someone's attention: it means the
  // shelf and the books disagree, not that the sale was wrong.
  if (shortfalls.length > 0) {
    await Notification.create({
      user_id: null, type: 'important', title: 'Stock shortfall on sync',
      message: `${invoice_no} sold more than stock showed: `
        + shortfalls.map((s) => `${s.product_name} (sold ${s.sold}, had ${s.available})`).join('; ')
        + '. The sale was recorded — check the stock count.',
      link: '/products',
    });
  }

  return { invoice_no, sale_id: sale._id, shortfalls };
};

/**
 * POST /api/sync/offline-sales
 * Accepts: { sales: [{ type: 'sale'|'short_payment', payload: {...} }] }
 */
const syncOfflineSales = async (req, res) => {
  try {
    const { sales } = req.body;
    if (!Array.isArray(sales) || !sales.length) {
      return res.status(400).json({ success: false, message: 'No sales to sync.' });
    }

    const results = [];
    for (const entry of sales) {
      try {
        const result = await processSingleSale(
          entry.type || 'sale',
          entry.payload,
          req.user._id,
          req.user.username,
        );
        results.push({ status: 'synced', ...result });
      } catch (err) {
        results.push({ status: 'failed', reason: err.message });
      }
    }

    const synced = results.filter(r => r.status === 'synced').length;
    const failed = results.filter(r => r.status === 'failed').length;

    // The per-sale status is the thing that matters, and the client must read
    // it: a sale that failed here has NOT been written, and deleting it from
    // the device's queue on the strength of a 200 loses it for good. That is
    // exactly what used to happen.
    return res.status(200).json({
      success: true,
      message: `${synced} synced, ${failed} failed.`,
      data: { results, synced, failed },
    });
  } catch (err) {
    console.error('Offline sync error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error during sync.' });
  }
};

module.exports = { syncOfflineSales };
