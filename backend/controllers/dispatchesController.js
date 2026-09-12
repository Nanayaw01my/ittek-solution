const Dispatch = require('../models/Dispatch');
const Product = require('../models/Product');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { buildSaleItems, deductStock, restoreStock, validatePayments } = require('../utils/saleHelpers');
const { createSaleWithInvoice } = require('../utils/generateInvoice');
const { generateTableReport } = require('../utils/pdfGenerator');

const todayPart = () => {
  const now = new Date();
  return `${now.getFullYear()}`
    + `${String(now.getMonth() + 1).padStart(2, '0')}`
    + `${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * The next DSR number for today, from the highest already issued rather than a
 * count — the same reason invoice numbers are worked out that way: delete one
 * sheet and a count would hand the next one a number that is already taken,
 * and `dispatch_no` is a unique index.
 */
const nextDispatchNo = async (datePart) => {
  const todays = await Dispatch.find({ dispatch_no: { $regex: `^DSR-${datePart}-` } })
    .select('dispatch_no')
    .sort({ dispatch_no: -1 })
    .limit(50)
    .lean();

  const highest = todays.reduce((max, d) => {
    const n = parseInt(String(d.dispatch_no).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `DSR-${datePart}-${String(highest + 1).padStart(4, '0')}`;
};

/**
 * Work out the status from what is still out with the agent.
 *
 * A piece leaves the sheet either by being paid for or by coming back. Once
 * none are left out, the sheet is finished.
 */
const statusFor = (dispatch) => {
  const issued = dispatch.items.reduce((s, i) => s + i.quantity_issued, 0);
  const settled = dispatch.items.reduce(
    (s, i) => s + (i.quantity_returned || 0) + (i.quantity_sold || 0),
    0
  );
  if (settled <= 0) return 'issued';
  if (settled >= issued) return 'closed';
  return 'partly_returned';
};

/**
 * The cost price for a dispatch line, for sheets issued before it was stored.
 * Zero is returned rather than throwing — a missing cost skews the profit
 * report, but refusing the payment would leave the agent holding the money.
 */
const costPriceOf = async (item) => {
  try {
    const product = await Product.findById(item.product_id).select('cost_price variants').lean();
    if (!product) return 0;
    if (item.variant_sku) {
      const variant = (product.variants || []).find((v) => v.sku === item.variant_sku);
      if (variant) return variant.cost_price || 0;
    }
    return product.cost_price || 0;
  } catch {
    return 0;
  }
};

/**
 * True when this user may touch this sheet. A field agent is confined to their
 * own; everyone at the shop sees them all. Reported as "not found" rather than
 * "forbidden" so guessing ids tells a rep nothing about other reps' sheets.
 */
const mayTouch = (req, dispatch) =>
  req.user.role !== 'Field Agent'
  || String(dispatch.agent_user_id || '') === String(req.user._id);

/** How many of a line are still with the agent. */
const stillOut = (item) =>
  item.quantity_issued - (item.quantity_returned || 0) - (item.quantity_sold || 0);

/**
 * GET /api/dispatches/agents
 *
 * The field agents a sheet can be issued to. Its own endpoint because the
 * counter staff who hand out the goods are not allowed near user management,
 * and this exposes only a name and an id — nothing else about the account.
 */
const getFieldAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: 'Field Agent', is_active: true })
      .select('username')
      .sort({ username: 1 })
      .lean();
    return res.status(200).json({ success: true, data: agents });
  } catch (err) {
    console.error('Get field agents error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/dispatches
 * Everyone who can sign in can see the sheets — a field agent's colleague at
 * the counter needs to know what went out with them.
 */
const getDispatches = async (req, res) => {
  try {
    const { status, agent, page = 1, limit = 50 } = req.query;
    const filter = {};
    // A field agent sees their own sheets and nobody else's — one rep has no
    // business knowing what another is carrying or what they owe.
    if (req.user.role === 'Field Agent') filter.agent_user_id = req.user._id;
    if (status) filter.status = status;
    if (agent) filter.agent_name = { $regex: String(agent), $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [dispatches, total] = await Promise.all([
      Dispatch.find(filter)
        .populate('issued_by', 'username')
        .populate('closed_by', 'username')
        .sort({ issued_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Dispatch.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        dispatches,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
    });
  } catch (err) {
    console.error('Get dispatches error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/dispatches/:id */
const getDispatch = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id)
      .populate('issued_by', 'username')
      .populate('closed_by', 'username');
    if (!dispatch) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    if (!mayTouch(req, dispatch)) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    return res.status(200).json({ success: true, data: dispatch });
  } catch (err) {
    console.error('Get dispatch error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/dispatches
 * Issue goods to an agent: stock comes off the shelf, no sale is written.
 */
const createDispatch = async (req, res) => {
  try {
    const { agent_phone, destination, notes, items } = req.body;
    let { agent_name, agent_user_id } = req.body;

    // Issued to a named field agent, so the sheet lands in that person's own
    // portal. The name is read from the account rather than taken from the
    // request: a typed name that does not match any login would leave the
    // goods against a rep who can never see them.
    if (agent_user_id) {
      const agent = await User.findById(agent_user_id).select('username role is_active').lean();
      if (!agent || agent.role !== 'Field Agent' || !agent.is_active) {
        return res.status(400).json({ success: false, message: 'Choose an active field agent.' });
      }
      agent_name = agent.username;
    }

    if (!agent_name || !String(agent_name).trim()) {
      return res.status(400).json({ success: false, message: 'Enter the agent\'s name.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one product.' });
    }

    // buildSaleItems already resolves variants, checks stock and picks up the
    // prices — the same rules the till uses, so a dispatch cannot take out
    // stock the shop does not have.
    const built = await buildSaleItems(items);
    if (built.error) {
      return res.status(400).json({ success: false, message: built.error });
    }

    const dispatchItems = built.items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      variant_sku: i.variant_sku,
      variant_name: i.variant_name,
      barcode: i.barcode,
      quantity_issued: i.quantity,
      quantity_returned: 0,
      quantity_sold: 0,
      unit_price: i.unit_price,
      cost_price: i.cost_price || 0,
    }));

    const datePart = todayPart();
    let dispatch = null;
    for (let attempt = 0; attempt < 8 && !dispatch; attempt++) {
      const dispatch_no = await nextDispatchNo(datePart);
      try {
        dispatch = await Dispatch.create({
          dispatch_no,
          agent_name: String(agent_name).trim(),
          agent_phone,
          agent_user_id: agent_user_id || undefined,
          destination,
          notes,
          items: dispatchItems,
          status: 'issued',
          issued_by: req.user._id,
          issued_at: new Date(),
        });
      } catch (err) {
        const duplicateNo = err?.code === 11000
          && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('dispatch_no');
        if (!duplicateNo || attempt === 7) throw err;
        // Two counters issued a sheet at the same moment. Take the next number.
      }
    }

    // Only once the sheet is safely written — a deduction with no record of it
    // would be stock lost with nothing to explain it.
    await deductStock(built.items);

    return res.status(201).json({
      success: true,
      message: `Dispatch ${dispatch.dispatch_no} issued. Stock has been deducted.`,
      data: dispatch,
    });
  } catch (err) {
    console.error('Create dispatch error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/dispatches/:id/return
 * The agent is back with what they did not sell. Those pieces go back on the
 * shelf; the difference is what they sold on the field.
 */
const returnDispatchItems = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Enter what is being returned.' });
    }

    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    if (!mayTouch(req, dispatch)) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    if (dispatch.status === 'closed') {
      return res.status(400).json({ success: false, message: 'This dispatch is already closed.' });
    }

    const toRestore = [];
    for (const line of items) {
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const item = dispatch.items.find(
        (i) => String(i.product_id) === String(line.product_id)
          && (i.variant_sku || '') === (line.variant_sku || '')
      );
      if (!item) {
        return res.status(400).json({
          success: false,
          message: 'That product was not on this dispatch.',
        });
      }

      const out = stillOut(item);
      if (qty > out) {
        return res.status(400).json({
          success: false,
          message: `Only ${out} of ${item.product_name} is still out on this dispatch.`,
        });
      }

      item.quantity_returned = (item.quantity_returned || 0) + qty;
      toRestore.push({
        product_id: item.product_id,
        variant_sku: item.variant_sku,
        quantity: qty,
      });
    }

    if (toRestore.length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to return.' });
    }

    dispatch.status = statusFor(dispatch);
    if (dispatch.status === 'closed') {
      dispatch.closed_by = req.user._id;
      dispatch.closed_at = new Date();
    }
    await dispatch.save();
    await restoreStock(toRestore);

    return res.status(200).json({
      success: true,
      message: 'Returned items have been added back to stock.',
      data: dispatch,
    });
  } catch (err) {
    console.error('Return dispatch error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/dispatches/:id/pay
 *
 * The agent sold some of what they took out and is paying it in. THIS is the
 * point at which the goods become a sale — the sheet itself deliberately does
 * not touch the books, because at that moment nothing had been sold yet.
 *
 * Stock is NOT deducted here. It came off the shelf when the sheet was issued,
 * and deducting again would take the same piece out of stock twice.
 */
const payDispatchItems = async (req, res) => {
  try {
    const { items, payment_method, customer_name, customer_phone, discount = 0 } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Enter what was sold.' });
    }

    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    if (!mayTouch(req, dispatch)) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }

    const saleItems = [];
    for (const line of items) {
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const item = dispatch.items.find(
        (i) => String(i.product_id) === String(line.product_id)
          && (i.variant_sku || '') === (line.variant_sku || '')
      );
      if (!item) {
        return res.status(400).json({
          success: false,
          message: 'That product was not on this dispatch.',
        });
      }

      const out = stillOut(item);
      if (qty > out) {
        return res.status(400).json({
          success: false,
          message: `Only ${out} of ${item.product_name} is still out on this dispatch.`,
        });
      }

      // The agent may have sold at a different figure on the field — a haggled
      // price is normal — so an entered price is honoured and the sheet price
      // is only the default.
      const unitPrice = Number(line.unit_price) > 0 ? Number(line.unit_price) : item.unit_price;

      item.quantity_sold = (item.quantity_sold || 0) + qty;
      saleItems.push({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_sku: item.variant_sku,
        variant_name: item.variant_name,
        barcode: item.barcode,
        quantity: qty,
        unit_price: unitPrice,
        // A sale line requires a cost price. Sheets issued before this was
        // carried have none stored, so fall back to the product's.
        cost_price: item.cost_price || (await costPriceOf(item)),
        total: Number((unitPrice * qty).toFixed(2)),
      });
    }

    if (saleItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to pay for.' });
    }

    const subtotal = Number(saleItems.reduce((s, i) => s + i.total, 0).toFixed(2));
    const off = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
    const cart_total = Number((subtotal - off).toFixed(2));

    const tender = validatePayments(req.body.payments, cart_total, payment_method || 'cash');
    if (tender.error) {
      return res.status(400).json({ success: false, message: tender.error });
    }

    const sale = await createSaleWithInvoice({
      user_id: req.user._id,
      customer_name: customer_name || `Field sale — ${dispatch.agent_name}`,
      customer_phone,
      subtotal,
      discount: off,
      discount_type: 'fixed',
      total_amount: cart_total,
      cart_total,
      debt_amount: 0,
      payment_status: 'paid',
      payment_method: tender.method,
      payments: tender.payments,
      // So the sale can be traced back to the sheet it came off.
      dispatch_ref: dispatch.dispatch_no,
      items: saleItems,
    });

    dispatch.sales.push({
      sale_id: sale._id,
      invoice_no: sale.invoice_no,
      amount: cart_total,
      customer_name: customer_name || undefined,
      paid_at: new Date(),
    });
    dispatch.status = statusFor(dispatch);
    if (dispatch.status === 'closed') {
      dispatch.closed_by = req.user._id;
      dispatch.closed_at = new Date();
    }
    await dispatch.save();

    return res.status(201).json({
      success: true,
      message: `Payment recorded as sale ${sale.invoice_no}.`,
      data: sale,
    });
  } catch (err) {
    console.error('Dispatch pay error:', err.stack || err.message);
    return res.status(500).json({
      success: false,
      message: `Could not record the payment: ${err.message}`,
    });
  }
};

/**
 * PUT /api/dispatches/:id/close
 * Close the sheet with nothing further coming back: whatever is still out was
 * sold on the field and stays off the shelf.
 */
const closeDispatch = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    if (!mayTouch(req, dispatch)) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    dispatch.status = 'closed';
    dispatch.closed_by = req.user._id;
    dispatch.closed_at = new Date();
    await dispatch.save();

    return res.status(200).json({ success: true, message: 'Dispatch closed.', data: dispatch });
  } catch (err) {
    console.error('Close dispatch error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/dispatches/:id
 * Cancels the sheet and puts everything still out back on the shelf.
 */
const deleteDispatch = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    if (!mayTouch(req, dispatch)) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }

    const outstanding = dispatch.items
      .map((i) => ({
        product_id: i.product_id,
        variant_sku: i.variant_sku,
        quantity: stillOut(i),
      }))
      .filter((i) => i.quantity > 0);

    if (outstanding.length > 0) await restoreStock(outstanding);
    await dispatch.deleteOne();

    return res.status(200).json({
      success: true,
      message: outstanding.length
        ? 'Dispatch cancelled. Everything still out has been added back to stock.'
        : 'Dispatch deleted.',
    });
  } catch (err) {
    console.error('Delete dispatch error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/dispatches/:id/sheet
 * The sheet the agent carries. A blank column is left against every line so
 * they can write what they sold as they go.
 */
const getDispatchSheet = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id).populate('issued_by', 'username');
    if (!dispatch) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }
    if (!mayTouch(req, dispatch)) {
      return res.status(404).json({ success: false, message: 'Dispatch not found.' });
    }

    const settings = await Settings.findOne().lean();
    const money = (n) => Number(n || 0).toLocaleString('en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });

    const rows = dispatch.items.map((i, idx) => ({
      idx: idx + 1,
      name: i.variant_name ? `${i.product_name} (${i.variant_name})` : i.product_name,
      qty: i.quantity_issued,
      price: money(i.unit_price),
      value: money(i.unit_price * i.quantity_issued),
    }));

    const totalQty = dispatch.items.reduce((s, i) => s + i.quantity_issued, 0);
    const totalValue = dispatch.items.reduce((s, i) => s + i.unit_price * i.quantity_issued, 0);

    const pdf = await generateTableReport({
      logoUrl: settings?.logo_url || null,
      company: {
        name: settings?.company_name,
        address: settings?.company_address,
        phone: settings?.company_phone,
      },
      title: `FIELD DISPATCH — ${dispatch.dispatch_no}`,
      subtitle: [
        `Agent: ${dispatch.agent_name}`,
        dispatch.agent_phone && `Tel: ${dispatch.agent_phone}`,
        dispatch.destination && `Area: ${dispatch.destination}`,
        `Issued by: ${dispatch.issued_by?.username || '—'}`,
        `Date: ${new Date(dispatch.issued_at).toLocaleDateString('en-GB')}`,
      ].filter(Boolean).join('   |   '),
      summary: [
        { label: 'Items', value: String(dispatch.items.length) },
        { label: 'Total Qty Out', value: String(totalQty) },
        { label: 'Stock Value', value: `GHC ${money(totalValue)}` },
        { label: 'Paid In', value: `GHC ${money(dispatch.soldValue())}` },
      ],
      columns: [
        { key: 'idx', label: '#', weight: 0.5, align: 'center' },
        { key: 'name', label: 'PRODUCT', weight: 5 },
        { key: 'qty', label: 'QTY OUT', weight: 1, align: 'center' },
        { key: 'price', label: 'PRICE (GHC)', weight: 1.4, align: 'right' },
        { key: 'value', label: 'VALUE (GHC)', weight: 1.5, align: 'right' },
        { key: 'sold', label: 'SOLD', weight: 1, align: 'center', blank: true },
        { key: 'back', label: 'RETURNED', weight: 1.2, align: 'center', blank: true },
      ],
      rows,
      grid: true,
      rowHeight: 24,
      note: 'Goods issued on this sheet remain the property of the company until sold and accounted for.\n'
        + 'Agent: __________________          Received back by: __________________',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${dispatch.dispatch_no}.pdf"`
    );
    return res.send(pdf);
  } catch (err) {
    console.error('Dispatch sheet error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the sheet.' });
  }
};

module.exports = {
  getFieldAgents,
  getDispatches,
  getDispatch,
  createDispatch,
  returnDispatchItems,
  payDispatchItems,
  closeDispatch,
  deleteDispatch,
  getDispatchSheet,
};
