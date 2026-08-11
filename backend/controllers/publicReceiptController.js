const Sale = require('../models/Sale');
const Settings = require('../models/Settings');

/**
 * GET /api/public/receipt/:token
 *
 * Login-free receipt lookup for the QR code on printed receipts.
 * Only customer-facing fields are returned — cost prices, profit, product ids,
 * the cashier's account details and the sale's ObjectId never leave here.
 */
const getPublicReceipt = async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();

    // Tokens are 32 hex chars (16 random bytes). Reject anything else outright
    // so scanners/crawlers can't probe the collection.
    if (!/^[a-f0-9]{32}$/i.test(token)) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    const sale = await Sale.findOne({ receipt_token: token })
      .populate('user_id', 'username')
      .lean();

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    const settings = (await Settings.findOne().lean()) || {};

    return res.status(200).json({
      success: true,
      data: {
        shop: {
          name: settings.company_name || 'DAN & DOR SOLAR COMPANY LIMITED',
          address: settings.company_address || '',
          phone: settings.company_phone || '',
          logo_url: settings.logo_url || '',
          currency_symbol: settings.currency_symbol || 'GH₵',
        },
        receipt: {
          invoice_no: sale.invoice_no,
          sale_date: sale.sale_date,
          served_by: sale.user_id?.username || 'Staff',
          customer_name: sale.customer_name || '',
          items: (sale.items || []).map((item) => ({
            product_name: item.product_name,
            variant_name: item.variant_name || '',
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
          })),
          subtotal: sale.subtotal,
          discount_amount: Math.max(0, (sale.subtotal || 0) - (sale.cart_total || sale.total_amount || 0)),
          total: sale.cart_total || sale.total_amount || 0,
          amount_paid: sale.total_amount || 0,
          balance_due: sale.debt_amount || 0,
          payment_method: sale.payment_method,
          payment_status: sale.payment_status,
          // Method + amount only — no card or MoMo references leave the server.
          payment_splits: (sale.payments || []).map((p) => ({ method: p.method, amount: p.amount })),
          loyalty_discount: sale.loyalty_discount || 0,
          points_earned: sale.points_earned || 0,
        },
      },
    });
  } catch (err) {
    console.error('Public receipt error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getPublicReceipt };
