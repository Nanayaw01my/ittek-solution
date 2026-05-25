const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const {
  getProducts, createProduct, getProduct, updateProduct, deleteProduct,
  getLowStock, getByBarcode, searchProducts, bulkImport,
} = require('../controllers/productsController');

// All authenticated users can list/view products (needed for POS)
router.get('/low-stock', authenticate, requireLevel(3), getLowStock);
router.get('/barcode/:barcode', authenticate, getByBarcode);
router.post('/search', authenticate, searchProducts);
router.post('/bulk-import', authenticate, requireLevel(3), auditLog('BULK_IMPORT_PRODUCTS'), bulkImport);
router.get('/', authenticate, getProducts);
router.get('/:id', authenticate, getProduct);

// Super Admin (4) and CEO (3) for product management (create/update/delete)
const adminOnly = [authenticate, requireLevel(3)];

router.post(
  '/',
  adminOnly,
  [
    body('name').notEmpty().withMessage('Product name is required.'),
    body('cost_price').isNumeric().withMessage('Cost price must be a number.'),
    body('selling_price').isNumeric().withMessage('Selling price must be a number.'),
  ],
  auditLog('CREATE_PRODUCT', (req) => ({ product_name: req.body.name })),
  createProduct
);

router.put(
  '/:id',
  adminOnly,
  auditLog('UPDATE_PRODUCT', (req) => ({ product_id: req.params.id })),
  updateProduct
);

router.delete(
  '/:id',
  adminOnly,
  auditLog('DELETE_PRODUCT', (req) => ({ product_id: req.params.id })),
  deleteProduct
);

module.exports = router;
