const Product = require('../models/Product');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const { parseProductFile } = require('../utils/productImport');

/** Match a name the way the duplicate check on createProduct does. */
const nameRegex = (name) =>
  new RegExp('^' + String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');

const MAX_ROWS = 500;

/**
 * POST /api/products/import/preview   (multipart, field name "file")
 *
 * Reads the file and says what it found. Writes nothing: the point is that a
 * person looks at the rows and fixes them before any of it reaches the
 * catalogue.
 */
const previewImport = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose a file to upload.' });

    const { rows, warnings, columns } = await parseProductFile(req.file.buffer, req.file.originalname);

    if (rows.length > MAX_ROWS) {
      return res.status(400).json({
        success: false,
        message: `That file holds ${rows.length} rows. Import at most ${MAX_ROWS} at a time.`,
      });
    }

    // Flag rows that already exist so nothing is silently duplicated.
    const existing = await Product.find(
      { is_active: true, $or: rows.map((r) => ({ name: nameRegex(r.name) })) },
      'name quantity'
    ).lean();
    const existingByName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));

    const seen = new Set();
    const prepared = rows.map((row) => {
      const key = row.name.trim().toLowerCase();
      const issues = [];

      const duplicateOfExisting = existingByName.get(key);
      if (duplicateOfExisting) {
        issues.push(`Already in the catalogue with ${duplicateOfExisting.quantity} in stock`);
      }
      if (seen.has(key)) issues.push('Appears more than once in this file');
      seen.add(key);

      if (row.selling_price === null) issues.push('No selling price');
      if (row.cost_price === null) issues.push('No cost price');
      if (row.quantity === null) issues.push('No quantity');
      if (row.selling_price !== null && row.cost_price !== null && row.selling_price < row.cost_price) {
        issues.push('Selling price is below cost price');
      }

      return {
        ...row,
        issues,
        // Anything already in the catalogue is left unticked; the rest is
        // ready to go but still a person's decision.
        include: !duplicateOfExisting,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        rows: prepared,
        warnings,
        columns,
        counts: {
          total: prepared.length,
          ready: prepared.filter((r) => r.issues.length === 0).length,
          duplicates: prepared.filter((r) => r.issues.some((i) => i.startsWith('Already'))).length,
        },
      },
    });
  } catch (err) {
    console.error('Import preview error:', err.message);
    return res.status(400).json({ success: false, message: err.message || 'Could not read that file.' });
  }
};

/**
 * POST /api/products/import/commit   { rows: [...], createMissing: true }
 *
 * Creates the rows the user confirmed. Categories and suppliers named in the
 * file are looked up by name and created when missing, otherwise every row
 * from a real stock sheet would import with no category at all.
 */
const commitImport = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No rows were sent.' });
    }
    if (rows.length > MAX_ROWS) {
      return res.status(400).json({ success: false, message: `Import at most ${MAX_ROWS} rows at a time.` });
    }

    const createMissing = req.body.createMissing !== false;

    // Resolve category and supplier names once rather than per row.
    const wanted = (field) => [...new Set(
      rows.map((r) => String(r[field] || '').trim()).filter(Boolean).map((s) => s.toLowerCase())
    )];

    const resolve = async (Model, names) => {
      if (names.length === 0) return { map: new Map(), created: [] };
      const found = await Model.find({ $or: names.map((n) => ({ name: nameRegex(n) })) }, 'name').lean();
      const map = new Map(found.map((d) => [d.name.trim().toLowerCase(), d._id]));
      const created = [];
      if (createMissing) {
        for (const n of names) {
          if (map.has(n)) continue;
          try {
            const doc = await Model.create({ name: n.toUpperCase() });
            map.set(n, doc._id);
            created.push(doc.name);
          } catch {
            // A racing create or a validation rule — the row simply imports
            // without this link rather than failing outright.
          }
        }
      }
      return { map, created };
    };

    const [categories, suppliers] = await Promise.all([
      resolve(Category, wanted('category')),
      resolve(Supplier, wanted('supplier')),
    ]);

    const results = { created: 0, skipped: 0, failed: 0, errors: [] };

    for (const row of rows) {
      const name = String(row.name || '').trim();
      if (!name) { results.skipped += 1; continue; }

      try {
        // Re-checked here, not just at preview: the file may have sat on screen
        // while someone else added the same product.
        const clash = await Product.findOne({ is_active: true, name: nameRegex(name) }, '_id');
        if (clash) {
          results.skipped += 1;
          results.errors.push({ item: name, error: 'Already in the catalogue' });
          continue;
        }

        await Product.create({
          name,
          barcode: String(row.barcode || '').trim() || undefined,
          category_id: categories.map.get(String(row.category || '').trim().toLowerCase()),
          supplier_id: suppliers.map.get(String(row.supplier || '').trim().toLowerCase()),
          cost_price: Number(row.cost_price) || 0,
          selling_price: Number(row.selling_price) || 0,
          quantity: Number(row.quantity) || 0,
          low_stock_level: Number(row.low_stock_level) || 5,
        });
        results.created += 1;
      } catch (err) {
        results.failed += 1;
        results.errors.push({ item: name, error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: `${results.created} product(s) imported.`
        + (results.skipped ? ` ${results.skipped} skipped.` : '')
        + (results.failed ? ` ${results.failed} failed.` : ''),
      data: {
        ...results,
        categoriesCreated: categories.created,
        suppliersCreated: suppliers.created,
      },
    });
  } catch (err) {
    console.error('Import commit error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { previewImport, commitImport };
