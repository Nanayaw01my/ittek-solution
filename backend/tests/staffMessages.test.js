/**
 * An owner writing to the staff.
 *
 * The thing worth testing is who ends up with the message, because every
 * way of getting that wrong is quiet: a message nobody receives looks
 * identical to one that was sent, and a message that reaches the wrong
 * people is only noticed by the wrong people.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let staff = [];
let written = [];
let lastFilter = null;

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Notification')) return {
    insertMany: async (rows) => { written = rows; return rows; },
    find: () => ({ sort: () => ({ skip: () => ({ limit: async () => [] }) }) }),
    countDocuments: async () => 0,
  };
  if (req.includes('models/User')) return {
    find: (filter) => {
      lastFilter = filter;
      let rows = staff.filter((u) => u.is_active !== false);
      if (filter.role?.$in) rows = rows.filter((u) => filter.role.$in.includes(u.role));
      if (filter._id?.$in) rows = rows.filter((u) => filter._id.$in.includes(String(u._id)));
      if (filter._id?.$ne) rows = rows.filter((u) => String(u._id) !== String(filter._id.$ne));
      return { select: () => ({ sort: () => ({ lean: async () => rows }), lean: async () => rows }) };
    },
  };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/notificationsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const ceo = { _id: 'ceo1', username: 'lawrence', role: 'CEO' };

const send = async (body, user = ceo) => {
  written = [];
  const r = res();
  await c.sendMessage({ user, body }, r);
  return r;
};

test.beforeEach(() => {
  staff = [
    { _id: 'ceo1', username: 'lawrence', role: 'CEO' },
    { _id: 'u2', username: 'ama', role: 'Sales' },
    { _id: 'u3', username: 'kofi', role: 'Sales' },
    { _id: 'u4', username: 'yaw', role: 'Head of Department' },
    { _id: 'u5', username: 'esi', role: 'Manager' },
    { _id: 'u6', username: 'gone', role: 'Sales', is_active: false },
  ];
});

test('only an owner may write to the staff', async () => {
  for (const role of ['Sales', 'Manager', 'Head of Department', 'Engineer']) {
    const r = await send({ title: 'Hi', message: 'Hello' }, { _id: 'x', username: 'x', role });
    assert.strictEqual(r.code, 403, role);
  }
  for (const role of ['CEO', 'COO', 'Managing Director', 'Super Admin']) {
    const r = await send({ title: 'Hi', message: 'Hello' }, { _id: 'o', username: 'o', role });
    assert.strictEqual(r.code, 201, role);
  }
});

test('everyone means every active account except the sender', async () => {
  const r = await send({ title: 'Friday', message: 'We close at 4.' });
  assert.strictEqual(r.code, 201);
  assert.deepStrictEqual(written.map((n) => n.user_id).sort(), ['u2', 'u3', 'u4', 'u5']);
  assert.ok(!written.some((n) => n.user_id === 'ceo1'), 'the sender is left off their own message');
  assert.ok(!written.some((n) => n.user_id === 'u6'), 'a deactivated account receives nothing');
});

test('a message is one row per person, so one reader does not mark it read for all', async () => {
  await send({ title: 'Friday', message: 'We close at 4.' });
  assert.strictEqual(written.length, 4);
  assert.ok(written.every((n) => n.user_id), 'no broadcast row with a null user_id');
  assert.ok(written.every((n) => n.is_message === true && n.from_name === 'lawrence'),
    'and each says who wrote it');
});

test('by role, and by person', async () => {
  let r = await send({ title: 'Till', message: 'Count twice', audience: 'roles', roles: ['Sales'] });
  assert.strictEqual(r.code, 201);
  assert.deepStrictEqual(written.map((n) => n.user_id).sort(), ['u2', 'u3']);

  r = await send({ title: 'Just you', message: 'See me', audience: 'people', user_ids: ['u4'] });
  assert.strictEqual(r.code, 201);
  assert.deepStrictEqual(written.map((n) => n.user_id), ['u4']);
});

test('an audience that selects nobody is refused rather than silently sent', async () => {
  // Every one of these looks like a sent message if it returns 201 and
  // writes nothing.
  for (const body of [
    { title: 'x', message: 'y', audience: 'roles', roles: [] },
    { title: 'x', message: 'y', audience: 'roles', roles: ['Nonexistent Role'] },
    { title: 'x', message: 'y', audience: 'people', user_ids: [] },
    { title: 'x', message: 'y', audience: 'people', user_ids: ['ceo1'] },
  ]) {
    const r = await send(body);
    assert.strictEqual(r.code, 400, JSON.stringify(body));
    assert.strictEqual(written.length, 0);
  }
});

test('an empty heading or body is refused', async () => {
  assert.strictEqual((await send({ title: '  ', message: 'y' })).code, 400);
  assert.strictEqual((await send({ title: 'x', message: '   ' })).code, 400);
});
