const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Settings = require('../models/Settings');
const { generateBlankReceiptForm, generateInstallmentPlanSheet } = require('../utils/pdfGenerator');
const { PLAN_SETS } = require('../config/installmentPlans');

/** Shared by both routes below. */
const buildForm = async (opts) => {
  const settings = (await Settings.findOne().lean()) || {};
  return generateBlankReceiptForm({
    logoUrl: settings.logo_url,
    company: {
      name: settings.company_name,
      address: settings.company_address,
      phone: settings.company_phone,
    },
    ...opts,
  });
};

/**
 * GET /api/forms/blank-receipt?rows=17&copies=1
 *
 * A blank receipt form to write on by hand. It carries no sale data, so any
 * signed-in staff member can print one — that is the point of it: something to
 * fall back on when the counter printer or the power is down.
 */
router.get('/blank-receipt', authenticate, async (req, res) => {
  try {
    const pdf = await buildForm({ rows: req.query.rows, copies: req.query.copies });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="receipt-form.pdf"');
    return res.end(pdf);
  } catch (err) {
    console.error('Blank receipt form error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the form.' });
  }
});

/**
 * POST /api/forms/receipt
 *
 * The same form with products already filled in. Deliberately records nothing:
 * no sale is written and no stock moves — this prints a sheet of paper. Ring
 * the sale up on the POS if it needs to count.
 *
 * Prices come from the request rather than being looked up, because the whole
 * point is writing a quote or a receipt by hand at a price that may not match
 * the shelf.
 */
router.post('/receipt', authenticate, async (req, res) => {
  try {
    const { rows, copies, items, customer, receiptNo, date, discount } = req.body || {};

    if (items && !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Items must be a list.' });
    }

    const pdf = await buildForm({
      rows,
      copies,
      discount,
      receiptNo,
      date,
      customer,
      items: (items || []).slice(0, 30).map((i) => ({
        name: String(i.name || '').slice(0, 120),
        quantity: Number(i.quantity) || 0,
        unit_price: Number(i.unit_price) || 0,
      })),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="receipt.pdf"');
    return res.end(pdf);
  } catch (err) {
    console.error('Receipt form error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the receipt.' });
  }
});

/**
 * GET /api/forms/installment-plan?set=freezer|power-station
 *
 * The installment offer sheets: every package with its terms, its ready cash
 * price where there is one, and what is in the box. A comparison page followed
 * by a page per plan. The same sheet for everyone, so any signed-in staff
 * member can print one at the counter.
 *
 * ?layout=combined  just the comparison page
 * ?layout=separate  just the page-per-plan sheets
 * ?package=218      one plan only
 */
const printPlanSheet = async (req, res) => {
  try {
    // The route keeps its old freezer-only path, so fall back to that set.
    const setKey = String(req.query.set || req.params.set || 'freezer').toLowerCase();
    const planSet = PLAN_SETS[setKey];
    if (!planSet) {
      return res.status(404).json({
        success: false,
        message: `Unknown plan set. Try one of: ${Object.keys(PLAN_SETS).join(', ')}.`,
      });
    }

    const wanted = String(req.query.package || '').trim().toLowerCase();
    const packages = wanted
      ? planSet.packages.filter((p) => p.name.toLowerCase().includes(wanted))
      : planSet.packages;

    if (packages.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching package.' });
    }

    const settings = (await Settings.findOne().lean()) || {};
    const pdf = await generateInstallmentPlanSheet({
      logoUrl: settings.logo_url,
      company: {
        name: settings.company_name,
        address: settings.company_address,
        phone: settings.company_phone,
      },
      title: planSet.title,
      packages,
      // Everything unless asked for one part: the comparison page, then a page
      // per plan.
      layout: ['combined', 'separate'].includes(req.query.layout) ? req.query.layout : 'all',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${planSet.filename}"`);
    return res.end(pdf);
  } catch (err) {
    console.error('Installment plan sheet error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the sheet.' });
  }
};

router.get('/installment-plan', authenticate, printPlanSheet);
// The original path, from before there was more than one kind of plan.
router.get('/freezer-plan', authenticate, (req, res) => {
  req.query.set = req.query.set || 'freezer';
  return printPlanSheet(req, res);
});

module.exports = router;
