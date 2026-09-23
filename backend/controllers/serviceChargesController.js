const ServiceCharge = require('../models/ServiceCharge');
const Sale = require('../models/Sale');
const { createSaleWithInvoice } = require('../utils/generateInvoice');
const { validatePayments } = require('../utils/saleHelpers');

const todayPart = () => {
  const now = new Date();
  return `${now.getFullYear()}`
    + `${String(now.getMonth() + 1).padStart(2, '0')}`
    + `${String(now.getDate()).padStart(2, '0')}`;
};

/** Highest issued today + 1, as with every other reference in the system. */
const nextReference = async (datePart) => {
  const todays = await ServiceCharge.find({ reference: { $regex: `^SRV-${datePart}-` } })
    .select('reference').sort({ reference: -1 }).limit(50).lean();
  const highest = todays.reduce((max, s) => {
    const n = parseInt(String(s.reference).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `SRV-${datePart}-${String(highest + 1).padStart(4, '0')}`;
};

/** GET /api/service-charges */
const getServiceCharges = async (req, res) => {
  try {
    const { from, to, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (from || to) {
      filter.charged_at = {};
      if (from) filter.charged_at.$gte = new Date(from);
      if (to) filter.charged_at.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [charges, total] = await Promise.all([
      ServiceCharge.find(filter)
        .populate('recorded_by', 'username')
        .sort({ charged_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ServiceCharge.countDocuments(filter),
    ]);

    const totalAmount = charges.reduce((sum, c) => sum + (c.amount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        charges,
        total_amount: Number(totalAmount.toFixed(2)),
        pagination: {
          total, page: Number(page), limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
    });
  } catch (err) {
    console.error('Get service charges error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not load: ${err.message}` });
  }
};

/**
 * POST /api/service-charges
 *
 * Writes a real Sale as well as the charge itself. That is what puts the money
 * in the day's takings and on the sales reports, and it is what lets the
 * ordinary thermal receipt print for a job — no separate receipt to maintain.
 *
 * The sale carries a single line with no cost price, which is right: a repair
 * consumes labour, not stock, so the whole amount is margin. No stock moves.
 */
const createServiceCharge = async (req, res) => {
  try {
    const {
      customer_name, customer_phone, location, description,
      amount, payment_method, reference_no, notes,
    } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ success: false, message: "Enter the customer's name." });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ success: false, message: 'Say what the work was.' });
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ success: false, message: 'Enter the amount charged.' });
    }

    const tender = validatePayments(req.body.payments, value, payment_method || 'cash');
    if (tender.error) {
      return res.status(400).json({ success: false, message: tender.error });
    }

    const datePart = todayPart();
    let charge = null;
    let sale = null;

    for (let attempt = 0; attempt < 8 && !charge; attempt++) {
      const reference = await nextReference(datePart);

      // The sale first: if it cannot be written the money has not been
      // recorded anywhere, and a charge with no sale would be takings the
      // shop never sees.
      sale = await createSaleWithInvoice({
        user_id: req.user._id,
        customer_name: String(customer_name).trim(),
        customer_phone,
        service_ref: reference,
        subtotal: value,
        discount: 0,
        discount_type: 'fixed',
        total_amount: value,
        cart_total: value,
        debt_amount: 0,
        payment_status: 'paid',
        payment_method: tender.method,
        payments: tender.payments,
        items: [{
          product_name: String(description).trim(),
          quantity: 1,
          unit_price: value,
          cost_price: 0,
          total: value,
        }],
      });

      try {
        charge = await ServiceCharge.create({
          reference,
          customer_name: String(customer_name).trim(),
          customer_phone,
          location,
          description: String(description).trim(),
          amount: value,
          payment_method: tender.method === 'split' ? 'cash' : tender.method,
          reference_no,
          sale_id: sale._id,
          invoice_no: sale.invoice_no,
          recorded_by: req.user._id,
          charged_at: new Date(),
          notes,
        });
      } catch (err) {
        const duplicate = err?.code === 11000
          && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('reference');
        if (!duplicate || attempt === 7) throw err;
        // Someone else took that reference. The sale just written is not
        // wanted either — remove it before going round again, or the takings
        // would carry a charge that does not exist.
        await Sale.findByIdAndDelete(sale._id).catch(() => {});
        sale = null;
      }
    }

    return res.status(201).json({
      success: true,
      message: `${charge.reference} recorded — ${sale.invoice_no}.`,
      data: { charge, sale_id: sale._id, invoice_no: sale.invoice_no },
    });
  } catch (err) {
    console.error('Create service charge error:', err.stack || err.message);
    return res.status(500).json({
      success: false,
      message: `Could not record the charge: ${err.message}`,
    });
  }
};

/**
 * DELETE /api/service-charges/:id
 * Takes the sale with it, or the money would stay in the takings with nothing
 * behind it.
 */
const deleteServiceCharge = async (req, res) => {
  try {
    const charge = await ServiceCharge.findById(req.params.id);
    if (!charge) {
      return res.status(404).json({ success: false, message: 'Service charge not found.' });
    }
    if (charge.sale_id) await Sale.findByIdAndDelete(charge.sale_id).catch(() => {});
    const { reference } = charge;
    await charge.deleteOne();

    return res.status(200).json({
      success: true,
      message: `${reference} deleted, and removed from the day's takings.`,
    });
  } catch (err) {
    console.error('Delete service charge error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not delete: ${err.message}` });
  }
};

module.exports = { getServiceCharges, createServiceCharge, deleteServiceCharge };
