const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Settings = require('../models/Settings');
const { generateBlankReceiptForm } = require('../utils/pdfGenerator');

/**
 * GET /api/forms/blank-receipt?rows=17&copies=1
 *
 * A blank receipt form to write on by hand. It carries no sale data, so any
 * signed-in staff member can print one — that is the point of it: something to
 * fall back on when the counter printer or the power is down.
 */
router.get('/blank-receipt', authenticate, async (req, res) => {
  try {
    const settings = (await Settings.findOne().lean()) || {};
    const pdf = await generateBlankReceiptForm({
      logoUrl: settings.logo_url,
      company: {
        name: settings.company_name,
        address: settings.company_address,
        phone: settings.company_phone,
      },
      rows: req.query.rows,
      copies: req.query.copies,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="receipt-form.pdf"');
    return res.end(pdf);
  } catch (err) {
    console.error('Blank receipt form error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the form.' });
  }
});

module.exports = router;
