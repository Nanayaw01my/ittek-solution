/**
 * The shop's own work, between the prices.
 *
 * Two things are worth pinning down. The board must be told only what a
 * wall screen may know — the same rule the prices follow, for the same
 * reason: a customer is standing in front of it. And deleting a slide
 * must take the file with it, because a film left on Cloudinary after
 * its record is gone is a bill nobody can see, find or stop.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let rows = [];
let lastSelect = null;
let destroyed = [];
let deletedId = null;

const chain = (result) => {
  const c = {
    select: (f) => { lastSelect = f; return c; },
    sort: () => c,
    limit: () => c,
    populate: () => c,
    lean: async () => result,
  };
  return c;
};

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/ShowcaseItem')) return {
    find: (filter) => chain(rows.filter((r) => (filter?.is_active === undefined
      ? true : r.is_active === filter.is_active))),
    findOne: () => ({ sort: () => ({ select: () => ({ lean: async () => rows[rows.length - 1] || null }) }) }),
    create: async (d) => ({ _id: 'new1', ...d }),
    findByIdAndUpdate: async (id, u) => {
      const r = rows.find((x) => String(x._id) === String(id));
      if (!r) return null;
      Object.assign(r, u.$set);
      return r;
    },
    findByIdAndDelete: async (id) => {
      deletedId = id;
      const i = rows.findIndex((x) => String(x._id) === String(id));
      return i === -1 ? null : rows.splice(i, 1)[0];
    },
  };
  if (req.includes('config/cloudinary')) return {
    uploader: { destroy: async (id, opts) => { destroyed.push({ id, ...opts }); return { result: 'ok' }; } },
  };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/showcaseController.js'));
Module._load = orig;

const res = () => {
  const r = { code: 200 };
  r.status = (s) => { r.code = s; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const user = { _id: 'u1', username: 'lawrence' };

test.beforeEach(() => {
  destroyed = [];
  deletedId = null;
  lastSelect = null;
  rows = [
    { _id: 'w1', kind: 'image', url: 'https://cdn/x/roof.jpg', caption: 'Roof of 12 panels',
      location: 'Prestea', seconds: 15, is_active: true, sort_order: 1,
      public_id: 'ittek/showcase/roof', bytes: 820000,
      created_by: { username: 'lawrence' }, createdAt: new Date() },
    { _id: 'w2', kind: 'video', url: 'https://cdn/x/fit.mp4', poster_url: 'https://cdn/x/fit.jpg',
      caption: 'Inverter fitted', location: 'Bogoso', seconds: 12, is_active: true, sort_order: 2,
      public_id: 'ittek/showcase/fit', bytes: 41000000,
      created_by: { username: 'ama' }, createdAt: new Date() },
    { _id: 'w3', kind: 'image', url: 'https://cdn/x/old.jpg', caption: 'Old job',
      is_active: false, sort_order: 3, seconds: 12, public_id: 'ittek/showcase/old' },
  ];
});

test('the board is sent only what a wall screen may know', async () => {
  const slides = await c.activeForBoard();

  assert.strictEqual(slides.length, 2, 'and nothing switched off');
  assert.deepStrictEqual(Object.keys(slides[0]).sort(),
    ['caption', 'id', 'kind', 'location', 'poster_url', 'seconds', 'url'].sort());

  // Who uploaded it, when, what it cost in bytes and what Cloudinary
  // calls it are the shop's business, not the street's.
  const json = JSON.stringify(slides);
  for (const leak of ['created_by', 'lawrence', 'public_id', 'ittek/showcase', 'bytes', '41000000']) {
    assert.ok(!json.includes(leak), `${leak} must not reach the board`);
  }
  assert.ok(lastSelect && !lastSelect.includes('public_id'),
    'and it is not fetched in the first place');
});

test('a film carries its still, so the board is never a black rectangle', async () => {
  const slides = await c.activeForBoard();
  const film = slides.find((s) => s.kind === 'video');
  assert.strictEqual(film.poster_url, 'https://cdn/x/fit.jpg');
  const photo = slides.find((s) => s.kind === 'image');
  assert.strictEqual(photo.poster_url, null, 'and a photograph needs none');
});

test('how long a slide holds the screen is clamped either side of sense', async () => {
  for (const [asked, got] of [[1, 4], [0, 12], [900, 60], [20, 20], ['abc', 12], [undefined, 12]]) {
    const r = res();
    await c.createShowcase({ user, body: { url: 'https://cdn/x.jpg', seconds: asked } }, r);
    assert.strictEqual(r.body.data.seconds, got, `asked ${asked}`);
  }
});

test('a new slide goes to the end of the rotation, not the front', async () => {
  const r = res();
  await c.createShowcase({ user, body: { url: 'https://cdn/x.jpg', caption: 'New job' } }, r);
  assert.strictEqual(r.code, 201);
  // Behind the work the shop has already chosen to lead with.
  assert.strictEqual(r.body.data.sort_order, 4);
});

test('a slide with no file is refused', async () => {
  const r = res();
  await c.createShowcase({ user, body: { caption: 'A job with no photograph' } }, r);
  assert.strictEqual(r.code, 400);
});

test('deleting a slide deletes the file with it', async () => {
  const r = res();
  await c.deleteShowcase({ user, params: { id: 'w2' } }, r);

  assert.strictEqual(r.code, 200);
  assert.strictEqual(deletedId, 'w2');
  assert.deepStrictEqual(destroyed, [{ id: 'ittek/showcase/fit', resource_type: 'video' }],
    'and as a video, or Cloudinary looks for an image of that name and finds nothing');
});

test('a photograph is deleted as a photograph', async () => {
  await c.deleteShowcase({ user, params: { id: 'w1' } }, res());
  assert.deepStrictEqual(destroyed, [{ id: 'ittek/showcase/roof', resource_type: 'image' }]);
});

test('a file that will not delete does not block taking the slide off the wall', async () => {
  // The record is already gone and the board is already right, which is
  // what was asked for. A file left behind is a bill, not something the
  // person pressing delete can do anything about.
  const cloudinary = require(path.join(B, 'config/cloudinary'));
  const real = cloudinary.uploader.destroy;
  cloudinary.uploader.destroy = async () => { throw new Error('cloudinary down'); };
  try {
    const r = res();
    await c.deleteShowcase({ user, params: { id: 'w1' } }, r);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(deletedId, 'w1');
  } finally {
    cloudinary.uploader.destroy = real;
  }
});

test('switching a slide off takes it off the board but keeps it', async () => {
  await c.updateShowcase({ params: { id: 'w1' }, body: { is_active: false } }, res());
  const slides = await c.activeForBoard();
  assert.ok(!slides.some((s) => s.id === 'w1'));
  assert.ok(rows.some((r) => r._id === 'w1'), 'the file and the record are still there');
});

test('deleting something that is not there says so rather than succeeding quietly', async () => {
  const r = res();
  await c.deleteShowcase({ user, params: { id: 'nope' } }, r);
  assert.strictEqual(r.code, 404);
  assert.deepStrictEqual(destroyed, []);
});
