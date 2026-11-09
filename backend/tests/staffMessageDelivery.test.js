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

/**
 * The same test the real query answers: does this row belong to this
 * person? An owner's filter carries an $or that also takes the rows with
 * no user_id — the office's own post — and everybody else's filter is a
 * plain user_id and takes nothing else.
 */
const belongsTo = (filter, n) => (filter.$or
  ? filter.$or.some((c) => String(c.user_id) === String(n.user_id))
  : String(filter.user_id) === String(n.user_id));

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Notification')) return {
    insertMany: async (rows) => {
      store.push(...rows.map((r, i) => ({ _id: 'n' + (store.length + i), is_read: false, ...r })));
      return rows;
    },
    create: async (row) => {
      const saved = { _id: 'n' + store.length, is_read: false, user_id: null, ...row };
      store.push(saved);
      return saved;
    },
    find: (filter) => {
      const rows = store.filter((n) => belongsTo(filter, n));
      return { sort: () => ({ skip: () => ({ limit: async () => rows }) }) };
    },
    countDocuments: async (filter) => store.filter((n) => belongsTo(filter, n)
      && (filter.is_read === undefined || n.is_read === filter.is_read)).length,
    // Mirrors the real query: the id AND the person it belongs to.
    findOneAndUpdate: async (f) => {
      const row = store.find((n) => String(n._id) === String(f._id) && belongsTo(f, n));
      if (row) row.is_read = true;
      return row || null;
    },
    findOneAndDelete: async (f) => {
      const i = store.findIndex((n) => String(n._id) === String(f._id) && belongsTo(f, n));
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

/**
 * The office's post is not the shop's post.
 *
 * A notification with no user_id is written by notifyOwners() and means
 * "for the owners": a refund waiting for approval, a debt, a complaint,
 * the value of a large sale. The bell used to treat the same row as a
 * broadcast to all staff, so every attendant's notifications were the
 * owners' notifications. It went unnoticed only because the screen was
 * showing an empty list to everybody; the moment the list worked, the
 * whole shop could read the office's post — and an owner sending a
 * message to one person saw it land in a bell full of rows everyone
 * could see, which looks exactly like a message sent to everybody.
 */
test('a row with no user_id reaches the owners and nobody else', async () => {
  store = [];
  // What notifyOwners() writes: a row with no user_id at all.
  store.push({ _id: 'own1', user_id: null, is_read: false, type: 'important',
    title: 'Refund awaiting approval', message: 'GH₵ 1,200 refund by ama.' });

  for (const owner of [
    { _id: 'ceo1', username: 'lawrence', role: 'CEO' },
    { _id: 'x', username: 'x', role: 'Super Admin' },
    { _id: 'y', username: 'y', role: 'Managing Director' },
    { _id: 'z', username: 'z', role: 'COO' },
  ]) {
    assert.strictEqual((await inboxOf(owner)).data.length, 1, `${owner.role} must see it`);
  }

  for (const staffer of [
    { _id: 'u2', username: 'ama', role: 'Sales' },
    { _id: 'u4', username: 'yaw', role: 'Head of Department' },
    { _id: 'u5', username: 'esi', role: 'Manager' },
    { _id: 'u6', username: 'kojo', role: 'Field Agent' },
  ]) {
    const inbox = await inboxOf(staffer);
    assert.strictEqual(inbox.data.length, 0, `${staffer.role} must not see the owners' post`);
    assert.strictEqual(inbox.unread_count, 0, `nor have it counted on ${staffer.role}'s bell`);
  }
});

test('a message to one person reaches that person alone', async () => {
  store = [];
  // The office's own alerts are sitting there as well, which is the
  // state the shop was actually in when this looked broken.
  store.push({ _id: 'own1', user_id: null, is_read: false, type: 'info',
    title: 'New Sale', message: 'GH₵ 2,500.' });

  const r = res();
  await c.sendMessage({
    user: staff[0],
    body: { title: 'See me', message: 'Come to the office.', audience: 'people', user_ids: ['u4'] },
  }, r);
  assert.strictEqual(r.code, 201);
  assert.match(r.body.data.message, /Sent to yaw\./, 'and it says who it went to, by name');

  const yaw = await inboxOf(staff[3]);
  assert.strictEqual(yaw.data.length, 1);
  assert.strictEqual(yaw.data[0].title, 'See me');

  for (const other of [staff[1], staff[2]]) {
    assert.strictEqual((await inboxOf(other)).data.length, 0,
      `${other.username} was not written to and sees nothing at all`);
  }
  // The owner still sees their own alert, and not a copy of their message.
  const ceo = await inboxOf(staff[0]);
  assert.deepStrictEqual(ceo.data.map((n) => n.title), ['New Sale']);
});
