/**
 * The shop's order of business for a stock request.
 *
 * The floor asks, the Managing Director reads it and sends up the ones
 * worth buying, the owners sign. Three ways that goes wrong quietly: the
 * MD approves their own shortlist, the owners approve something that never
 * reached them, or the post is vacant and every request waits for ever.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let doc = null;
let reviewers = 1;
const notes = [];

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/StockRequest')) return { findById: async () => doc };
  if (req.includes('models/User')) return { countDocuments: async () => reviewers };
  if (req.includes('models/Notification')) return { create: async (d) => { notes.push(d); return d; } };
  if (req.includes('models/Product')) return {
    create: async (d) => ({ _id: 'p1', ...d }), findOne: () => ({ select: async () => null }),
  };
  if (req === 'express-validator') return { validationResult: () => ({ isEmpty: () => true, array: () => [] }) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/stockRequestsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const request = (status = 'pending') => ({
  _id: 'r1', status, total_amount: 12400, created_by: 'u1',
  items: [{ product_name: 'Battery', quantity_requested: 4, estimated_cost: 1200, total: 4800 }],
  save: async () => {},
  toObject() { return { ...this }; },
});

const md = { _id: 'md1', username: 'lawrence', role: 'Managing Director' };
const ceo = { _id: 'c1', username: 'kofi', role: 'CEO' };
const manager = { _id: 'm1', username: 'esi', role: 'Manager' };

const forward = async (user, body = {}) => {
  const r = res(); await c.forwardStockRequest({ user, params: { id: 'r1' }, body }, r); return r;
};
const approve = async (user, body = {}) => {
  const r = res(); await c.approveStockRequest({ user, params: { id: 'r1' }, body }, r); return r;
};

test.beforeEach(() => { reviewers = 1; notes.length = 0; });

test('the MD reviews and sends up; nobody else does', async () => {
  doc = request();
  assert.strictEqual((await forward(ceo)).code, 403, 'an owner does not review on the MD\'s behalf');
  assert.strictEqual((await forward(manager)).code, 403);

  doc = request();
  const r = await forward(md, { note: 'The batteries are genuinely low' });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(doc.status, 'forwarded');
  assert.strictEqual(doc.review_note, 'The batteries are genuinely low');
  assert.ok(doc.reviewed_date instanceof Date);
  assert.match(notes.at(-1).title, /for your approval/, 'and the owners are told');
  assert.match(notes.at(-1).message, /genuinely low/, 'with what the MD said about it');
});

test('the MD cannot sign for the spending they reviewed', async () => {
  doc = request('forwarded');
  const r = await approve(md, { quantities: [4] });
  assert.strictEqual(r.code, 403);
  assert.match(r.body.message, /owners approve/);
});

test('owners approve what reached them, not what is still on the desk', async () => {
  doc = request('pending');
  const blocked = await approve(ceo, { quantities: [4] });
  assert.strictEqual(blocked.code, 409, 'it has not been sent up yet');
  assert.strictEqual(doc.status, 'pending', 'and nothing moved');

  doc = request('forwarded');
  const ok = await approve(ceo, { quantities: [4] });
  assert.strictEqual(ok.code, 200);
  assert.strictEqual(doc.status, 'approved');
});

test('with no Managing Director, requests do not wait for nobody', async () => {
  // The post is vacant. Without this, every request sits at 'pending'
  // with nobody entitled to move it, and the first anyone knows is an
  // empty shelf.
  reviewers = 0;
  doc = request('pending');
  const r = await approve(ceo, { quantities: [4] });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(doc.status, 'approved');
});

test('either desk may say no, and a decided request is not re-decided', async () => {
  doc = request('pending');
  let r = res();
  await c.rejectStockRequest({ user: md, params: { id: 'r1' }, body: { reason: 'Not this month' } }, r);
  assert.strictEqual(r.code, 200);

  doc = request('approved');
  assert.strictEqual((await forward(md)).code, 400);
  assert.strictEqual((await approve(ceo)).code, 400);
});
