const XLSX = require('xlsx');
const { PDFParse } = require('pdf-parse');

/**
 * Read a product list out of an uploaded file.
 *
 * Nothing here writes to the database. It turns a spreadsheet or a PDF into
 * rows for a human to check on screen, because an import that quietly gets a
 * cost price wrong is worse than no import at all — the damage only shows up
 * weeks later in the profit figures.
 *
 * Understood: .csv, .xlsx/.xls, and PDFs that contain real text. A scanned or
 * photographed page holds no text at all, only a picture, so it comes back
 * empty with an explanation rather than a pile of guesses.
 */

/**
 * Column headings vary between whoever typed the sheet. Everything is
 * lower-cased and stripped of spaces and punctuation before matching.
 */
const FIELD_ALIASES = {
  name: ['productname', 'product', 'name', 'description', 'item', 'itemname', 'particulars'],
  category: ['categoryname', 'category', 'cat', 'group', 'type'],
  supplier: ['suppliername', 'supplier', 'vendor', 'from'],
  selling_price: ['sellingprice', 'selling', 'price', 'saleprice', 'unitprice', 'retail', 'retailprice'],
  cost_price: ['costprice', 'cost', 'buyingprice', 'buying', 'purchaseprice', 'wholesale'],
  quantity: ['quantity', 'qty', 'stock', 'instock', 'count', 'units'],
  barcode: ['barcode', 'sku', 'code', 'itemcode'],
};

const normaliseHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Map a row of headings onto our field names. Unmatched columns are ignored. */
const mapHeaders = (headers) => {
  const map = {};
  headers.forEach((raw, index) => {
    const key = normaliseHeader(raw);
    if (!key) return;
    const field = Object.keys(FIELD_ALIASES).find((f) => FIELD_ALIASES[f].includes(key));
    // First match wins, so a sheet with both "Price" and "SellingPrice" keeps
    // the more specific one it saw first rather than flip-flopping.
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
};

/**
 * Turn "$1,850.00", "GHC 1850", "₵1 850" into 1850.
 * The sheets from this shop print a dollar sign but hold cedis; the symbol is
 * decoration either way, so every currency mark is simply dropped.
 */
const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/[^0-9.,\-]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

const toText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Split one CSV line, honouring quoted fields that contain commas. */
const splitCsvLine = (line) => {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
};

const parseCsv = (buffer) => {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map(splitCsvLine);
};

const parseSheet = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  // header:1 gives raw rows, which is what the header matching below needs —
  // the library's own object mode would key on whatever the first row happens
  // to say and hide a missing heading.
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
};

const parsePdf = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    // A ruled table is the reliable case: the lines tell the parser where the
    // columns are, rather than it guessing from spacing.
    const result = await parser.getTable();
    const grid = [];
    (result?.pages || []).forEach((page) => {
      (page.tables || []).forEach((table) => {
        (table || []).forEach((row) => {
          if (Array.isArray(row) && row.some((c) => toText(c))) grid.push(row.map(toText));
        });
      });
    });
    if (grid.length > 1) return grid;

    // No ruled table — fall back to text lines split on runs of whitespace.
    const text = (await parser.getText())?.text || '';
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(/\s{2,}|\t/).map(toText))
      .filter((cells) => cells.length > 1);
  } finally {
    if (typeof parser.destroy === 'function') await parser.destroy().catch(() => {});
  }
};

/**
 * Find the heading row. It is usually first, but sheets often carry a title or
 * a blank line above it, so the first row that maps to a name column wins.
 */
const findHeaderRow = (grid) => {
  const limit = Math.min(grid.length, 10);
  for (let i = 0; i < limit; i += 1) {
    const map = mapHeaders(grid[i] || []);
    if (map.name !== undefined) return { index: i, map };
  }
  return { index: -1, map: {} };
};

/**
 * Parse an uploaded file into candidate product rows.
 * @returns {Promise<{rows: Array, warnings: string[], columns: string[]}>}
 */
const parseProductFile = async (buffer, filename = '') => {
  const ext = String(filename).toLowerCase().split('.').pop();
  const warnings = [];

  let grid;
  if (ext === 'csv' || ext === 'txt') grid = parseCsv(buffer);
  else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') grid = parseSheet(buffer);
  else if (ext === 'pdf') grid = await parsePdf(buffer);
  else throw new Error('Upload a CSV, Excel or PDF file.');

  if (!grid || grid.length === 0) {
    throw new Error(
      ext === 'pdf'
        ? 'No text could be read from that PDF. If it is a scan or a photo of a printed page it holds only a picture, not text — retype it into a spreadsheet and upload that instead.'
        : 'That file appears to be empty.'
    );
  }

  const { index: headerIndex, map } = findHeaderRow(grid);
  if (headerIndex === -1) {
    throw new Error(
      'No product name column was found. The file needs a heading row with at least a product name, and ideally category, quantity, cost price and selling price.'
    );
  }

  const columns = Object.keys(map);
  ['category', 'cost_price', 'selling_price', 'quantity'].forEach((f) => {
    if (map[f] === undefined) warnings.push(`No ${f.replace('_', ' ')} column was found — it will be left blank.`);
  });

  const at = (row, field) => (map[field] === undefined ? '' : row[map[field]]);

  const rows = [];
  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const row = grid[i] || [];
    const name = toText(at(row, 'name'));
    // Skip blank lines and any repeated heading a multi-page PDF prints again.
    if (!name) continue;
    if (normaliseHeader(name) === normaliseHeader(grid[headerIndex][map.name])) continue;

    rows.push({
      line: i + 1,
      name,
      category: toText(at(row, 'category')),
      supplier: toText(at(row, 'supplier')),
      barcode: toText(at(row, 'barcode')),
      selling_price: toNumber(at(row, 'selling_price')),
      cost_price: toNumber(at(row, 'cost_price')),
      quantity: toNumber(at(row, 'quantity')),
    });
  }

  if (rows.length === 0) throw new Error('A heading row was found but no product rows beneath it.');

  return { rows, warnings, columns };
};

module.exports = { parseProductFile, toNumber, mapHeaders, FIELD_ALIASES };
