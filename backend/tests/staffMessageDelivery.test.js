/**
 * The whole loop, through the real controller: an owner writes, and the
 * people they chose find it in their own notifications.
 *
 * Both halves were tested apart — who the message is addressed to, and
 * that the composer sends — which proves nothing about whether anybody
 * receives it. This runs sendMessage and then getNotifications over one
 * shared store, the way the server does.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

const staff = [
  { _id: 'ceo1', username: 'lawrence', role: 'CEO' },
  { _id: 'u2', username: 'ama', role: 'Sales' },
  { _id: 'u3', username: 'kofi', role: 'Sales' },
  { _id: 'u4', username: 'yaw', role: 'Head of Department' },
];
let store = [];

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Notification')) return {
    insertMany: async (rows) => {
      store.push(...rows.map((r, i) => ({ _id: 'n' + (store.length + i), is_read: false, ...r })));
      return rows;
    },
    find: (filter) => {
      const rows = store.filter((n) =>
        filter.$or.some((c) => String(c.user_id) === String(n.user_id)));
      return { sort: () => ({ skip: () => ({ limit: async () => rows }) }) };
    },
    countDocuments: async (filter) => store.filter((n) =>
      filter.$or.some((c) => String(c.user_id) === String(n.user_id))
      && (filter.is_read === undefined || n.is_read === filter.is_read)).length,
    // Mirrors the real query: the id AND the person it belongs to.
    findOneAndUpdate: async (f) => {
      const row = store.find((n) => String(n._id) === String(f._id)
        && f.$or.some((cond) => String(cond.user_id) === String(n.user_id)));
      if (row) row.is_read = true;
      return row || null;
    },
    findOneAndDelete: async (f) => {
      const i = store.findIndex((n) => String(n._id) === String(f._id)
        && f.$or.some((cond) => String(cond.user_id) === String(n.user_id)));
      return i === -1 ? null : store.splice(i, 1)[0];
    },
  };
  if (req.includes('models/User')) return {
    find: (filter) => {
      let rows = staff.slice();
      if (filter.role?.$in) rows = rows.filter((u) => filter.role.$in.includes(u.role));
      if (filter._id?.$in) rows = rows.filter((u) => filter._id.$in.includes(String(u._id)));
      return { select: () => ({ sort: () => ({ lean: async () => rows }), lean: async () => rows }) };
    },
  };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/notificationsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const inboxOf = async (user) => {
  const r = res();
  await c.getNotifications({ user, query: {} }, r);
  return r.body;
};

test('a message written by the CEO arrives in the right inboxes', async () => {
  store = [];
  const sent = res();
  await c.sendMessage({
    user: staff[0],
    body: { title: 'Friday', message: 'We close at 4.', audience: 'roles', roles: ['Sales'] },
  }, sent);
  assert.strictEqual(sent.code, 201);

  const ama = await inboxOf(staff[1]);
  assert.strictEqual(ama.data.length, 1, 'ama has it');
  assert.strictEqual(ama.data[0].title, 'Friday');
  assert.strictEqual(ama.data[0].from_name, 'lawrence', 'and can see who wrote it');
  assert.strictEqual(ama.unread_count, 1);

  assert.strictEqual((await inboxOf(staff[2])).data.length, 1, 'kofi has it too');
  assert.strictEqual((await inboxOf(staff[3])).data.length, 0, 'the head of department does not');
  assert.strictEqual((await inboxOf(staff[0])).data.length, 0, 'nor does the sender');
});

test('one person reading it does not mark it read for the others', async () => {
  store = [];
  await c.sendMessage({
    user: staff[0],
    body: { title: 'Stocktake', message: 'Saturday 7am.', audience: 'everyone' },
  }, res());

  // ama reads hers
  const hers = (await inboxOf(staff[1])).data[0];
  await c.markRead({ user: staff[1], params: { id: hers._id } }, res());

  assert.strictEqual((await inboxOf(staff[1])).unread_count, 0, 'read for ama');
  assert.strictEqual((await inboxOf(staff[2])).unread_count, 1, 'still unread for kofi');
  assert.strictEqual((await inboxOf(staff[3])).unread_count, 1, 'and for yaw');
});


/**
 * Marking one read must not reach into somebody else's.
 *
 * markRead looks the notification up by its id alone, with no check that
 * it belongs to the person asking — which was harmless while a
 * notification was either yours or everybody's, and is not harmless now
 * that a message is one private row per recipient.
 */
test('a person cannot mark somebody else\'s message read', async () => {
  store = [];
  await c.sendMessage({
    user: staff[0],
    body: { title: 'Private', message: 'For Sales only.', audience: 'roles', roles: ['Sales'] },
  }, res());

  const kofisRow = store.find((n) => n.user_id === 'u3');
  const r = res();
  // ama, reaching for kofi's copy.
  await c.markRead({ user: staff[1], params: { id: kofisRow._id } }, r);

  assert.strictEqual(r.code, 404, 'it is not hers to mark');
  assert.strictEqual((await inboxOf(staff[2])).unread_count, 1,
    'kofi\'s message is still unread — somebody else cannot clear it for him');

  // Deleting is worse: the message would be gone before kofi ever saw it.
  const d = res();
  await c.deleteNotification({ user: staff[1], params: { id: kofisRow._id } }, d);
  assert.strictEqual(d.code, 404);
  assert.strictEqual((await inboxOf(staff[2])).data.length, 1, 'and it is still there');
});
