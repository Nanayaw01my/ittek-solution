const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let book = [];
const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Contact')) return {
    findOne: async (f) => book.find(c => c.phone === f.phone) || null,
    create: async (d) => { const c = { _id: 'c' + (book.length + 1), ...d, save: async () => {} }; book.push(c); return c; },
    findById: async (id) => book.find(c => c._id === id) || null,
    aggregate: async () => [],
    countDocuments: async () => book.length,
    find: () => { const q = {}; for (const m of ['select','sort','skip','limit','lean']) q[m] = () => q;
      q.then = (ok, no) => Promise.resolve(book).then(ok, no); return q; },
  };
  if (req.includes('models/Sale')) return { aggregate: async () => [] };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/contactsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const add = async (body) => { const r = res(); await c.createContact({ body, user: { _id: 'u1' } }, r); return r; };

test('adding a customer to the book by hand', async (t) => {
  await t.test('a name and a number are saved', async () => {
    book = [];
    const r = await add({ name: 'Abena Serwaa', phone: '0244123456' });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(r.body.created, true);
    assert.strictEqual(book[0].name, 'Abena Serwaa');
    assert.match(r.body.message, /added to the book/);
  });

  await t.test('the number is stored in one form, however it was typed', async () => {
    assert.strictEqual(book[0].phone, '233244123456');
  });

  await t.test('the same person typed differently is one row, not three', async () => {
    const before = book.length;
    for (const typed of ['+233244123456', '233 244 123 456', '244123456']) {
      const r = await add({ name: 'Abena Serwaa', phone: typed });
      assert.strictEqual(r.code, 200, typed);
      assert.strictEqual(r.body.created, false);
    }
    assert.strictEqual(book.length, before, 'no duplicates were made');
  });

  await t.test('a fuller name on a second entry is kept', async () => {
    const r = await add({ name: 'Abena Serwaa Mensah', phone: '0244123456' });
    assert.strictEqual(book[0].name, 'Abena Serwaa Mensah');
    assert.match(r.body.message, /saved as Abena Serwaa Mensah/);
  });

  await t.test('a number that is not a number is refused, by name', async () => {
    const r = await add({ name: 'Nobody', phone: '12' });
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /Ghana phone number/);
  });

  await t.test('no number at all is refused', async () => {
    const r = await add({ name: 'Nobody' });
    assert.strictEqual(r.code, 400);
  });

  await t.test('a number with no name is still worth keeping', async () => {
    const r = await add({ phone: '0201112222' });
    assert.strictEqual(r.code, 201, 'a number alone is a person the shop can still reach');
    assert.strictEqual(book.at(-1).name, '');
  });

  await t.test('somebody entered by hand has bought nothing yet', async () => {
    assert.strictEqual(book.at(-1).visits, 0);
    assert.strictEqual(book.at(-1).total_spent, 0);
  });

  await t.test('a birthday that is not a date is refused rather than stored as rubbish', async () => {
    const r = await add({ name: 'X', phone: '0209998888', birthday: 'next tuesday' });
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /did not make sense/);
  });

  await t.test('a real birthday is kept', async () => {
    const r = await add({ name: 'Kofi', phone: '0207776666', birthday: '1990-04-12' });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(book.at(-1).birthday.getFullYear(), 1990);
  });
});
