const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getCreditAgreements, createCreditAgreement, getCreditAgreement,
  updateCreditAgreement, recordPayment, generatePDF, deleteCreditAgreement,
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

router.delete(
  '/:id',
  auditLog('DELETE_CREDIT_AGREEMENT', (req) => ({ agreement_id: req.params.id })),
  deleteCreditAgreement
);

module.exports = router;
