const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireLevel, requirePage } = require('../middleware/rbac');
const { auditLog } = require('../middleware/auditLogger');
const multer = require('multer');
const {
  getProducts, createProduct, getProduct, updateProduct, deleteProduct,
  getLowStock, getByBarcode,
  generateBarcode, generateAllBarcodes, getBarcodeSheet, commitStockCount, searchProducts, bulkImport, getProductSummary,
  getOfflineCatalogue, getDuplicateProducts, mergeDuplicateProducts, autoMergeDuplicates,
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
// A code for stock that arrived without one.
router.get('/generate-barcode', authenticate, generateBarcode);
// Filling in every missing barcode changes the whole catalogue, so it stays
// with the CEO. It never touches a product that already has one.
router.post(
  '/generate-barcodes',
  [authenticate, requireLevel(3)],
  auditLog('GENERATE_ALL_BARCODES', (req) => ({ dry_run: !!req.body?.dry_run })),
  generateAllBarcodes
);
// Every product's barcode, drawn on a sheet to cut up and stick on.
router.get('/barcode-sheet', authenticate, requireLevel(2), getBarcodeSheet);
router.post('/search', authenticate, searchProducts);
// A whole scanning session at once. Same permission as correcting stock by
// hand, since that is what it is — only faster.
router.post(
  '/stock-count',
  [authenticate, requirePage('products', 'inventory', 'full')],
  auditLog('STOCK_COUNT', (req) => ({ mode: req.body.mode, lines: (req.body.lines || []).length })),
  commitStockCount
);
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
router.post(
  '/merge-duplicates/auto',
  authenticate,
  requireLevel(3),
  auditLog('AUTO_MERGE_DUPLICATE_PRODUCTS'),
  autoMergeDuplicates
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
