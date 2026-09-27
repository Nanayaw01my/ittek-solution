const DamagedGood = require('../models/DamagedGood');
const Product = require('../models/Product');
const { buildSaleItems, deductStock, restoreStock } = require('../utils/saleHelpers');

const todayPart = () => {
  const now = new Date();
  return `${now.getFullYear()}`
    + `${String(now.getMonth() + 1).padStart(2, '0')}`
    + `${String(now.getDate()).padStart(2, '0')}`;
};

/** Highest issued today + 1, the way invoice numbers work. */
const nextReference = async (datePart) => {
  const todays = await DamagedGood.find({ reference: { $regex: `^DMG-${datePart}-` } })
    .select('reference')
    .sort({ reference: -1 })
    .limit(50)
    .lean();
  const highest = todays.reduce((max, d) => {
    const n = parseInt(String(d.reference).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `DMG-${datePart}-${String(highest + 1).padStart(4, '0')}`;
};

/** GET /api/damaged-goods */
const getDamagedGoods = async (req, res) => {
  try {
    const { outcome, fault, start_date, end_date, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (outcome) filter.outcome = outcome;
    if (fault) filter.fault = fault;
    if (start_date || end_date) {
      filter.reported_at = {};
      if (start_date) filter.reported_at.$gte = new Date(start_date);
      if (end_date) {
        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);
        filter.reported_at.$lte = end;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total, totals] = await Promise.all([
      DamagedGood.find(filter)
        .populate('reported_by', 'username')
        .populate('supplier_id', 'name')
        .sort({ reported_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      DamagedGood.countDocuments(filter),
      DamagedGood.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            cost: { $sum: '$total_cost' },
            units: { $sum: '$quantity' },
            // What the shop is still carrying: anything it did not get back.
            swallowed: {
              $sum: {
                $cond: [{ $in: ['$outcome', ['returned', 'replaced']] }, 0, '$total_cost'],
              },
            },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        records,
        summary: {
          total_cost: totals[0]?.cost || 0,
          units: totals[0]?.units || 0,
          // The part of it nobody made good on.
          unrecovered: totals[0]?.swallowed || 0,
          count: total,
        },
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
    });
  } catch (err) {
    console.error('Get damaged goods error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/damaged-goods
 *
 * Writing the damage down is what takes it off the shelf. The stock is moved
 * before the record is written: if there is not enough on the books to write
 * off, nothing is recorded at all, rather than leaving a note about goods the
 * shop never had.
 */
const createDamagedGood = async (req, res) => {
  try {
    const {
      product_id, product_name, quantity, fault, description,
      unit_cost, supplier_id, outcome, outcome_note,
    } = req.body;

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: 'Enter how many.' });
    }

    let name = (product_name || '').trim();
    let cost = Number(unit_cost);
    let deducted = false;
    let built = null;

    if (product_id) {
      // buildSaleItems does the looking-up and the "is there enough" check in
      // one place, the same one the till uses.
      built = await buildSaleItems([{ product_id, quantity: qty }]);
      if (built.error) {
        return res.status(400).json({ success: false, message: built.error });
      }
      const line = built.items[0];
      name = name || line.product_name;
      if (!Number.isFinite(cost)) cost = line.cost_price || 0;
    }

    if (!name) {
      return res.status(400).json({ success: false, message: 'Say which product.' });
    }
    if (!Number.isFinite(cost) || cost < 0) cost = 0;

    if (built) {
      await deductStock(built.items);
      deducted = true;
    }

    const datePart = todayPart();
    let record = null;
    for (let attempt = 0; attempt < 8 && !record; attempt++) {
      const reference = await nextReference(datePart);
      try {
        record = await DamagedGood.create({
          reference,
          product_id: product_id || undefined,
          product_name: name,
          quantity: qty,
          fault: ['faulty', 'damaged', 'expired', 'missing', 'other'].includes(fault)
            ? fault : 'damaged',
          description,
          unit_cost: cost,
          outcome: ['pending', 'returned', 'replaced', 'written_off'].includes(outcome)
            ? outcome : 'pending',
          supplier_id: supplier_id || undefined,
          outcome_note,
          stock_deducted: deducted,
          reported_by: req.user._id,
          reported_at: new Date(),
        });
      } catch (err) {
        const duplicate = err?.code === 11000
          && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('reference');
        if (!duplicate || attempt === 7) {
          // The goods are already off the shelf — put them back rather than
          // losing them to a failed write.
          if (deducted) await restoreStock(built.items).catch(() => {});
          throw err;
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: `${record.reference} recorded`
        + (deducted ? ` — ${qty} × ${name} off stock.` : '.'),
      data: record,
    });
  } catch (err) {
    console.error('Create damaged good error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not record: ${err.message}` });
  }
};

/**
 * PUT /api/damaged-goods/:id
 *
 * What became of it. A replacement from the supplier puts the goods back on
 * the shelf, because a replaced item is one the shop has again.
 */
const updateDamagedGood = async (req, res) => {
  try {
    const record = await DamagedGood.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }

    const { outcome, outcome_note, supplier_id, description } = req.body;
    const was = record.outcome;

    if (outcome && ['pending', 'returned', 'replaced', 'written_off'].includes(outcome)) {
      record.outcome = outcome;
    }
    if (outcome_note !== undefined) record.outcome_note = outcome_note;
    if (supplier_id !== undefined) record.supplier_id = supplier_id || undefined;
    if (description !== undefined) record.description = description;

    // Replaced goods come back on the shelf, once.
    let restored = false;
    if (record.outcome === 'replaced' && was !== 'replaced'
        && record.product_id && record.stock_deducted) {
      await restoreStock([{ product_id: record.product_id, quantity: record.quantity }]);
      record.stock_deducted = false;
      restored = true;
    }

    await record.save();

    return res.status(200).json({
      success: true,
      message: `${record.reference} updated`
        + (restored ? ` — ${record.quantity} × ${record.product_name} back on stock.` : '.'),
      data: record,
    });
  } catch (err) {
    console.error('Update damaged good error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/damaged-goods/:id
 *
 * Deleting means it was written down by mistake, so the goods go back on the
 * shelf — they were never damaged.
 */
const deleteDamagedGood = async (req, res) => {
  try {
    const record = await DamagedGood.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }

    let restored = false;
    if (record.product_id && record.stock_deducted) {
      await restoreStock([{ product_id: record.product_id, quantity: record.quantity }]);
      restored = true;
    }

    const { reference, product_name, quantity } = record;
    await record.deleteOne();

    return res.status(200).json({
      success: true,
      message: `${reference} deleted`
        + (restored ? ` — ${quantity} × ${product_name} back on stock.` : '.'),
      data: { reference },
    });
  } catch (err) {
    console.error('Delete damaged good error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getDamagedGoods,
  createDamagedGood,
  updateDamagedGood,
  deleteDamagedGood,
};
