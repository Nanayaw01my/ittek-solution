const Product = require('../models/Product');

/**
 * Turn incoming cart lines into validated sale items, resolving variants and
 * checking stock. Shared by the sale, short-payment and layaway flows so all
 * three agree on pricing and stock rules.
 *
 * @returns {Promise<{ error?: string, items?: Array }>}
 */
const buildSaleItems = async (cart) => {
  const items = [];

  for (const cartItem of cart) {
    const product = await Product.findById(cartItem.product_id);
    if (!product || !product.is_active) {
      return { error: `Product not found: ${cartItem.product_id}` };
    }

    // A product with variants is never sold directly — the till must say which one.
    if (product.has_variants) {
      const variant = product.findVariant(cartItem.variant_sku);
      if (!variant) {
        return { error: `Select a variant for ${product.name}.` };
      }
      if (variant.quantity < cartItem.quantity) {
        return {
          error: `Insufficient stock for ${product.name} (${variant.name}). Available: ${variant.quantity}`,
        };
      }
      items.push({
        product_id: product._id,
        product_name: product.name,
        variant_sku: variant.sku,
        variant_name: variant.name,
        barcode: variant.barcode || product.barcode,
        quantity: cartItem.quantity,
        unit_price: variant.selling_price,
        cost_price: variant.cost_price,
        total: variant.selling_price * cartItem.quantity,
      });
      continue;
    }

    if (product.quantity < cartItem.quantity) {
      return { error: `Insufficient stock for ${product.name}. Available: ${product.quantity}` };
    }
    items.push({
      product_id: product._id,
      product_name: product.name,
      barcode: product.barcode,
      quantity: cartItem.quantity,
      unit_price: product.selling_price,
      cost_price: product.cost_price,
      total: product.selling_price * cartItem.quantity,
    });
  }

  return { items };
};

/**
 * Deduct stock for sold items, from the variant when there is one.
 * Variant writes go through save() so the parent's roll-up quantity stays right.
 */
const deductStock = async (items) => {
  for (const item of items) {
    if (item.variant_sku) {
      const product = await Product.findById(item.product_id);
      if (!product) continue;
      const variant = product.findVariant(item.variant_sku);
      if (variant) {
        variant.quantity = Math.max(0, variant.quantity - item.quantity);
        await product.save(); // pre-save hook recalculates product.quantity
      }
    } else {
      await Product.findByIdAndUpdate(item.product_id, { $inc: { quantity: -item.quantity } });
    }
  }
};

/** Put stock back (layaway cancellation, refunds). */
const restoreStock = async (items) => {
  for (const item of items) {
    if (item.variant_sku) {
      const product = await Product.findById(item.product_id);
      if (!product) continue;
      const variant = product.findVariant(item.variant_sku);
      if (variant) {
        variant.quantity += item.quantity;
        await product.save();
      }
    } else {
      await Product.findByIdAndUpdate(item.product_id, { $inc: { quantity: item.quantity } });
    }
  }
};

/**
 * Validate a split-payment breakdown against the amount actually due.
 *
 * @param {Array} payments  [{ method, amount, reference }]
 * @param {number} expected amount that must be covered
 * @returns {{ error?: string, payments?: Array, method?: string, total?: number }}
 */
const validatePayments = (payments, expected, fallbackMethod = 'cash') => {
  if (!Array.isArray(payments) || payments.length === 0) {
    return { payments: [{ method: fallbackMethod, amount: Number(expected) || 0 }], method: fallbackMethod, total: Number(expected) || 0 };
  }

  const cleaned = [];
  for (const p of payments) {
    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Every payment split must have an amount greater than zero.' };
    }
    if (!['cash', 'card', 'mobile_money'].includes(p.method)) {
      return { error: `Invalid payment method: ${p.method}` };
    }
    cleaned.push({ method: p.method, amount: Number(amount.toFixed(2)), reference: p.reference || undefined });
  }

  const total = Number(cleaned.reduce((sum, p) => sum + p.amount, 0).toFixed(2));

  // Tolerate rounding dust, reject real mismatches.
  if (Math.abs(total - Number(expected)) > 0.05) {
    return {
      error: `Payment splits total ${total.toFixed(2)} but ${Number(expected).toFixed(2)} is due.`,
    };
  }

  const method = cleaned.length > 1 ? 'split' : cleaned[0].method;
  return { payments: cleaned, method, total };
};

module.exports = { buildSaleItems, deductStock, restoreStock, validatePayments };
