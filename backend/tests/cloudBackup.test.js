const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/**
 * The nightly backup, now that it has two places to go.
 *
 * The fault: it had one. Email. On Render's free plan the SMTP ports are
 * shut, so for months the job could make a flawless backup every night and
 * post it precisely nowhere, and the only sign was a red square on a screen
 * nobody opens. Two independent routes, and the night only counts as failed
 * when both have failed — one surviving copy is a backup.
 */

let cloudOk = true;
let cloudWhy = 'Cloudinary refused the upload.';
let configured = true;
let emailOk = true;
let emailWhy = 'Connection timeout';
let uploads = [];
let sent = [];
let notices = [];
let pruned = 0;
let backupBytes = 2048;
let shopEmail = 'owner@dandor.com';

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Settings')) return {
    findOne: () => ({ select: () => ({ lean: async () => ({
      company_name: 'DAN & DOR SOLAR', company_email: shopEmail,
    }) }) }),
  };
  if (req.endsWith('./backup') || req.includes('utils/backup')) return {
    createBackup: async () => ({
      // Random, so it barely compresses and the gzip lands near the size
      // being tested for. A padded string of one character gzips to nothing,
      // and then the too-large case can never be reached.
      json: JSON.stringify({ pad: crypto.randomBytes(backupBytes).toString('base64') }),
      filename: 'ittek-backup-2026-10-18.json',
      meta: { document_count: 1200, collection_count: 24 },
    }),
  };
  if (req.endsWith('./email') || req.includes('utils/email')) return {
    sendEmail: async (o) => {
      sent.push(o);
      if (!emailOk) throw new Error(emailWhy);
      return { messageId: 'x' };
    },
  };
  if (req.endsWith('./notify') || req.includes('utils/notify')) return {
    notifyOwners: async (n) => { notices.push(n); },
  };
  if (req.endsWith('./cloudBackup') || req.includes('utils/cloudBackup')) return {
    cloudConfigured: () => configured,
    uploadBackup: async (packed, name) => {
      uploads.push({ name, bytes: packed.length });
      if (!cloudOk) throw new Error(cloudWhy);
      return { public_id: `ittek/backups/${name}`, bytes: packed.length, url: 'https://signed' };
    },
    pruneBackups: async () => { pruned += 1; return 0; },
  };
  return orig.apply(this, arguments);
};
const { runNightlyBackup, MAX_ATTACHMENT_BYTES } = require(path.join(B, 'utils/autoBackup.js'));
Module._load = orig;

const reset = () => {
  cloudOk = true; configured = true; emailOk = true;
  uploads = []; sent = []; notices = []; pruned = 0; backupBytes = 2048;
  shopEmail = 'owner@dandor.com';
  process.env.BACKUP_EMAIL = 'owner@dandor.com';
};
const tagged = (tag) => notices.filter((n) => n.tag === tag);

test('where the nightly backup ends up', async (t) => {
  t.beforeEach(reset);
  t.after(() => { delete process.env.BACKUP_EMAIL; });

  await t.test('both routes work: both are used, and both are said', async () => {
    const said = await runNightlyBackup();
    assert.strictEqual(uploads.length, 1);
    assert.strictEqual(sent.length, 1);
    assert.match(said, /off-site/);
    assert.match(said, /owner@dandor\.com/);
    assert.match(said, /1200 records/);
    assert.strictEqual(notices.length, 0, 'a working night should be silent');
  });

  await t.test('the copy is gzipped and named .json.gz', async () => {
    await runNightlyBackup();
    assert.match(uploads[0].name, /^ittek-backup-2026-10-18\.json\.gz$/);
    assert.ok(uploads[0].bytes > 0);
  });

  await t.test('old copies are pruned, but only after a successful upload', async () => {
    await runNightlyBackup();
    assert.strictEqual(pruned, 1);
    reset();
    cloudOk = false;
    await runNightlyBackup();
    assert.strictEqual(pruned, 0, 'nothing should be deleted on a night that failed to upload');
  });

  await t.test('email blocked: the backup still leaves the server', async () => {
    // The whole point. This is the live fault — port 587 shut by the host.
    emailOk = false;
    emailWhy = 'Connection timeout';
    const said = await runNightlyBackup();
    assert.strictEqual(uploads.length, 1);
    assert.match(said, /off-site/);
    assert.ok(!/emailed/.test(said));
    // Not a failure, but a shop running on one copy should know it is.
    assert.strictEqual(tagged('backup-one-copy').length, 1);
    assert.match(tagged('backup-one-copy')[0].message, /could not be emailed/);
    assert.strictEqual(tagged('backup-send-failed').length, 0);
  });

  await t.test('Cloudinary down: email still carries it', async () => {
    cloudOk = false;
    const said = await runNightlyBackup();
    assert.strictEqual(sent.length, 1);
    assert.match(said, /emailed to owner@dandor\.com/);
    assert.strictEqual(tagged('backup-one-copy').length, 1);
    assert.match(tagged('backup-one-copy')[0].message, /off-site copy failed/);
  });

  await t.test('both routes gone: said out loud, and the run is failed', async () => {
    cloudOk = false;
    emailOk = false;
    await assert.rejects(() => runNightlyBackup(), (err) => {
      // Both reasons, because fixing the wrong one is a month of red squares.
      assert.match(err.message, /could not save it anywhere/i);
      assert.match(err.message, /Off-site: .*refused/);
      assert.match(err.message, /Email: .*timeout/);
      return true;
    });
    assert.strictEqual(tagged('backup-send-failed').length, 1);
  });

  await t.test('no email address is no longer fatal', async () => {
    // It used to stop before the backup was even taken. With an off-site
    // copy available, an unset address is a missing second copy, not a
    // missing backup.
    shopEmail = '';
    delete process.env.BACKUP_EMAIL;
    delete process.env.ADMIN_EMAIL;
    delete process.env.EMAIL_USER;
    const said = await runNightlyBackup();
    assert.strictEqual(uploads.length, 1);
    assert.strictEqual(sent.length, 0);
    assert.match(said, /off-site/);
    // And not nagged about it. Leaving the address blank is a choice, and a
    // nightly note about a copy nobody asked for is how real warnings come
    // to be ignored.
    assert.strictEqual(notices.length, 0);
  });

  await t.test('nothing set up at all: said, and no pointless work done', async () => {
    configured = false;
    shopEmail = '';
    delete process.env.BACKUP_EMAIL;
    delete process.env.ADMIN_EMAIL;
    delete process.env.EMAIL_USER;
    const said = await runNightlyBackup();
    assert.match(said, /Nowhere to put a backup/);
    assert.strictEqual(uploads.length, 0);
    assert.strictEqual(tagged('backup-no-address').length, 1);
  });

  await t.test('too large to email, but not too large to keep', async () => {
    // A backup that outgrew email is not a backup that has nowhere to go.
    backupBytes = 24 * 1024 * 1024;
    const said = await runNightlyBackup();
    assert.strictEqual(uploads.length, 1, 'size is no object off-site');
    assert.match(said, /off-site/);
    // A note still goes out, so nobody is waiting for an attachment.
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0].subject, /too large/);
    assert.ok(!sent[0].attachments, 'the thing that is too big must not be attached');
    // And it is not raised as a problem, because the data is safe.
    assert.strictEqual(tagged('backup-too-large').length, 0);
  });

  await t.test('too large and no off-site copy means nothing was kept', async () => {
    // Email was the only route, the file will not fit down it, and so there
    // is no backup tonight. That is a failed run, not a warning — it is
    // exactly the situation that must not pass quietly.
    configured = false;
    backupBytes = 24 * 1024 * 1024;
    await assert.rejects(() => runNightlyBackup(), /too large to attach/);
    assert.strictEqual(tagged('backup-too-large').length, 1);
    assert.strictEqual(tagged('backup-send-failed').length, 1);
    // And a note still goes out so nobody waits for an attachment.
    assert.match(sent[0].subject, /too large/);
  });

  await t.test('the email ceiling is well inside what a mailbox accepts', () => {
    assert.ok(MAX_ATTACHMENT_BYTES < 25 * 1024 * 1024);
  });
});

/**
 * The off-site copies must not be readable by anybody who guesses the URL.
 *
 * A shop's whole database at a public address — every customer, every price,
 * every password hash — would be worse than having no backup at all.
 */
test('the off-site copies are not public', async (t) => {
  let uploadOpts = null;
  let urlOpts = null;

  const o = Module._load;
  Module._load = function (req) {
    if (req.includes('config/cloudinary')) return {
      // The real SDK answers config() with whatever it was told, however it
      // was told — three variables or one CLOUDINARY_URL. Asking it is what
      // stopped a configured shop being told its backups were not set up.
      config: () => ({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      }),
      uploader: {
        upload_stream: (opts, cb) => {
          uploadOpts = opts;
          return { end: () => cb(null, { public_id: `${opts.folder}/${opts.public_id}`, bytes: 10 }) };
        },
      },
      url: (id, opts) => { urlOpts = opts; return `https://res.cloudinary.com/signed/${id}`; },
      api: {
        resources: async () => ({ resources: [
          { public_id: 'ittek/backups/ittek-backup-2026-10-17.json', bytes: 10, created_at: '2026-10-17T02:00:00Z' },
          { public_id: 'ittek/backups/ittek-backup-2026-10-18.json', bytes: 12, created_at: '2026-10-18T02:00:00Z' },
        ] }),
      },
    };
    return o.apply(this, arguments);
  };
  const cloud = require(path.join(B, 'utils/cloudBackup.js'));
  Module._load = o;

  const env = { ...process.env };
  process.env.CLOUDINARY_CLOUD_NAME = 'c';
  process.env.CLOUDINARY_API_KEY = 'k';
  process.env.CLOUDINARY_API_SECRET = 's';
  t.after(() => { process.env = env; });

  await t.test('uploaded as an authenticated raw file, never public', async () => {
    await cloud.uploadBackup(Buffer.from('zz'), 'ittek-backup-2026-10-18.json.gz');
    assert.strictEqual(uploadOpts.type, 'authenticated');
    assert.strictEqual(uploadOpts.resource_type, 'raw');
    assert.strictEqual(uploadOpts.folder, 'ittek/backups');
    // Cloudinary otherwise adds a random suffix, and then the night's copy
    // cannot be named from anywhere else.
    assert.strictEqual(uploadOpts.unique_filename, false);
  });

  await t.test('the link is signed', async () => {
    const got = await cloud.uploadBackup(Buffer.from('zz'), 'b.json.gz');
    assert.strictEqual(urlOpts.sign_url, true);
    assert.strictEqual(urlOpts.type, 'authenticated');
    assert.ok(got.url.startsWith('https://'));
  });

  await t.test('the listing is newest first, with a link each', async () => {
    const list = await cloud.listBackups();
    assert.strictEqual(list.length, 2);
    assert.match(list[0].filename, /2026-10-18/);
    assert.ok(list.every((b) => b.url));
  });

  await t.test('nothing is attempted when Cloudinary is not set up', async () => {
    delete process.env.CLOUDINARY_API_SECRET;
    assert.strictEqual(cloud.cloudConfigured(), false);
    assert.deepStrictEqual(await cloud.listBackups(), []);
    await assert.rejects(() => cloud.uploadBackup(Buffer.from('z'), 'b.gz'), /not set up/);
  });
});

/**
 * However this server was told about Cloudinary.
 *
 * Two ways are in use in the wild: three separate variables, or the single
 * CLOUDINARY_URL the dashboard hands out. Reading only the three told a shop
 * whose logo uploads had worked for months that its off-site backups were
 * "not set up" — and sent its owner to set something that was already set.
 */
test('knowing whether Cloudinary is set up', async (t) => {
  const keys = ['CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const clear = () => keys.forEach((k) => { delete process.env[k]; });
  t.after(() => {
    clear();
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  });

  /** cloudConfigured, asked against a given SDK state. */
  const askedWith = (cfg) => {
    const o = Module._load;
    Module._load = function (req) {
      if (req.includes('config/cloudinary')) return { config: () => cfg };
      return o.apply(this, arguments);
    };
    delete require.cache[require.resolve(path.join(B, 'utils/cloudBackup.js'))];
    const mod = require(path.join(B, 'utils/cloudBackup.js'));
    Module._load = o;
    delete require.cache[require.resolve(path.join(B, 'utils/cloudBackup.js'))];
    return mod.cloudConfigured();
  };

  await t.test('it asks the library, not the environment', () => {
    // The whole fix. The library knows about CLOUDINARY_URL; the three
    // environment variables do not.
    clear();
    assert.strictEqual(
      askedWith({ cloud_name: 'dandor', api_key: '123', api_secret: 'abc' }),
      true,
      'a configured library means a configured server, whatever set it up'
    );
  });

  await t.test('half of it set is not set up', () => {
    // A cloud name with no secret cannot upload anything, and calling that
    // configured turns a clear message into a nightly failure.
    assert.strictEqual(askedWith({ cloud_name: 'dandor' }), false);
    assert.strictEqual(askedWith({ cloud_name: 'dandor', api_key: '123' }), false);
  });

  await t.test('nothing set is nothing set', () => {
    assert.strictEqual(askedWith({}), false);
  });

  await t.test('CLOUDINARY_URL alone really does configure the library', () => {
    // config/cloudinary.js used to pass three undefined values straight to
    // config(), wiping out what the SDK had already worked out for itself.
    clear();
    process.env.CLOUDINARY_URL = 'cloudinary://123:abc@dandor';
    delete require.cache[require.resolve('cloudinary')];
    delete require.cache[require.resolve(path.join(B, 'config/cloudinary.js'))];
    const sdk = require(path.join(B, 'config/cloudinary.js'));
    assert.strictEqual(sdk.config().cloud_name, 'dandor');
    delete require.cache[require.resolve('cloudinary')];
    delete require.cache[require.resolve(path.join(B, 'config/cloudinary.js'))];
  });
});
