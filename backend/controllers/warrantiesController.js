const Warranty = require('../models/Warranty');
const Product = require('../models/Product');
const Sale = require('../models/Sale');

const todayPart = () => {
  const now = new Date();
  return `${now.getFullYear()}`
    + `${String(now.getMonth() + 1).padStart(2, '0')}`
    + `${String(now.getDate()).padStart(2, '0')}`;
};

const nextReference = async (datePart) => {
  const todays = await Warranty.find({ reference: { $regex: `^WTY-${datePart}-` } })
    .select('reference').sort({ reference: -1 }).limit(50).lean();
  const highest = todays.reduce((max, w) => {
    const n = parseInt(String(w.reference).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `WTY-${datePart}-${String(highest + 1).padStart(4, '0')}`;
};

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The shape the screens read — coverage is a date question, not a status. */
const present = (w) => {
  const o = w.toObject ? w.toObject() : w;
  const now = new Date();
  const covered = !['void', 'rejected'].includes(o.status) && new Date(o.expires_on) > now;
  return {
    ...o,
    covered,
    days_left: Math.ceil((new Date(o.expires_on) - now) / 86400000),
  };
};

/** GET /api/warranties */
const getWarranties = async (req, res) => {
  try {
    const { q, status, expiring, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (q && String(q).trim().length > 1) {
      const rx = new RegExp(esc(String(q).trim()), 'i');
      filter.$or = [
        { serial_number: rx }, { customer_name: rx }, { customer_phone: rx },
        { product_name: rx }, { invoice_no: rx }, { reference: rx },
      ];
    }
    // Running out within the month — the ones worth telling a customer about.
    if (expiring === 'true') {
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      filter.expires_on = { $gte: new Date(), $lte: soon };
      filter.status = 'active';
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total, live] = await Promise.all([
      Warranty.find(filter)
        .populate('registered_by', 'username')
        .populate('supplier_id', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Warranty.countDocuments(filter),
      Warranty.countDocuments({ status: 'active', expires_on: { $gt: new Date() } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        warranties: records.map(present),
        summary: { in_force: live, total },
        pagination: {
          total, page: Number(page), limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
    });
  } catch (err) {
    console.error('Get warranties error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/warranties/check/:serial
 * The counter question: somebody is standing there with a unit. Covered?
 */
const checkWarranty = async (req, res) => {
  try {
    const rx = new RegExp(`^${esc(String(req.params.serial).trim())}$`, 'i');
    const found = await Warranty.findOne({ serial_number: rx })
      .populate('supplier_id', 'name');
    if (!found) {
      return res.status(404).json({
        success: false,
        message: 'No warranty registered against that serial number.',
      });
    }
    return res.status(200).json({ success: true, data: present(found) });
  } catch (err) {
    console.error('Check warranty error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/warranties/from-sale/:invoice
 *
 * The lines on a sale that carry a warranty period, so registering one after
 * the fact does not mean retyping the sale.
 */
const linesFromSale = async (req, res) => {
  try {
    const sale = await Sale.findOne({ invoice_no: String(req.params.invoice).trim() }).lean();
    if (!sale) {
      return res.status(404).json({ success: false, message: 'No sale with that invoice number.' });
    }

    const ids = (sale.items || []).map((i) => i.product_id).filter(Boolean);
    const products = ids.length
      ? await Product.find({ _id: { $in: ids } }).select('name warranty_months supplier_id').lean()
      : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));

    return res.status(200).json({
      success: true,
      data: {
        invoice_no: sale.invoice_no,
        sale_id: sale._id,
        sale_date: sale.sale_date,
        customer_name: sale.customer_name,
        customer_phone: sale.customer_phone,
        items: (sale.items || []).map((i) => {
          const p = byId.get(String(i.product_id));
          return {
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity,
            // The product's own period, where one is set. Still typeable —
            // suppliers change terms and old stock keeps the old one.
            warranty_months: p?.warranty_months || 0,
            supplier_id: p?.supplier_id,
          };
        }),
      },
    });
  } catch (err) {
    console.error('Warranty from sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** POST /api/warranties */
const createWarranty = async (req, res) => {
  try {
    const {
      product_id, product_name, serial_number, customer_name, customer_phone,
      sale_id, invoice_no, supplier_id, starts_on, months, notes,
    } = req.body;

    if (!product_name || !String(product_name).trim()) {
      return res.status(400).json({ success: false, message: 'Say which product.' });
    }
    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ success: false, message: "Enter the customer's name." });
    }
    const term = Number(months);
    if (!Number.isFinite(term) || term < 1) {
      return res.status(400).json({ success: false, message: 'How many months is it covered for?' });
    }

    const serial = (serial_number || '').trim();
    if (serial) {
      // Two units cannot carry the same serial, and a claim found against the
      // wrong one is worse than a claim not found at all.
      const clash = await Warranty.findOne({
        serial_number: new RegExp(`^${esc(serial)}$`, 'i'),
      });
      if (clash) {
        return res.status(400).json({
          success: false,
          message: `Serial ${serial} is already registered on ${clash.reference}.`,
        });
      }
    }

    const start = starts_on ? new Date(starts_on) : new Date();
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ success: false, message: 'Bad start date.' });
    }

    const datePart = todayPart();
    let record = null;
    for (let attempt = 0; attempt < 8 && !record; attempt++) {
      const reference = await nextReference(datePart);
      try {
        record = await Warranty.create({
          reference,
          product_id: product_id || undefined,
          product_name: String(product_name).trim(),
          serial_number: serial || undefined,
          customer_name: String(customer_name).trim(),
          customer_phone,
          sale_id: sale_id || undefined,
          invoice_no,
          supplier_id: supplier_id || undefined,
          starts_on: start,
          months: term,
          notes,
          registered_by: req.user._id,
        });
      } catch (err) {
        const duplicate = err?.code === 11000
          && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('reference');
        if (!duplicate || attempt === 7) throw err;
      }
    }

    return res.status(201).json({
      success: true,
      message: `${record.reference} — covered until ${record.expires_on.toDateString()}.`,
      data: present(record),
    });
  } catch (err) {
    console.error('Create warranty error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not register: ${err.message}` });
  }
};

/** POST /api/warranties/:id/claim — somebody brought it back. */
const claimWarranty = async (req, res) => {
  try {
    const record = await Warranty.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Warranty not found.' });
    }

    const { fault, outcome, note } = req.body;
    const allowed = ['repaired', 'replaced', 'refunded', 'refused', 'sent_to_supplier'];
    if (!allowed.includes(outcome)) {
      return res.status(400).json({ success: false, message: 'What was done about it?' });
    }

    record.claims.push({
      reported_at: new Date(),
      fault,
      outcome,
      note,
      handled_by: req.user._id,
    });
    // A refused claim closes the warranty; anything honoured leaves it open,
    // because a replaced unit is still under the same cover.
    record.status = outcome === 'refused' ? 'rejected' : 'claimed';
    await record.save();

    return res.status(200).json({
      success: true,
      message: `${record.reference} — ${outcome.replace(/_/g, ' ')}.`,
      data: present(record),
    });
  } catch (err) {
    console.error('Claim warranty error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** DELETE /api/warranties/:id */
const deleteWarranty = async (req, res) => {
  try {
    const record = await Warranty.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Warranty not found.' });
    }
    const { reference } = record;
    await record.deleteOne();
    return res.status(200).json({ success: true, message: `${reference} deleted.`, data: { reference } });
  } catch (err) {
    console.error('Delete warranty error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getWarranties, checkWarranty, linesFromSale, createWarranty, claimWarranty, deleteWarranty,
};
