/**
 * Complaints.
 *
 * The rule worth protecting: the person who raised one cannot be the
 * person who closes it. An attendant marking their own complaint resolved
 * is the complaint disappearing, not being dealt with.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let doc = null;
const made = [];
const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Complaint')) return {
    create: async (d) => { made.push(d); return { _id: 'c1', ...d }; },
    findById: async () => doc,
    find: () => ({ populate() { return this; }, sort() { return this; }, skip() { return this; }, limit: async () => [] }),
    countDocuments: async () => 0,
  };
  if (req.includes('models/Notification')) return { create: async () => ({}) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/complaintsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const ama = { _id: 'u2', username: 'ama', role: 'Sales' };
const manager = { _id: 'm1', username: 'esi', role: 'Manager' };
const ceo = { _id: 'c1', username: 'kofi', role: 'CEO' };

test('anybody at the counter can write one down', async () => {
  made.length = 0;
  const r = res();
  await c.createComplaint({ user: ama, body: {
    subject: 'Bulb failed in two days', detail: 'Customer brought it back Monday.',
    customer_name: 'Sister Law', severity: 'high',
  } }, r);
  assert.strictEqual(r.code, 201);
  assert.strictEqual(made[0].raised_by, 'u2');
  assert.strictEqual(made[0].severity, 'high');
});

test('a complaint with no substance is refused', async () => {
  assert.strictEqual((await (async () => { const r = res();
    await c.createComplaint({ user: ama, body: { subject: ' ', detail: 'x' } }, r); return r; })()).code, 400);
  assert.strictEqual((await (async () => { const r = res();
    await c.createComplaint({ user: ama, body: { subject: 'x', detail: '  ' } }, r); return r; })()).code, 400);
});

test('an attendant cannot close their own complaint', async () => {
  doc = { _id: 'c1', status: 'open', raised_by: 'u2', save: async () => {} };
  const r = res();
  await c.resolveComplaint({ user: ama, params: { id: 'c1' }, body: { resolution: 'Sorted it' } }, r);
  assert.strictEqual(r.code, 403);
  assert.strictEqual(doc.status, 'open');
});

test('a manager or an owner closes it, and has to say what was done', async () => {
  doc = { _id: 'c1', status: 'open', raised_by: 'u2', save: async () => {} };
  let r = res();
  await c.resolveComplaint({ user: manager, params: { id: 'c1' }, body: { resolution: '' } }, r);
  assert.strictEqual(r.code, 400, 'closing it with no account of what happened is not closing it');

  r = res();
  await c.resolveComplaint({ user: ceo, params: { id: 'c1' }, body: { resolution: 'Replaced the bulb' } }, r);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(doc.status, 'resolved');
  assert.strictEqual(doc.resolution, 'Replaced the bulb');
  assert.ok(doc.resolved_at instanceof Date);

  r = res();
  await c.resolveComplaint({ user: ceo, params: { id: 'c1' }, body: { resolution: 'again' } }, r);
  assert.strictEqual(r.code, 400, 'and it is not settled twice');
});

test('an attendant sees their own; everyone above the counter sees them all', () => {
  assert.deepStrictEqual(c.scopeFor(ama), { raised_by: 'u2' });
  assert.deepStrictEqual(c.scopeFor({ _id: 'e1', role: 'Engineer' }), { raised_by: 'e1' });
  assert.deepStrictEqual(c.scopeFor(manager), {});
  assert.deepStrictEqual(c.scopeFor(ceo), {});
});
