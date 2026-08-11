const crypto = require('crypto');
const HeldSale = require('../models/HeldSale');

const makeReference = () => `HOLD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/**
 * POST /api/pos/holds — park the current cart.
 * No stock is reserved: the goods stay sellable until the hold is resumed and
 * completed, which is what staff expect from a "hold this for a second".
 */
const holdSale = async (req, res) => {
  try {
    const { items, customer_name, customer_phone, label, note, discount = 0, discount_type = 'fixed' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cannot hold an empty cart.' });
    }

    const held = await HeldSale.create({
      reference: makeReference(),
      label: label || customer_name || '',
      held_by: req.user._id,
      customer_name,
      customer_phone,
      discount,
      discount_type,
      note,
      items: items.map((i) => ({
        product_id: i.product_id,
        variant_sku: i.variant_sku,
        product_name: i.product_name,
        barcode: i.barcode,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
    });

    return res.status(201).json({ success: true, message: `Cart held as ${held.reference}.`, data: held });
  } catch (err) {
    console.error('Hold sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error holding sale.' });
  }
};

/**
 * GET /api/pos/holds — list parked carts.
 * Sales staff see only their own; supervisors see the whole till.
 */
const getHolds = async (req, res) => {
  try {
    const filter = req.user.role === 'Sales' ? { held_by: req.user._id } : {};
    const holds = await HeldSale.find(filter).populate('held_by', 'username').sort({ createdAt: -1 }).limit(100);
    return res.status(200).json({ success: true, data: holds });
  } catch (err) {
    console.error('Get holds error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/pos/holds/:id — fetch one parked cart to resume it. */
const getHold = async (req, res) => {
  try {
    const held = await HeldSale.findById(req.params.id).populate('held_by', 'username');
    if (!held) return res.status(404).json({ success: false, message: 'Held sale not found.' });

    if (req.user.role === 'Sales' && String(held.held_by._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({ success: true, data: held });
  } catch (err) {
    console.error('Get hold error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** DELETE /api/pos/holds/:id — discard a parked cart. */
const deleteHold = async (req, res) => {
  try {
    const held = await HeldSale.findById(req.params.id);
    if (!held) return res.status(404).json({ success: false, message: 'Held sale not found.' });

    if (req.user.role === 'Sales' && String(held.held_by) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await held.deleteOne();
    return res.status(200).json({ success: true, message: 'Held sale discarded.' });
  } catch (err) {
    console.error('Delete hold error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { holdSale, getHolds, getHold, deleteHold };
