const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/**
 * Sending a backup to an inbox on demand.
 *
 * "Did last night's backup arrive?" was answered by waiting until tomorrow
 * and looking — and a run already claimed for today will not run again, so
 * there was no honest way to test a change to the mail settings at all. A
 * person fixing mail needs an answer in ten seconds, in the mail server's
 * own words.
 */

let sent = [];
let sendFails = null;
let settings = { company_name: 'DAN & DOR SOLAR', company_email: 'owner@dandor.com' };
let account = { provider: 'brevo', host: 'smtp.gmail.com', port: 587 };
let backupJson = JSON.stringify({ pad: 'x'.repeat(500) });

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('utils/backup')) return {
    createBackup: async () => ({
      json: backupJson,
      filename: 'ittek-backup-2026-10-22.json',
      meta: { document_count: 3665, collection_count: 39 },
    }),
    getBackupHistory: () => [],
    restoreFromBackup: async () => ({}),
  };
  if (req.includes('utils/cloudBackup')) return { listBackups: async () => [], cloudConfigured: () => false };
  if (req.includes('models/Settings')) return {
    findOne: () => ({ select: () => ({ lean: async () => settings }) }),
  };
  if (req.includes('utils/email')) return {
    sendEmail: async (o) => { sent.push(o); if (sendFails) throw new Error(sendFails); return {}; },
    mailAccount: async () => account,
  };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/backupController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = s => { r.code = s; return r; }; r.json = b => { r.body = b; return r; }; return r; };
const send = async (body = {}) => { const r = res(); await c.emailBackupNow({ body }, r); return r; };

test('emailing a backup on demand', async (t) => {
  t.beforeEach(() => {
    sent = []; sendFails = null;
    settings = { company_name: 'DAN & DOR SOLAR', company_email: 'owner@dandor.com' };
    account = { provider: 'brevo', host: 'smtp.gmail.com', port: 587 };
    backupJson = JSON.stringify({ pad: 'x'.repeat(500) });
    delete process.env.BACKUP_EMAIL;
    delete process.env.ADMIN_EMAIL;
    delete process.env.EMAIL_USER;
  });

  await t.test('it goes to the same address the nightly job uses', async () => {
    // A test that arrives somewhere else proves nothing about tonight.
    const r = await send();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(sent[0].to, 'owner@dandor.com');
  });

  await t.test('BACKUP_EMAIL wins, exactly as it does for the job', async () => {
    process.env.BACKUP_EMAIL = 'books@dandor.com';
    await send();
    assert.strictEqual(sent[0].to, 'books@dandor.com');
  });

  await t.test('a typed address overrides both, without changing anything', async () => {
    await send({ to: 'me@example.com' });
    assert.strictEqual(sent[0].to, 'me@example.com');
    // And the stored settings are untouched — this is a test, not a change.
    assert.strictEqual(settings.company_email, 'owner@dandor.com');
  });

  await t.test('the backup is attached, compressed', async () => {
    await send();
    const att = sent[0].attachments[0];
    assert.match(att.filename, /\.json\.gz$/);
    assert.ok(Buffer.isBuffer(att.content));
    // gzip of a repetitive JSON blob is far smaller than the blob.
    assert.ok(att.content.length < backupJson.length);
  });

  await t.test('it says which route carried it', async () => {
    // Somebody who switched to Brevo and still reads smtp.gmail.com:587 has
    // learned the switch did not take.
    const r = await send();
    assert.match(r.body.data.via, /Brevo/);
    account = { provider: 'smtp', host: 'smtp.office365.com', port: 587 };
    const r2 = await send();
    assert.match(r2.body.data.via, /smtp\.office365\.com:587/);
  });

  await t.test('no address anywhere is said plainly, not attempted', async () => {
    settings = { company_name: 'DAN & DOR SOLAR' };
    const r = await send();
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /no address/i);
    assert.strictEqual(sent.length, 0);
  });

  await t.test("the mail server's own words come back", async () => {
    // "Failed" leaves somebody guessing at the exact moment they are trying
    // to fix this.
    sendFails = 'Connection timeout';
    const r = await send();
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /Connection timeout/);
  });

  await t.test('a backup too big to attach is refused with the reason', async () => {
    const crypto = require('node:crypto');
    backupJson = JSON.stringify({ pad: crypto.randomBytes(24 * 1024 * 1024).toString('base64') });
    const r = await send();
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /too large to email/);
    assert.match(r.body.message, /off-site copy/);
  });
});
