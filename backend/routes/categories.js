const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const Category = require('../models/Category');

const adminOnly = [authenticate, requireLevel(3)];

// GET /api/categories
router.get('/', authenticate, async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    return res.status(200).json({ success: true, data: categories });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/categories
router.post(
  '/',
  adminOnly,
  [body('name').notEmpty().withMessage('Category name is required.')],
  auditLog('CREATE_CATEGORY'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
      const category = await Category.create(req.body);
      return res.status(201).json({ success: true, message: 'Category created.', data: category });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ success: false, message: 'Category already exists.' });
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// GET /api/categories/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    return res.status(200).json({ success: true, data: category });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/categories/:id
router.put('/:id', adminOnly, auditLog('UPDATE_CATEGORY'), async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    return res.status(200).json({ success: true, message: 'Category updated.', data: category });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', adminOnly, auditLog('DELETE_CATEGORY'), async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    return res.status(200).json({ success: true, message: 'Category deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
