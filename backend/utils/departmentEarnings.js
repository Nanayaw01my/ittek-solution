const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Refund = require('../models/Refund');
const Dispatch = require('../models/Dispatch');
const Installation = require('../models/Installation');
const { classify, ASPECT_KEYS } = require('../config/aspects');

/**
 * What each side of the business actually brought in, in a month.
 *
 * Worked out from the shop's own records rather than typed in, because
 * a target somebody has to keep updating by hand is a target that is
 * out of date by Wednesday.
 *
 * Where the money comes from, and one place it does NOT:
 *
 *   Till sales, split by what was sold. This already includes field
 *   dispatch: taking a rep's money with the Pay button writes a real
 *   sale with the products on it, which is why this does not go to the
 *   dispatch sheets for revenue as well. Doing both would count the
 *   same panel twice and flatter every department that sells on the
 *   road.
 *
 *   Refunds come off, as they do everywhere else in the system now. A
 *   department does not get to keep credit for a battery that came
 *   back.
 *
 * Goods still out on a sheet and not yet paid for are reported
 * separately and deliberately not counted. No money has come in, and a
 * target met with stock sitting in somebody's boot is not met.
 */

const money = (n) => Number((Number(n) || 0).toFixed(2));

const monthRange = (year, month) => ({
  from: new Date(year, month - 1, 1),
  to: new Date(year, month, 1),
});

const blank = () => ({ revenue: 0, refunded: 0, net: 0, pieces: 0, sales: new Set() });

/**
 * Everything, per department, for one month.
 *
 * One pass over the month's sales, which is the same work the Business
 * Lines screen does — the products and categories are fetched for what
 * actually sold rather than for the whole catalogue.
 */
const earningsFor = async (year, month) => {
  const { from, to } = monthRange(year, month);

  const sales = await Sale.find({
    sale_date: { $gte: from, $lt: to },
    // Money against goods counted on the day they were sold. Counting
    // it again here would put the same panel in Solar twice.
    payment_status: { $ne: 'debt_payment' },
  }).select('_id items sale_date').lean();

  const ids = [...new Set(
    sales.flatMap((s) => (s.items || []).map((i) => i.product_id).filter(Boolean)).map(String)
  )].filter((id) => mongoose.isValidObjectId(id));

  const [products, categories] = await Promise.all([
    Product.find({ _id: { $in: ids } }).select('name aspect category_id').lean(),
    Category.find({}).select('name aspect').lean(),
  ]);

  const catById = new Map(categories.map((c) => [String(c._id), c]));
  const prodById = new Map(products.map((p) => [String(p._id), p]));

  const byAspect = new Map(ASPECT_KEYS.map((k) => [k, blank()]));
  /** Which sale fell on which side, so refunds can be put back. */
  const saleAspect = new Map();

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const product = prodById.get(String(item.product_id)) || { name: item.product_name };
      const category = product.category_id ? catById.get(String(product.category_id)) : null;
      const { aspect } = classify({ ...product, product_name: item.product_name }, category);

      const row = byAspect.get(aspect) || byAspect.get('other');
      row.revenue += Number(item.total) || 0;
      row.pieces += Number(item.quantity) || 0;
      row.sales.add(String(sale._id));

      /**
       * A sale of panels and a router belongs to both sides, so a
       * refund against it cannot simply be charged to one. The biggest
       * line decides, which is the best answer available without
       * asking the customer which half they brought back.
       */
      const held = saleAspect.get(String(sale._id));
      const value = Number(item.total) || 0;
      if (!held || value > held.value) saleAspect.set(String(sale._id), { aspect, value });
    }
  }

  // Refunds given in this month, charged to the side the sale was on.
  const refunds = await Refund.find({
    status: 'approved',
    refund_date: { $gte: from, $lt: to },
  }).select('sale_id refund_amount').lean();

  for (const r of refunds) {
    const held = saleAspect.get(String(r.sale_id));
    const row = byAspect.get(held?.aspect || 'other') || byAspect.get('other');
    row.refunded += Number(r.refund_amount) || 0;
  }

  for (const row of byAspect.values()) {
    row.revenue = money(row.revenue);
    row.refunded = money(row.refunded);
    row.net = money(row.revenue - row.refunded);
    row.sales = row.sales.size;
  }

  return byAspect;
};

/**
 * Stock out on field sheets and not yet paid for, per department.
 *
 * Reported beside the figure, never inside it. It is the honest answer
 * to "how are we doing" — a department two thousand short with eight
 * thousand sitting in a rep's boot is in a different position from one
 * two thousand short with nothing out — but it is not money the shop
 * has, and a target is about money the shop has.
 */
const stillOutFor = async () => {
  const sheets = await Dispatch.find({ status: { $ne: 'closed' } })
    .select('items')
    .lean();

  const ids = [...new Set(
    sheets.flatMap((d) => (d.items || []).map((i) => i.product_id).filter(Boolean)).map(String)
  )].filter((id) => mongoose.isValidObjectId(id));

  const [products, categories] = await Promise.all([
    Product.find({ _id: { $in: ids } }).select('name aspect category_id').lean(),
    Category.find({}).select('name aspect').lean(),
  ]);
  const catById = new Map(categories.map((c) => [String(c._id), c]));
  const prodById = new Map(products.map((p) => [String(p._id), p]));

  const out = new Map(ASPECT_KEYS.map((k) => [k, 0]));

  for (const sheet of sheets) {
    for (const item of sheet.items || []) {
      const left = (Number(item.quantity_issued) || 0)
        - (Number(item.quantity_returned) || 0)
        - (Number(item.quantity_sold) || 0);
      if (left <= 0) continue;

      const product = prodById.get(String(item.product_id)) || { name: item.product_name };
      const category = product.category_id ? catById.get(String(product.category_id)) : null;
      const { aspect } = classify({ ...product, product_name: item.product_name }, category);
      out.set(aspect, (out.get(aspect) || 0) + left * (Number(item.unit_price) || 0));
    }
  }

  for (const [k, v] of out) out.set(k, money(v));
  return out;
};

/**
 * Installations booked in the month, as a count.
 *
 * A count and not a figure, because an installation record carries a
 * customer, a date and the work, and no amount anywhere. The money for
 * the job is on the sale that goes with it and is already counted
 * there; counting it twice because it also appears here would be the
 * field-dispatch mistake by another route.
 */
const installationsFor = async (year, month) => {
  const { from, to } = monthRange(year, month);
  return Installation.countDocuments({
    scheduled_for: { $gte: from, $lt: to },
    status: { $nin: ['cancelled'] },
  });
};

module.exports = {
  earningsFor, stillOutFor, installationsFor, monthRange, money,
};
