const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

/**
 * Taking a backup must not depend on sending anything.
 *
 * The screen used to POST a body of `null`, which axios sent as the four
 * characters "null" under a JSON content type. Express's parser is strict —
 * it takes an object or an array and refuses anything else — so every press
 * of Download Backup was answered 400 before it reached the backup code, on
 * every device, for as long as the button has existed. The screen could only
 * say "Backup failed".
 *
 * So: the GET route stays, and nothing about a body may stand between a
 * person and a copy of their own data.
 */

const stub = (name) => ({
  authenticate: (q, r, n) => n(),
  requireLevel: () => (q, r, n) => n(),
  requireRoles: () => (q, r, n) => n(),
  auditLog: () => (q, r, n) => n(),
}[name]);

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('middleware/auth')) return { authenticate: stub('authenticate') };
  if (req.includes('middleware/rbac')) return {
    requireLevel: stub('requireLevel'), requireRoles: stub('requireRoles'),
  };
  if (req.includes('middleware/auditLogger')) return { auditLog: stub('auditLog') };
  if (req.includes('controllers/backupController')) return {
    createManualBackup: (q, r) => r.end('FILE'),
    getSummary: (q, r) => r.end('{}'),
    getHistory: (q, r) => r.end('{}'),
    restoreBackup: (q, r) => r.end('{}'),
    getCloudBackups: (q, r) => r.end('{}'),
    emailBackupNow: (q, r) => r.end('{}'),
    backupOffsiteNow: (q, r) => r.end('{}'),
  };
  return orig.apply(this, arguments);
};
const router = require(path.join(__dirname, '..', 'routes/backup.js'));
Module._load = orig;

const routes = router.stack
  .filter((l) => l.route)
  .map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));

test('a backup can be asked for without sending anything', async (t) => {
  await t.test('GET /create exists, so no body is needed', () => {
    const create = routes.filter((r) => r.path === '/create');
    assert.ok(create.some((r) => r.methods.includes('get')),
      'without this the screen has to POST, and a body is a thing that can be refused');
  });

  await t.test('POST /create still works for anything that used it', () => {
    const create = routes.filter((r) => r.path === '/create');
    assert.ok(create.some((r) => r.methods.includes('post')));
  });

  await t.test('the off-site listing is readable', () => {
    assert.ok(routes.some((r) => r.path === '/cloud' && r.methods.includes('get')));
  });

  await t.test('a copy can be put off-site on demand', () => {
    // The off-site copy is the one that does not depend on mail working, so
    // it is the one worth being able to prove without waiting for 2am.
    assert.ok(routes.some((r) => r.path === '/offsite' && r.methods.includes('post')));
  });

  await t.test('a backup can be emailed on demand', () => {
    // Without this there is no way to find out whether the mail settings
    // work short of waiting for 2am — and a night already claimed by the
    // job will not run again.
    assert.ok(routes.some((r) => r.path === '/email' && r.methods.includes('post')));
  });
});

test('the body parser cannot refuse a backup', async (t) => {
  const express = require('express');

  const call = (app, opts) => new Promise((resolve) => {
    const s = app.listen(0, async () => {
      const url = `http://localhost:${s.address().port}/api/backup/create`;
      const r = await fetch(url, opts);
      const body = await r.text();
      s.close();
      resolve({ status: r.status, body });
    });
  });

  // The server's own arrangement: a lenient parser for this one path, in
  // front of the strict general one.
  const build = () => {
    const app = express();
    app.use('/api/backup/create', express.json({ strict: false, limit: '1mb' }));
    app.use(express.json({ limit: '20mb' }));
    app.use('/api/backup', router);
    app.use((err, q, r, n) => r.status(400).json({ message: err.message }));
    return app;
  };

  await t.test('asked for with nothing at all', async () => {
    const res = await call(build(), { method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body, 'FILE');
  });

  await t.test('a body of "null" is no longer fatal', async () => {
    // Exactly what axios sent, and exactly what used to come back 400 with
    // "Unexpected token 'n'".
    const res = await call(build(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null',
    });
    assert.strictEqual(res.status, 200, res.body);
  });

  await t.test('the strict parser alone is what broke it', async () => {
    // Kept as the record of the fault: without the lenient parser in front,
    // the same request is refused before any backup code runs.
    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use('/api/backup', router);
    app.use((err, q, r, n) => r.status(400).json({ message: err.message }));
    const res = await call(app, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null',
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body, /not valid JSON/);
  });
});
