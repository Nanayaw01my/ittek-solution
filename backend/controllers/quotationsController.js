const Quotation = require('../models/Quotation');
const { buildSaleItems, deductStock } = require('../utils/saleHelpers');
const { createSaleWithInvoice } = require('../utils/generateInvoice');

const todayPart = () => {
  const now = new Date();
  return `${now.getFullYear()}`
    + `${String(now.getMonth() + 1).padStart(2, '0')}`
    + `${String(now.getDate()).padStart(2, '0')}`;
};

const nextReference = async (datePart) => {
  const todays = await Quotation.find({ reference: { $regex: `^QT-${datePart}-` } })
    .select('reference').sort({ reference: -1 }).limit(50).lean();
  const highest = todays.reduce((max, q) => {
    const n = parseInt(String(q.reference).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `QT-${datePart}-${String(highest + 1).padStart(4, '0')}`;
};

/** A quote past its date reads as expired without anybody marking it so. */
const present = (q) => {
  const o = q.toObject ? q.toObject() : q;
  const lapsed = o.valid_until
    && ['draft', 'sent'].includes(o.status)
    && new Date(o.valid_until) < new Date();
  return { ...o, lapsed, effective_status: lapsed ? 'expired' : o.status };
};

const cleanItems = (items) => (items || [])
  .filter((i) => i && i.product_name && Number(i.quantity) > 0)
  .map((i) => ({
    product_id: i.product_id || undefined,
    product_name: String(i.product_name).trim(),
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price) || 0,
  }));

/** GET /api/quotations */
const getQuotations = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total, counts] = await Promise.all([
      Quotation.find(filter)
        .populate('prepared_by', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Quotation.countDocuments(filter),
      Quotation.aggregate([
        { $group: { _id: '$status', n: { $sum: 1 }, value: { $sum: '$total_amount' } } },
      ]),
    ]);

    const by = Object.fromEntries(counts.map((c) => [c._id, c]));
    const sent = (by.sent?.n || 0) + (by.draft?.n || 0);
    const won = by.accepted?.n || 0;
    const decided = won + (by.declined?.n || 0);

    return res.status(200).json({
      success: true,
      data: {
        quotations: records.map(present),
        summary: {
          open: sent,
          open_value: Number(((by.sent?.value || 0) + (by.draft?.value || 0)).toFixed(2)),
          won,
          won_value: Number((by.accepted?.value || 0).toFixed(2)),
          // Of the ones the customer actually answered, how many said yes.
          win_rate: decided > 0 ? Math.round((won / decided) * 100) : null,
        },
        pagination: {
          total, page: Number(page), limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
    });
  } catch (err) {
    console.error('Get quotations error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/quotations/:id */
const getQuotation = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id).populate('prepared_by', 'username');
    if (!q) return res.status(404).json({ success: false, message: 'Quotation not found.' });
    return res.status(200).json({ success: true, data: present(q) });
  } catch (err) {
    console.error('Get quotation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/quotations */
const createQuotation = async (req, res) => {
  try {
    const {
      customer_name, customer_phone, customer_address,
      items, discount, valid_until, notes, status,
    } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ success: false, message: "Enter the customer's name." });
    }
    const lines = cleanItems(items);
    if (lines.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one item.' });
    }

    const datePart = todayPart();
    let record = null;
    for (let attempt = 0; attempt < 8 && !record; attempt++) {
      const reference = await nextReference(datePart);
      try {
        record = await Quotation.create({
          reference,
          customer_name: String(customer_name).trim(),
          customer_phone,
          customer_address,
          items: lines,
          discount: Math.max(0, Number(discount) || 0),
          valid_until: valid_until ? new Date(valid_until) : undefined,
          status: ['draft', 'sent'].includes(status) ? status : 'draft',
          notes,
          prepared_by: req.user._id,
        });
      } catch (err) {
        const duplicate = err?.code === 11000
          && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('reference');
        if (!duplicate || attempt === 7) throw err;
      }
    }

    return res.status(201).json({
      success: true,
      message: `${record.reference} — ${lines.length} item${lines.length === 1 ? '' : 's'}, `
        + `GHC${record.total_amount.toFixed(2)}.`,
      data: present(record),
    });
  } catch (err) {
    console.error('Create quotation error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not save: ${err.message}` });
  }
};

/** PUT /api/quotations/:id — edit, or move it along. */
const updateQuotation = async (req, res) => {
  try {
    const record = await Quotation.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Quotation not found.' });
    if (record.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: `${record.reference} became sale ${record.invoice_no} — it cannot be changed.`,
      });
    }

    const f = req.body;
    if (f.customer_name !== undefined) record.customer_name = String(f.customer_name).trim();
    if (f.customer_phone !== undefined) record.customer_phone = f.customer_phone;
    if (f.customer_address !== undefined) record.customer_address = f.customer_address;
    if (f.items !== undefined) record.items = cleanItems(f.items);
    if (f.discount !== undefined) record.discount = Math.max(0, Number(f.discount) || 0);
    if (f.valid_until !== undefined) {
      record.valid_until = f.valid_until ? new Date(f.valid_until) : undefined;
    }
    if (f.notes !== undefined) record.notes = f.notes;
    // 'accepted' is not settable here — that goes through the sale.
    if (['draft', 'sent', 'declined', 'expired'].includes(f.status)) {
      record.status = f.status;
      if (['declined', 'expired'].includes(f.status)) record.decided_at = new Date();
    }

    await record.save();
    return res.status(200).json({
      success: true,
      message: `${record.reference} updated.`,
      data: present(record),
    });
  } catch (err) {
    console.error('Update quotation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/quotations/:id/accept
 *
 * The customer said yes. This is the only place a quotation touches stock or
 * money: the goods come off the shelf and a sale is written at the quoted
 * prices, not at today's.
 */
const acceptQuotation = async (req, res) => {
  try {
    const record = await Quotation.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Quotation not found.' });
    if (record.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: `Already sold as ${record.invoice_no}.`,
      });
    }

    const { payment_method, amount_paid } = req.body;
    const method = ['cash', 'card', 'mobile_money'].includes(payment_method)
      ? payment_method : 'cash';

    // Only catalogue lines move stock; a hand-typed line has no shelf.
    const stockLines = record.items
      .filter((i) => i.product_id)
      .map((i) => ({ product_id: i.product_id, quantity: i.quantity }));

    let built = { items: [] };
    if (stockLines.length > 0) {
      built = await buildSaleItems(stockLines);
      if (built.error) {
        return res.status(400).json({ success: false, message: built.error });
      }
    }

    // The quoted price is the promise. buildSaleItems returns today's price,
    // so the quoted one is put back over it before anything is written.
    const saleItems = record.items.map((i) => {
      const fromShelf = built.items.find(
        (b) => String(b.product_id) === String(i.product_id)
      );
      return {
        product_id: i.product_id || undefined,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        cost_price: fromShelf?.cost_price || 0,
        total: i.total,
      };
    });

    const paid = Number(amount_paid);
    const taken = Number.isFinite(paid) && paid > 0
      ? Math.min(paid, record.total_amount) : record.total_amount;
    const owing = Number((record.total_amount - taken).toFixed(2));

    const sale = await createSaleWithInvoice({
      user_id: req.user._id,
      customer_name: record.customer_name,
      customer_phone: record.customer_phone,
      form_ref: record.reference,
      subtotal: record.subtotal,
      discount: record.discount,
      discount_type: 'fixed',
      // Only the money actually handed over counts as takings; the rest is a
      // debt, and counting both would book the same cedi twice.
      total_amount: taken,
      cart_total: record.total_amount,
      debt_amount: owing,
      payment_status: owing > 0 ? 'partial' : 'paid',
      payment_method: method,
      items: saleItems,
    });

    if (built.items.length > 0) await deductStock(built.items);

    record.status = 'accepted';
    record.sale_id = sale._id;
    record.invoice_no = sale.invoice_no;
    record.decided_at = new Date();
    await record.save();

    return res.status(200).json({
      success: true,
      message: `${record.reference} sold as ${sale.invoice_no}`
        + (owing > 0 ? ` — GHC${taken.toFixed(2)} taken, GHC${owing.toFixed(2)} owing.` : '.'),
      data: present(record),
    });
  } catch (err) {
    console.error('Accept quotation error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not sell: ${err.message}` });
  }
};

/** DELETE /api/quotations/:id */
const deleteQuotation = async (req, res) => {
  try {
    const record = await Quotation.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Quotation not found.' });
    if (record.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: `${record.reference} became sale ${record.invoice_no} — deleting it would hide the sale.`,
      });
    }
    const { reference } = record;
    await record.deleteOne();
    return res.status(200).json({ success: true, message: `${reference} deleted.`, data: { reference } });
  } catch (err) {
    console.error('Delete quotation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getQuotations, getQuotation, createQuotation, updateQuotation,
  acceptQuotation, deleteQuotation,
};
