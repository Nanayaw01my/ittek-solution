const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getCreditAgreements, createCreditAgreement, getCreditAgreement,
  updateCreditAgreement, recordPayment, generatePDF,
  exchangeProduct, exchangeNotePDF,
} = require('../controllers/creditAgreementsController');

// Manager (2) and above
const managerPlus = [authenticate, requireLevel(2)];

router.use(managerPlus);

router.get('/', getCreditAgreements);

router.post(
  '/',
  [
    body('customer_name').notEmpty().withMessage('Customer name is required.'),
    body('customer_phone').notEmpty().withMessage('Customer phone is required.'),
    body('total_amount').isNumeric({ min: 0.01 }).withMessage('Total amount must be positive.'),
  ],
  auditLog('CREATE_CREDIT_AGREEMENT', (req) => ({ customer: req.body.customer_name, amount: req.body.total_amount })),
  createCreditAgreement
);

router.get('/:id', getCreditAgreement);
router.get('/:id/pdf', generatePDF);

router.put(
  '/:id',
  auditLog('UPDATE_CREDIT_AGREEMENT', (req) => ({ agreement_id: req.params.id })),
  updateCreditAgreement
);

router.post(
  '/:id/payment',
  [body('amount').isNumeric({ min: 0.01 }).withMessage('Payment amount must be positive.')],
  auditLog('CREDIT_AGREEMENT_PAYMENT', (req) => ({ agreement_id: req.params.id, amount: req.body.amount })),
  recordPayment
);

// Swapping the goods changes what is owed on a signed agreement, so it is
// written down under the name of whoever did it.
router.post(
  '/:id/exchange',
  auditLog('CREDIT_AGREEMENT_EXCHANGE', (req) => ({
    agreement_id: req.params.id,
    returned: req.body.returned_description,
    replacement: req.body.replacement_description,
    returned_value: req.body.returned_value,
    replacement_value: req.body.replacement_value,
  })),
  exchangeProduct
);

router.get('/:id/exchange/:exchangeId/pdf', exchangeNotePDF);

module.exports = router;
