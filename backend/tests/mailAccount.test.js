const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let saved = null;
let built = null;

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Settings')) return {
    findOne: () => ({ select: () => ({ lean: async () => (saved ? { email_config: saved } : null) }) }),
  };
  if (req.includes('models/EmailQueue')) return { find: () => ({ sort: () => ({ limit: async () => [] }) }) };
  if (req === 'nodemailer') return {
    createTransport: (opts) => { built = opts; return { sendMail: async () => ({ messageId: 'x' }) }; },
  };
  return orig.apply(this, arguments);
};
const email = require(path.join(B, 'utils/email.js'));
Module._load = orig;

const ENV_KEYS = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM'];
const clearEnv = () => ENV_KEYS.forEach((k) => { delete process.env[k]; });

test('which mail account the system actually uses', async (t) => {
  t.beforeEach(() => { saved = null; built = null; clearEnv(); });
  t.after(() => clearEnv());

  await t.test('what is typed in Settings is used', async () => {
    // The whole fault: these were saved and never read, so everything typed
    // into the Email Config tab was ignored.
    saved = {
      smtp_host: 'smtp.office365.com', smtp_port: 587,
      smtp_user: 'shop@dandor.com', smtp_pass: 'secret',
      from_email: 'DAN & DOR <shop@dandor.com>',
    };
    const acct = await email.mailAccount();
    assert.strictEqual(acct.host, 'smtp.office365.com');
    assert.strictEqual(acct.user, 'shop@dandor.com');
    assert.strictEqual(acct.from, 'DAN & DOR <shop@dandor.com>');
    assert.strictEqual(acct.source, 'settings');
  });

  await t.test('Settings beats the server variables', async () => {
    process.env.EMAIL_HOST = 'smtp.gmail.com';
    process.env.EMAIL_USER = 'old@gmail.com';
    process.env.EMAIL_PASS = 'old';
    saved = { smtp_host: 'smtp.office365.com', smtp_user: 'new@dandor.com', smtp_pass: 'new' };
    const acct = await email.mailAccount();
    assert.strictEqual(acct.host, 'smtp.office365.com');
    assert.strictEqual(acct.user, 'new@dandor.com');
  });

  await t.test('the server variables still work when nothing is saved', async () => {
    process.env.EMAIL_HOST = 'smtp.gmail.com';
    process.env.EMAIL_PORT = '465';
    process.env.EMAIL_USER = 'shop@gmail.com';
    process.env.EMAIL_PASS = 'app-password';
    const acct = await email.mailAccount();
    assert.strictEqual(acct.host, 'smtp.gmail.com');
    assert.strictEqual(acct.port, 465);
    assert.strictEqual(acct.source, 'server');
  });

  await t.test('port 465 is sent as implicit TLS, 587 as STARTTLS', async () => {
    saved = { smtp_host: 'h', smtp_port: 465, smtp_user: 'u', smtp_pass: 'p' };
    await email.createTransporter();
    assert.strictEqual(built.secure, true, '465 unencrypted is a connection that hangs');

    saved = { smtp_host: 'h', smtp_port: 587, smtp_user: 'u', smtp_pass: 'p' };
    await email.createTransporter();
    assert.strictEqual(built.secure, false);
  });

  await t.test('a missing account is named, not left to time out', async () => {
    // Without this nodemailer tries an unauthenticated connection and fails
    // much later with something about a socket — sending whoever reads it
    // looking for a network fault that is not there.
    await assert.rejects(
      () => email.createTransporter(),
      /No mail account is set.*Settings → Email Config/s
    );
  });

  await t.test('a half-filled account is treated as missing', async () => {
    saved = { smtp_host: 'h', smtp_user: 'u' };   // no password
    await assert.rejects(() => email.createTransporter(), /No mail account is set/);
  });

  await t.test('the connection is given a timeout, so it cannot hang for ever', async () => {
    saved = { smtp_host: 'h', smtp_port: 587, smtp_user: 'u', smtp_pass: 'p' };
    await email.createTransporter();
    assert.ok(built.connectionTimeout > 0 && built.connectionTimeout <= 30000);
  });

  await t.test('a sent message is from the saved address', async () => {
    saved = { smtp_host: 'h', smtp_port: 587, smtp_user: 'u', smtp_pass: 'p', from_email: 'shop@dandor.com' };
    const sent = [];
    const realCreate = email.createTransporter;
    await email.sendEmail({ to: 'x@y.com', subject: 's', html: '<p>h</p>' });
    assert.ok(built, 'a transporter was built from the saved settings');
    assert.strictEqual(built.auth.user, 'u');
  });
});
