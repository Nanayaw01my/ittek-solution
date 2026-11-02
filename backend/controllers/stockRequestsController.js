const { validationResult } = require('express-validator');
const { isOwner } = require('../middleware/rbac');
const StockRequest = require('../models/StockRequest');
const Notification = require('../models/Notification');
const Product = require('../models/Product');


/**
 * A request as somebody who is not an owner may see it.
 *
 * The cost is filled in by the server now, from the shop's own record, so
 * it would travel back to whoever asked for the stock — and a sales
 * attendant is shown no cost price anywhere else in the system. Taking the
 * fields out on the way out keeps that true of this screen too, without
 * making the owners' view any poorer.
 */
const withoutMoney = (request) => {
  const plain = typeof request?.toObject === 'function' ? request.toObject() : { ...request };
  delete plain.total_amount;
  plain.items = (plain.items || []).map((line) => {
    const { estimated_cost, total, selling_price, ...rest } = line;
    return rest;
  });
  return plain;
};

/**
 * GET /api/stock-requests
 */
const getStockRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};

    /**
     * Anybody who is not an owner sees only what they asked for.
     *
     * This used to name the Manager role, which was the only role that
     * could reach the screen. Opening it to sales attendants would have
     * handed every attendant the whole shop's buying list — what is being
     * ordered, in what quantity, at what cost — because a rule written
     * about one role says nothing about the next one to arrive.
     *
     * Asked as a question about rank instead: a CEO, COO or Super Admin
     * sees every request because approving them is their job; everyone
     * else sees their own.
     */
    if (!isOwner(req.user.role)) {
      filter.created_by = req.user._id;
    }
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [requests, total] = await Promise.all([
      StockRequest.find(filter)
        .populate('created_by', 'username')
        .populate('approved_by', 'username')
        .sort({ request_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StockRequest.countDocuments(filter),
    ]);

    const owner = isOwner(req.user.role);
    return res.status(200).json({
      success: true,
      data: owner ? requests : requests.map(withoutMoney),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('Get stock requests error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/stock-requests
 */
const createStockRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { items, notes } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item required.' });
    }

    // Take the line however it arrives. The screen sends product ids and the
    // record stores a named line, and a mismatch between the two used to fail
    // deep in the database and come back as a flat "Server error" with nothing
    // to act on. Anything genuinely missing is named below instead.
    const lines = [];
    for (const raw of items) {
      const name = String(raw.product_name || raw.name || '').trim();
      const quantity = Number(raw.quantity_requested ?? raw.quantity);
      // A line with no product behind it is a new item being asked for.
      const isNew = !!(raw.is_new_product ?? raw.isNew) || !(raw.product_id || raw.product);

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Every line needs a product — pick one, or type the name of a new one.',
        });
      }
      if (!Number.isFinite(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `How many ${name}? Enter a quantity of at least 1.`,
        });
      }

      /**
       * What it costs is not the requester's business, and not their job.
       *
       * The form used to ask for an estimated cost on every line and a
       * selling price on every new one. That was three fields of guesswork
       * standing between somebody noticing an empty shelf and saying so —
       * and once sales attendants could raise requests, it was also asking
       * them to type numbers they are deliberately never shown anywhere
       * else in the system.
       *
       * So nothing about money is read from the request. For something
       * already stocked the cost is looked up here, from the shop's own
       * record, so the owner still sees what approving will cost. For a new
       * item there is nothing to look up and the owner names the price when
       * they approve it, which is the moment they decide to buy.
       */
      const stocked = (raw.product_id || raw.product)
        ? await Product.findById(raw.product_id || raw.product).select('cost_price')
        : null;
      const cost = Number(stocked?.cost_price) || 0;

      lines.push({
        product_id: raw.product_id || raw.product || undefined,
        product_name: name,
        quantity_requested: quantity,
        estimated_cost: cost,
        total: Number((quantity * cost).toFixed(2)),
        is_new_product: isNew,
        // Named by the owner at approval; see the note above.
        selling_price: undefined,
        category_id: raw.category_id || raw.category || undefined,
      });
    }

    const total_amount = Number(lines.reduce((sum, i) => sum + i.total, 0).toFixed(2));

    const request = await StockRequest.create({
      created_by: req.user._id,
      items: lines,
      total_amount,
      notes,
    });

    // Notify CEO/Super Admin
    await Notification.create({
      user_id: null,
      type: 'important',
      title: 'New Stock Request',
      message: (() => {
        const brandNew = lines.filter((l) => l.is_new_product).map((l) => l.product_name);
        const base = `${req.user.username} submitted a stock request for ${lines.length} item(s).`;
        return brandNew.length
          ? `${base} ${brandNew.length} not stocked before: ${brandNew.join(', ')}.`
          : base;
      })(),
      link: `/stock-requests/${request._id}`,
    });

    return res.status(201).json({ success: true, message: 'Stock request submitted.', data: request });
  } catch (err) {
    // The real reason, on screen and in the log. "Server error." told the
    // person nothing and left no trail to follow.
    console.error('Create stock request error:', err.stack || err.message);
    if (err.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: first?.message || 'That request is missing something.',
      });
    }
    return res.status(500).json({
      success: false,
      message: `Could not submit the request: ${err.message}`,
    });
  }
};

/**
 * GET /api/stock-requests/:id
 */
const getStockRequest = async (req, res) => {
  try {
    const request = await StockRequest.findById(req.params.id)
      .populate('created_by', 'username')
      .populate('approved_by', 'username');

    if (!request) return res.status(404).json({ success: false, message: 'Stock request not found.' });

    if (!isOwner(req.user.role) && String(request.created_by._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({
      success: true,
      data: isOwner(req.user.role) ? request : withoutMoney(request),
    });
  } catch (err) {
    console.error('Get stock request error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/stock-requests/:id/approve
 */
const approveStockRequest = async (req, res) => {
  try {
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Stock request not found.' });

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is not pending.' });
    }

    /**
     * The owner may approve less than was asked for — or none of a line.
     *
     * Quantities arrive aligned to the request's own lines, since those have
     * no ids of their own. Anything not spoken for keeps the quantity that
     * was requested, so approving without touching the numbers behaves
     * exactly as it always did.
     */
    const asked = Array.isArray(req.body?.quantities) ? req.body.quantities : null;
    /**
     * The prices, which only an owner ever sees or sets.
     *
     * The requester no longer types a cost — for something already stocked
     * it comes from the shop's own record, and for a new item nobody knows
     * it until somebody decides to buy. Both arrive here aligned to the
     * request's lines, the same way the quantities do, and both are
     * optional: leaving them alone keeps whatever the line already had.
     */
    const costs = Array.isArray(req.body?.costs) ? req.body.costs : null;
    const prices = Array.isArray(req.body?.prices) ? req.body.prices : null;
    const given = (list, i) => {
      if (!list || list[i] === undefined || list[i] === null || list[i] === '') return null;
      const n = Number(list[i]);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const changes = [];
    request.items.forEach((line, i) => {
      let qty = line.quantity_requested;
      if (asked && asked[i] !== undefined && asked[i] !== null && asked[i] !== '') {
        const n = Number(asked[i]);
        if (Number.isFinite(n) && n >= 0) qty = Math.floor(n);
      }
      const cost = given(costs, i);
      if (cost !== null) line.estimated_cost = Number(cost.toFixed(2));
      const price = given(prices, i);
      if (price !== null) line.selling_price = Number(price.toFixed(2));

      line.quantity_approved = qty;
      line.total = Number((qty * (line.estimated_cost || 0)).toFixed(2));
      if (qty !== line.quantity_requested) {
        changes.push(`${line.product_name}: ${line.quantity_requested} → ${qty}`);
      }
    });

    if (request.items.every((l) => (l.quantity_approved || 0) === 0)) {
      return res.status(400).json({
        success: false,
        message: 'That approves nothing. Reject the request instead, so the reason is recorded.',
      });
    }

    // The money follows what was approved, not what was asked for.
    request.total_amount = Number(
      request.items.reduce((sum, l) => sum + (l.total || 0), 0).toFixed(2)
    );


    /**
     * Approving a new item is how it gets onto the shelf.
     *
     * Only an owner may create a product, and the owner is the one standing
     * here saying yes — so this is the right moment to make it, rather than
     * sending them off to the products screen to type the same thing again
     * and probably spell it differently.
     *
     * It is created with no stock. Nothing has arrived yet; the request is
     * permission to buy it. The quantity lands when the delivery is received
     * against the purchase, the same as for anything already stocked.
     */
    const created = [];
    for (const line of request.items) {
      if (!line.is_new_product || line.product_id) continue;
      // Approved at nothing means the owner said no to that line.
      if ((line.quantity_approved ?? line.quantity_requested) <= 0) continue;

      // Somebody may well have added it by hand in the meantime, and a second
      // copy of the same item is worse than no new item at all.
      const existing = await Product.findOne({
        name: new RegExp(`^${String(line.product_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).select('_id name');

      if (existing) {
        line.product_id = existing._id;
        continue;
      }

      const product = await Product.create({
        name: line.product_name,
        cost_price: line.estimated_cost || 0,
        selling_price: line.selling_price || line.estimated_cost || 0,
        category_id: line.category_id || undefined,
        quantity: 0,
      });
      line.product_id = product._id;
      created.push(product.name);
    }

    request.status = 'approved';
    request.approved_by = req.user._id;
    request.approved_date = new Date();
    await request.save();

    await Notification.create({
      user_id: request.created_by,
      type: 'info',
      title: 'Stock Request Approved',
      message: [
        `Your stock request has been approved by ${req.user.username}.`,
        changes.length ? `Quantities changed — ${changes.join(', ')}.` : '',
        created.length
          ? `${created.join(', ')} ${created.length === 1 ? 'is' : 'are'} now in the products list, `
            + 'at zero stock until the goods come in.'
          : '',
      ].filter(Boolean).join(' '),
      link: `/stock-requests/${request._id}`,
    });

    return res.status(200).json({
      success: true,
      message: [
        'Approved.',
        changes.length ? `Changed: ${changes.join(', ')}.` : '',
        created.length ? `Added to products: ${created.join(', ')}.` : '',
      ].filter(Boolean).join(' '),
      data: request,
    });
  } catch (err) {
    console.error('Approve stock request error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/stock-requests/:id/reject
 */
const rejectStockRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Stock request not found.' });

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is not pending.' });
    }

    request.status = 'rejected';
    request.rejected_reason = reason || 'No reason provided.';
    request.approved_by = req.user._id;
    request.approved_date = new Date();
    await request.save();

    await Notification.create({
      user_id: request.created_by,
      type: 'important',
      title: 'Stock Request Rejected',
      message: `Your stock request was rejected. Reason: ${request.rejected_reason}`,
      link: `/stock-requests/${request._id}`,
    });

    return res.status(200).json({ success: true, message: 'Stock request rejected.', data: request });
  } catch (err) {
    console.error('Reject stock request error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/stock-requests/:id
 */
const deleteStockRequest = async (req, res) => {
  try {
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Stock request not found.' });

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be deleted.' });
    }

    if (!isOwner(req.user.role) && String(request.created_by) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await StockRequest.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Stock request deleted.' });
  } catch (err) {
    console.error('Delete stock request error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getStockRequests, createStockRequest, getStockRequest, approveStockRequest, rejectStockRequest, deleteStockRequest };
