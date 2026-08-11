const { validationResult } = require('express-validator');
const Sale = require('../models/Sale');
const Debt = require('../models/Debt');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const { generateInvoiceNo } = require('../utils/generateInvoice');
const { queueEmail, templates } = require('../utils/email');
const { generateReceipt } = require('../utils/pdfGenerator');
const { withReceiptQr, buildReceiptUrl, generateReceiptQrBuffer } = require('../utils/receipt');
const { buildSaleItems, deductStock, validatePayments } = require('../utils/saleHelpers');
const loyalty = require('../utils/loyalty');
const fraud = require('../utils/fraudDetection');
const { fromBase } = require('../utils/currency');
const { normaliseGhanaPhone } = require('../utils/phone');

/**
 * Calculate cart totals with discount.
 */
const calcTotals = (items, discount = 0, discount_type = 'fixed') => {
  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  let discountAmount = 0;
  if (discount_type === 'percentage') {
    discountAmount = (subtotal * discount) / 100;
  } else {
    discountAmount = discount;
  }
  const cart_total = Math.max(0, subtotal - discountAmount);
  return { subtotal, discountAmount, cart_total };
};

/**
 * POST /api/pos/sale
 */
const processSale = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const {
      customer_name, customer_phone, cart, discount = 0, discount_type = 'fixed',
      payment_method, payments, redeem_points = 0, currency, held_sale_id,
    } = req.body;

    if (!cart || cart.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart cannot be empty.' });
    }

    // Resolve variants, validate stock, price the lines
    const built = await buildSaleItems(cart);
    if (built.error) {
      return res.status(400).json({ success: false, message: built.error });
    }
    const items = built.items;

    const { subtotal, cart_total: totalBeforeLoyalty } = calcTotals(items, discount, discount_type);

    // Loyalty redemption comes off before payment is collected
    let loyaltyDiscount = 0;
    let pointsToRedeem = Math.max(0, Math.floor(Number(redeem_points) || 0));
    if (pointsToRedeem > 0) {
      const cfg = await loyalty.getLoyaltySettings();
      const account = await loyalty.getAccount(customer_phone);
      const allowed = loyalty.maxRedeemable(account, totalBeforeLoyalty, cfg);
      if (pointsToRedeem > allowed.points) {
        pointsToRedeem = allowed.points;
      }
      loyaltyDiscount = loyalty.pointsToCurrency(pointsToRedeem, cfg);
    }

    const cart_total = Math.max(0, Number((totalBeforeLoyalty - loyaltyDiscount).toFixed(2)));

    // Split payments must add up to what is due
    const tender = validatePayments(payments, cart_total, payment_method || 'cash');
    if (tender.error) {
      return res.status(400).json({ success: false, message: tender.error });
    }

    const invoice_no = await generateInvoiceNo();
    const display = currency ? await fromBase(cart_total, currency) : null;

    // Create sale
    const sale = await Sale.create({
      invoice_no,
      user_id: req.user._id,
      customer_name,
      customer_phone,
      subtotal,
      discount,
      discount_type,
      total_amount: cart_total,
      cart_total,
      debt_amount: 0,
      payment_status: 'paid',
      payment_method: tender.method,
      payments: tender.payments,
      currency: display?.currency || 'GHS',
      exchange_rate: display?.rate || 1,
      display_total: display?.amount ?? cart_total,
      loyalty_phone: normaliseGhanaPhone(customer_phone) || undefined,
      loyalty_discount: loyaltyDiscount,
      items,
    });

    await deductStock(items);

    // Loyalty: redeem what was used, earn on what was paid
    try {
      const result = await loyalty.applySale({
        rawPhone: customer_phone,
        customerName: customer_name,
        amountPaid: cart_total,
        redeemPoints: pointsToRedeem,
        sale,
        userId: req.user._id,
      });
      if (result.points_earned || result.points_redeemed) {
        sale.points_earned = result.points_earned;
        sale.points_redeemed = result.points_redeemed;
        await sale.save();
      }
    } catch (loyaltyErr) {
      // A loyalty failure must never void a completed sale.
      console.error('Loyalty error:', loyaltyErr.message);
    }

    // Clear the held cart this sale came from, if any
    if (held_sale_id) {
      try {
        await require('../models/HeldSale').findByIdAndDelete(held_sale_id);
      } catch (_) {}
    }

    // Anomaly scan — never blocks the sale
    fraud.checkSale(sale, req.user).catch(() => {});

    // Create notification
    await Notification.create({
      user_id: null, // broadcast
      type: 'info',
      title: 'New Sale',
      message: `Sale ${invoice_no} - GH₵${cart_total.toFixed(2)} by ${req.user.username}`,
      link: `/pos/sales/${sale._id}`,
    });

    // Queue email if above threshold
    const settings = await Settings.findOne();
    const threshold = settings?.notification_settings?.large_sale_threshold || 5000;
    if (cart_total >= threshold && settings?.notification_settings?.email_notifications) {
      const recipientEmail = settings.company_email || process.env.EMAIL_USER;
      if (recipientEmail) {
        await queueEmail({
          to: recipientEmail,
          subject: `Large Sale Alert - ${invoice_no}`,
          html: templates.saleSummary({ invoice_no, customer_name, total_amount: cart_total, items, user: req.user.username }),
          priority: 'high',
        });
      }
    }

    const populated = await Sale.findById(sale._id).populate('user_id', 'username');
    return res.status(201).json({
      success: true,
      message: 'Sale processed successfully.',
      data: await withReceiptQr(populated, req),
    });
  } catch (err) {
    console.error('Process sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/pos/short-payment
 */
const processShortPayment = async (req, res) => {
  try {
    const { customer_name, customer_phone, cart, discount = 0, discount_type = 'fixed', payment_method, amount_paid } = req.body;

    if (!cart || cart.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart cannot be empty.' });
    }
    if (!customer_name) {
      return res.status(400).json({ success: false, message: 'Customer name required for debt.' });
    }

    // Resolve variants, validate stock, price the lines
    const built = await buildSaleItems(cart);
    if (built.error) {
      return res.status(400).json({ success: false, message: built.error });
    }
    const items = built.items;

    const { subtotal, cart_total } = calcTotals(items, discount, discount_type);
    const paidAmount = Math.min(Number(amount_paid) || 0, cart_total);
    const debtAmount = cart_total - paidAmount;

    // The split breakdown applies to the amount actually handed over
    const tender = validatePayments(req.body.payments, paidAmount, payment_method || 'cash');
    if (tender.error) {
      return res.status(400).json({ success: false, message: tender.error });
    }

    const invoice_no = await generateInvoiceNo();

    // Create sale
    const sale = await Sale.create({
      invoice_no,
      user_id: req.user._id,
      customer_name,
      customer_phone,
      subtotal,
      discount,
      discount_type,
      total_amount: paidAmount,
      cart_total,
      debt_amount: debtAmount,
      payment_status: 'partial',
      payment_method: tender.method,
      payments: tender.payments,
      loyalty_phone: normaliseGhanaPhone(customer_phone) || undefined,
      items,
    });

    await deductStock(items);

    fraud.checkSale(sale, req.user).catch(() => {});

    // Create Debt record
    const debt = await Debt.create({
      sale_id: sale._id,
      customer_name,
      customer_phone,
      amount_owed: debtAmount,
      amount_paid: 0,
      created_by: req.user._id,
    });

    // Notification
    await Notification.create({
      user_id: null,
      type: 'important',
      title: 'New Debt Created',
      message: `${customer_name} owes GH₵${debtAmount.toFixed(2)} - ${invoice_no}`,
      link: `/debts/${debt._id}`,
    });

    // Queue email
    const settings = await Settings.findOne();
    if (settings?.notification_settings?.email_notifications) {
      const recipientEmail = settings.company_email || process.env.EMAIL_USER;
      if (recipientEmail) {
        await queueEmail({
          to: recipientEmail,
          subject: `New Debt - ${customer_name}`,
          html: templates.debtCreated({ customer_name, amount_owed: debtAmount, due_date: debt.due_date }),
          priority: 'high',
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Short payment processed. Debt created.',
      data: { sale: await withReceiptQr(sale, req), debt },
    });
  } catch (err) {
    console.error('Short payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/pos/sales
 */
const getSales = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};

    // Sales role only sees own sales
    if (req.user.role === 'Sales') {
      filter.user_id = req.user._id;
    }

    if (startDate || endDate) {
      filter.sale_date = {};
      if (startDate) filter.sale_date.$gte = new Date(startDate);
      if (endDate) filter.sale_date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [sales, total] = await Promise.all([
      Sale.find(filter)
        .populate('user_id', 'username')
        .sort({ sale_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Sale.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: sales,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get sales error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/pos/sales/today
 */
const getTodaySales = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const filter = { sale_date: { $gte: startOfDay, $lte: endOfDay } };
    if (req.user.role === 'Sales') filter.user_id = req.user._id;

    const sales = await Sale.find(filter).populate('user_id', 'username');

    const total_revenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const total_transactions = sales.length;
    const cash_sales = sales.filter((s) => s.payment_method === 'cash').reduce((sum, s) => sum + s.total_amount, 0);
    const mobile_money = sales.filter((s) => s.payment_method === 'mobile_money').reduce((sum, s) => sum + s.total_amount, 0);
    const card_sales = sales.filter((s) => s.payment_method === 'card').reduce((sum, s) => sum + s.total_amount, 0);

    return res.status(200).json({
      success: true,
      data: {
        sales,
        summary: { total_revenue, total_transactions, cash_sales, mobile_money, card_sales },
      },
    });
  } catch (err) {
    console.error('Today sales error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/pos/sales/:id
 */
const getSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate('user_id', 'username email');
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found.' });

    // Sales role can only see own sales
    if (req.user.role === 'Sales' && String(sale.user_id._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({ success: true, data: await withReceiptQr(sale, req) });
  } catch (err) {
    console.error('Get sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/pos/sales/:id/receipt
 */
const generateSaleReceipt = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate('user_id', 'username');
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found.' });

    if (!sale.receipt_token) {
      sale.receipt_token = require('../utils/receipt').generateReceiptToken();
      await sale.save();
    }

    const settings = await Settings.findOne().lean();
    const receiptUrl = buildReceiptUrl(sale.receipt_token, req);
    const pdfBuffer = await generateReceipt(sale.toObject(), {
      logoUrl: settings?.logo_url,
      servedBy: sale.user_id?.username,
      receiptUrl,
      qrBuffer: await generateReceiptQrBuffer(receiptUrl),
      companyName: settings?.company_name,
      companyAddress: settings?.company_address,
      companyPhone: settings?.company_phone,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${sale.invoice_no}.pdf"`);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('Generate receipt error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error generating receipt.' });
  }
};

module.exports = { processSale, processShortPayment, getSales, getTodaySales, getSale, generateSaleReceipt };
