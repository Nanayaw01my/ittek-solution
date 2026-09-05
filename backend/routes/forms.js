const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const Settings = require('../models/Settings');

const {
  generateBlankReceiptForm, generateInstallmentPlanSheet, generateInstallmentTable,
  generateFixedPriceList, generateAcceptanceLetter,
  generateCompletionLetter, generateInternshipCertificate,
} = require('../utils/pdfGenerator');
const { PLAN_SETS, PRICE_LISTS } = require('../config/installmentPlans');
const { IPHONE_PACKAGES } = require('../config/iphonePlans');

/**
 * Every sheet on this router is Manager and above.
 *
 * These are the shop's stationery and its price lists — blank receipt pads,
 * installment terms, the iPhone catalogue, acceptance letters. A Sales user
 * sells at the till; handing out the shop's offer sheets is not part of that,
 * and the screen is hidden from them, so the server says the same.
 */
router.use(authenticate, requireLevel(2));

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
 * A blank receipt form to write on by hand. It carries no sale data — it is
 * something to fall back on when the counter printer or the power is down.
 */
router.get('/blank-receipt', async (req, res) => {
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
router.post('/receipt', async (req, res) => {
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
 * by a page per plan.
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

router.get('/installment-plan', printPlanSheet);
// The original path, from before there was more than one kind of plan.
router.get('/freezer-plan', (req, res) => {
  req.query.set = req.query.set || 'freezer';
  return printPlanSheet(req, res);
});

/**
 * GET /api/forms/price-sheet?set=solar-systems
 *
 * A straight price list: the product and what it costs. No deposit, no
 * schedule, no late-payment term — this is not an installment sheet and must
 * not read like one.
 */
router.get('/price-sheet', async (req, res) => {
  try {
    const setKey = String(req.query.set || 'solar-systems').toLowerCase();
    const list = PRICE_LISTS[setKey];
    if (!list) {
      return res.status(404).json({
        success: false,
        message: `Unknown price list. Try one of: ${Object.keys(PRICE_LISTS).join(', ')}.`,
      });
    }

    const settings = (await Settings.findOne().lean()) || {};
    const pdf = await generateFixedPriceList({
      logoUrl: settings.logo_url,
      company: {
        name: settings.company_name,
        address: settings.company_address,
        phone: settings.company_phone,
      },
      title: list.title,
      subtitle: list.subtitle,
      items: list.items,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${list.filename}"`);
    return res.end(pdf);
  } catch (err) {
    console.error('Price sheet error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the sheet.' });
  }
});

/**
 * GET /api/forms/iphone-plan
 *
 * The standing iPhone installment offer: every model the shop stocks, its cash
 * price, and what it costs paid over three months or twelve weeks.
 *
 * Printed as a table rather than a page per model — thirty-three phones would
 * otherwise be a thirty-three page handout.
 */
router.get('/iphone-plan', async (req, res) => {
  try {
    const settings = (await Settings.findOne().lean()) || {};
    const pdf = await generateInstallmentTable({
      logoUrl: settings.logo_url,
      company: {
        name: settings.company_name,
        address: settings.company_address,
        phone: settings.company_phone,
      },
      title: 'IPHONE INSTALLMENT PLAN',
      subtitle: 'Half the total is paid as deposit. The balance is cleared over 3 months or 12 weeks.',
      packages: IPHONE_PACKAGES,
      note: 'Where no cash price is shown, the installment price is already the cash price. '
        + 'The iPhone 7 is sold outright only and is not on this sheet — see the iPhone price list.',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="iphone-installment-plan.pdf"');
    return res.end(pdf);
  } catch (err) {
    console.error('iPhone plan sheet error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the sheet.' });
  }
});

/**
 * POST /api/forms/phone-plan
 *
 * An installment sheet for phones. Unlike the freezer, power station and
 * lithium sets, these are not fixed offers held in a config file — phone
 * prices move week to week, so the models and figures are typed in and the
 * sheet is printed from them.
 *
 * The weekly and monthly figures are worked out here rather than taken from
 * the request: the schedule on a sheet handed to a customer has to divide the
 * balance exactly, and the one place that can be guaranteed is the place that
 * prints it.
 */
router.post('/phone-plan', async (req, res) => {
  try {
    const body = req.body || {};
    const months = Math.min(24, Math.max(1, Number(body.months) || 3));
    const weeks = Math.min(104, Math.max(1, Number(body.weeks) || 12));

    const items = Array.isArray(body.items) ? body.items : [];
    const packages = items
      .map((i) => {
        const name = String(i.name || '').trim().slice(0, 120);
        const total = Number(i.total) || 0;
        // A deposit above the price would print a negative schedule; clamp it
        // rather than refusing the sheet over a typo in one row.
        const deposit = Math.min(Math.max(0, Number(i.deposit) || 0), total);
        const balance = total - deposit;
        const cash = Number(i.cashPrice) || 0;

        // Kept to the pesewa. Rounding up to the cedi would collect more than
        // the balance across the term without saying so on the sheet.
        const round = (n) => Math.round(n * 100) / 100;

        return {
          name,
          total,
          deposit,
          months,
          monthly: round(balance / months),
          weeks,
          weekly: round(balance / weeks),
          // Only when it is a real alternative price, not a blank field.
          ...(cash > 0 && cash < total ? { cashPrice: cash } : {}),
          contents: String(i.contents || '')
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 8),
        };
      })
      .filter((p) => p.name && p.total > 0)
      .slice(0, 12);

    if (packages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Add at least one phone with a model name and a total price.',
      });
    }

    const settings = (await Settings.findOne().lean()) || {};
    const pdf = await generateInstallmentPlanSheet({
      logoUrl: settings.logo_url,
      company: {
        name: settings.company_name,
        address: settings.company_address,
        phone: settings.company_phone,
      },
      title: String(body.title || 'IPHONE INSTALLMENT PLAN').toUpperCase().slice(0, 60),
      packages,
      layout: ['combined', 'separate'].includes(body.layout) ? body.layout : 'all',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="phone-installment-plan.pdf"');
    return res.end(pdf);
  } catch (err) {
    console.error('Phone plan sheet error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the sheet.' });
  }
});

/**
 * POST /api/forms/acceptance-letter
 *
 * An acceptance letter for a student coming on industrial attachment or
 * internship. Only the name is required; every other field simply shapes the
 * sentences, so a letter written with half the details still reads properly.
 */
router.post('/acceptance-letter', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Enter the person\'s name.' });
    }

    const settings = (await Settings.findOne().lean()) || {};
    const pdf = await generateAcceptanceLetter({
      logoUrl: settings.logo_url,
      company: {
        name: settings.company_name,
        address: settings.company_address,
        phone: settings.company_phone,
      },
      name,
      title: req.body.title,
      institution: req.body.institution,
      programme: req.body.programme,
      kind: req.body.kind,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      department: req.body.department,
      addressee: req.body.addressee,
      reference: req.body.reference,
      signatoryName: req.body.signatoryName,
      signatoryRole: req.body.signatoryRole,
    });

    const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="acceptance-letter-${safe}.pdf"`);
    return res.end(pdf);
  } catch (err) {
    console.error('Acceptance letter error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate the letter.' });
  }
});

/**
 * The three documents that follow a student through an attachment:
 * the acceptance letter before, the completion letter after, and the
 * certificate they keep. They take the same details, so they are built the
 * same way — only the name is required, and each generator assembles its
 * sentences from whatever else was given.
 */
const personDocument = (generate, filenamePrefix, label) => async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Enter the person's name." });
    }

    const settings = (await Settings.findOne().lean()) || {};
    const pdf = await generate({
      logoUrl: settings.logo_url,
      company: {
        name: settings.company_name,
        address: settings.company_address,
        phone: settings.company_phone,
      },
      ...req.body,
      name,
    });

    const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filenamePrefix}-${safe}.pdf"`);
    return res.end(pdf);
  } catch (err) {
    console.error(`${label} error:`, err.message);
    return res.status(500).json({ success: false, message: `Could not generate the ${label}.` });
  }
};

/** POST /api/forms/completion-letter */
router.post('/completion-letter', personDocument(
  generateCompletionLetter, 'completion-letter', 'completion letter',
));

/** POST /api/forms/internship-certificate */
router.post('/internship-certificate', personDocument(
  generateInternshipCertificate, 'certificate', 'certificate',
));

module.exports = router;
