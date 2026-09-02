const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel, requirePage } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const multer = require('multer');
const {
  getProducts, createProduct, getProduct, updateProduct, deleteProduct,
  getLowStock, getByBarcode, searchProducts, bulkImport, getProductSummary,
  getOfflineCatalogue, getDuplicateProducts, mergeDuplicateProducts,
} = require('../controllers/productsController');
const { previewImport, commitImport } = require('../controllers/productImportController');

// Kept in memory: the file is parsed and thrown away, so there is nothing to
// write to disk (and nothing to clean up on a read-only serverless filesystem).
const uploadSheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// All authenticated users can list/view products (needed for POS)
router.get('/low-stock', authenticate, requireLevel(3), getLowStock);
router.get('/barcode/:barcode', authenticate, getByBarcode);
router.post('/search', authenticate, searchProducts);
router.post('/bulk-import', authenticate, requireLevel(3), auditLog('BULK_IMPORT_PRODUCTS'), bulkImport);

// Reading a file writes nothing, so it is separated from the commit that does.
router.post('/import/preview', authenticate, requireLevel(3), uploadSheet.single('file'), previewImport);
router.post(
  '/import/commit',
  authenticate,
  requireLevel(3),
  auditLog('IMPORT_PRODUCTS', (req) => ({ count: (req.body.rows || []).length })),
  commitImport
);
// The whole catalogue for the till to hold offline. Above '/:id', or the path
// would be read as a product id.
router.get('/offline-catalogue', authenticate, getOfflineCatalogue);

// Finding and merging duplicates changes what the catalogue says the shop
// holds, so it sits with the owners. Above '/:id' or the path is read as an id.
router.get('/duplicates', authenticate, requireLevel(3), getDuplicateProducts);
router.post(
  '/merge-duplicates',
  authenticate,
  requireLevel(3),
  auditLog('MERGE_DUPLICATE_PRODUCTS', (req) => ({
    keep: req.body.keep_id, retired: (req.body.remove_ids || []).length,
  })),
  mergeDuplicateProducts
);

// Before '/:id', or the summary path would be read as a product id.
router.get('/summary', authenticate, getProductSummary);
router.get('/', authenticate, getProducts);
router.get('/:id', authenticate, getProduct);

// Super Admin (4) and CEO (3) for product management (create/update/delete)
const adminOnly = [authenticate, requireLevel(3)];

// Open to anyone whose role reaches Products, plus anyone the CEO granted the
// page to. The controller then confirms the category is one they may use.
router.post(
  '/',
  [authenticate, requirePage('products', 'inventory', 'full')],
  [
    body('name').notEmpty().withMessage('Product name is required.'),
    body('cost_price').isNumeric().withMessage('Cost price must be a number.'),
    body('selling_price').isNumeric().withMessage('Selling price must be a number.'),
  ],
  auditLog('CREATE_PRODUCT', (req) => ({ product_name: req.body.name })),
  createProduct
);

// Inventory-only users may correct stock here; the controller limits which
// fields they can actually change.
router.put(
  '/:id',
  [authenticate, requirePage('products', 'inventory', 'full')],
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
