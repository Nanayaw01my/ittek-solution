const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const Supplier = require('../models/Supplier');

const adminOnly = [authenticate, requireLevel(3)];

// GET /api/suppliers
router.get('/', authenticate, async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ name: 1 });
    return res.status(200).json({ success: true, data: suppliers });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/suppliers
router.post(
  '/',
  adminOnly,
  [body('name').notEmpty().withMessage('Supplier name is required.')],
  auditLog('CREATE_SUPPLIER'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
      const supplier = await Supplier.create(req.body);
      return res.status(201).json({ success: true, message: 'Supplier created.', data: supplier });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// GET /api/suppliers/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });
    return res.status(200).json({ success: true, data: supplier });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', adminOnly, auditLog('UPDATE_SUPPLIER'), async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });
    return res.status(200).json({ success: true, message: 'Supplier updated.', data: supplier });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', adminOnly, auditLog('DELETE_SUPPLIER'), async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });
    return res.status(200).json({ success: true, message: 'Supplier deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
