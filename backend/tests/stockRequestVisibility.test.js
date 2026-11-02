/**
 * Who sees whose stock requests.
 *
 * The screen was opened to sales attendants so the person who notices the
 * last adaptor leave the shelf can ask for more. The scoping rule in the
 * controller named the Manager role, which was the only role that could
 * reach it — so opening the door without changing the rule would have
 * handed every attendant the whole shop's buying list: what is on order,
 * how much of it, and what it costs.
 *
 * These tests are about that leak, not about the feature.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let lastFilter = null;
const chain = (rows) => ({
  populate() { return this; },
  sort() { return this; },
  skip() { return this; },
  limit: async () => rows,
});

let theRequest = null;
const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/StockRequest')) return {
    find: (filter) => { lastFilter = filter; return chain([]); },
    countDocuments: async () => 0,
    findById: (id) => (
      // getStockRequest populates; deleteStockRequest does not.
      { populate() { return this; }, then: (f) => f(theRequest) }
    ),
    findByIdAndDelete: async () => theRequest,
  };
  if (req.includes('models/Product')) return { create: async () => ({}), findOne: () => ({ select: async () => null }) };
  if (req.includes('models/Notification')) return { create: async () => ({}) };
  if (req === 'express-validator') return { validationResult: () => ({ isEmpty: () => true, array: () => [] }) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/stockRequestsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const list = async (user) => { const r = res(); lastFilter = null; await c.getStockRequests({ user, query: {} }, r); return r; };

const OWNERS = ['CEO', 'COO', 'Super Admin'];
const STAFF = ['Manager', 'Sales', 'Engineer', 'Field Agent'];

test('an owner sees every request, because approving them is the job', async () => {
  for (const role of OWNERS) {
    await list({ _id: 'owner', role });
    assert.deepStrictEqual(lastFilter, {}, role);
  }
});

test('everyone else sees only what they asked for', async () => {
  for (const role of STAFF) {
    await list({ _id: 'me', role });
    assert.strictEqual(lastFilter.created_by, 'me', `${role} must be scoped to themselves`);
  }
});

test('an attendant cannot open somebody else\'s request by its id', async () => {
  theRequest = { _id: 'r1', created_by: { _id: 'someone-else' }, status: 'pending' };
  const r = res();
  await c.getStockRequest({ user: { _id: 'me', role: 'Sales' }, params: { id: 'r1' } }, r);
  assert.strictEqual(r.code, 403);
});

test('an attendant cannot delete somebody else\'s request', async () => {
  theRequest = { _id: 'r1', created_by: 'someone-else', status: 'pending' };
  const r = res();
  await c.deleteStockRequest({ user: { _id: 'me', role: 'Sales' }, params: { id: 'r1' } }, r);
  assert.strictEqual(r.code, 403);
});

test('but can delete their own, while it is still pending', async () => {
  theRequest = { _id: 'r1', created_by: 'me', status: 'pending' };
  const r = res();
  await c.deleteStockRequest({ user: { _id: 'me', role: 'Sales' }, params: { id: 'r1' } }, r);
  assert.strictEqual(r.code, 200);
});
