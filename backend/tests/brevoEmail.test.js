const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/**
 * Email leaving the server over HTTPS instead of SMTP.
 *
 * The fault being guarded against: Render's free plan shuts the SMTP ports,
 * so every send sat there and timed out, the nightly backup went nowhere, and
 * nothing on any screen said which of the two it was — a wrong password or a
 * closed port. Brevo carries the same mail over 443, so there has to be a
 * choice, the choice has to be honoured, and it has to be visible afterwards.
 */

let saved = null;
let built = null;
let brevoCalls = [];
let brevoFails = null;

// Loaded for real before anything is stubbed: the address-shaping helpers are
// pure, and the tests at the bottom exercise them as they are.
const brevo = require(path.join(__dirname, '..', 'utils/brevo.js'));

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Settings')) return {
    findOne: () => ({ select: () => ({ lean: async () => (saved ? { email_config: saved } : null) }) }),
  };
  if (req.includes('models/EmailQueue')) return { find: () => ({ sort: () => ({ limit: async () => [] }) }) };
  if (req === 'nodemailer') return {
    createTransport: (opts) => { built = opts; return { sendMail: async () => ({ messageId: 'smtp' }) }; },
  };
  if (req.endsWith('./brevo') || req.includes('utils/brevo')) return {
    sendViaBrevo: async (o) => {
      brevoCalls.push(o);
      if (brevoFails) throw new Error(brevoFails);
      return { messageId: 'brevo-1' };
    },
    parseFrom: brevo.parseFrom,
  };
  return orig.apply(this, arguments);
};
const email = require(path.join(B, 'utils/email.js'));
Module._load = orig;

const ENV_KEYS = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM', 'BREVO_API_KEY'];
const clearEnv = () => ENV_KEYS.forEach((k) => { delete process.env[k]; });

test('choosing how email leaves the server', async (t) => {
  t.beforeEach(() => { saved = null; built = null; brevoCalls = []; brevoFails = null; clearEnv(); });
  t.after(() => clearEnv());

  await t.test('SMTP stays the default when nothing is chosen', async () => {
    saved = { smtp_host: 'smtp.gmail.com', smtp_user: 'u', smtp_pass: 'p' };
    const acct = await email.mailAccount();
    assert.strictEqual(acct.provider, 'smtp');
  });

  await t.test('choosing Brevo with a key sends through Brevo', async () => {
    saved = {
      provider: 'brevo', brevo_key: 'xkeysib-abc',
      from_email: 'DAN & DOR <shop@dandor.com>',
    };
    const acct = await email.mailAccount();
    assert.strictEqual(acct.provider, 'brevo');

    const info = await email.sendEmail({ to: 'owner@dandor.com', subject: 'S', html: '<p>H</p>' });
    assert.strictEqual(info.messageId, 'brevo-1');
    assert.strictEqual(brevoCalls.length, 1);
    assert.strictEqual(brevoCalls[0].apiKey, 'xkeysib-abc');
    assert.strictEqual(brevoCalls[0].to, 'owner@dandor.com');
    assert.strictEqual(built, null, 'no SMTP connection should have been attempted');
  });

  await t.test('choosing Brevo without a key falls back rather than failing', async () => {
    // Nothing to send with. SMTP may be blocked, but it is at least worth
    // trying — and the alternative is a send that throws on a missing key
    // somebody never entered.
    saved = { provider: 'brevo', smtp_host: 'h', smtp_user: 'u', smtp_pass: 'p' };
    const acct = await email.mailAccount();
    assert.strictEqual(acct.provider, 'smtp');
  });

  await t.test('choosing SMTP is honoured even when a Brevo key is saved', async () => {
    // The point of the choice. Quietly preferring Brevo because a key
    // happens to be stored would take the decision off the person making it.
    saved = {
      provider: 'smtp', brevo_key: 'xkeysib-abc',
      smtp_host: 'smtp.gmail.com', smtp_user: 'u', smtp_pass: 'p',
    };
    const acct = await email.mailAccount();
    assert.strictEqual(acct.provider, 'smtp');
    await email.sendEmail({ to: 'o@d.com', subject: 'S', html: 'H' });
    assert.strictEqual(brevoCalls.length, 0);
    assert.strictEqual(built.host, 'smtp.gmail.com');
  });

  await t.test('a server-wide Brevo key works without touching Settings', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-env';
    process.env.EMAIL_FROM = 'shop@dandor.com';
    const acct = await email.mailAccount();
    assert.strictEqual(acct.provider, 'brevo');
    assert.strictEqual(acct.brevoKey, 'xkeysib-env');
  });

  await t.test('a Brevo failure is thrown, not swallowed', async () => {
    // Everything that sends email already catches around the send. A refused
    // key that returned quietly would be a backup reported as sent.
    saved = { provider: 'brevo', brevo_key: 'bad', from_email: 'a@b.com' };
    brevoFails = 'Brevo refused the API key.';
    await assert.rejects(
      () => email.sendEmail({ to: 'o@d.com', subject: 'S', html: 'H' }),
      /refused the API key/
    );
  });

  await t.test('an attachment goes along', async () => {
    saved = { provider: 'brevo', brevo_key: 'k', from_email: 'a@b.com' };
    await email.sendEmail({
      to: 'o@d.com', subject: 'S', html: 'H',
      attachments: [{ filename: 'backup.json.gz', content: Buffer.from('zz') }],
    });
    assert.strictEqual(brevoCalls[0].attachments[0].filename, 'backup.json.gz');
  });
});

test('putting an address into the shape Brevo accepts', async (t) => {
  await t.test('a name and address are split apart', () => {
    // Brevo takes {name, email} and rejects the combined string outright,
    // which would be a 400 on every single send.
    assert.deepStrictEqual(
      brevo.parseFrom('DAN & DOR <shop@dandor.com>'),
      { name: 'DAN & DOR', email: 'shop@dandor.com' }
    );
  });

  await t.test('a bare address is left alone', () => {
    assert.deepStrictEqual(brevo.parseFrom('shop@dandor.com'), { email: 'shop@dandor.com' });
  });

  await t.test('quotes around the name are dropped', () => {
    assert.strictEqual(brevo.parseFrom('"DAN & DOR" <a@b.com>').name, 'DAN & DOR');
  });

  await t.test('several addresses become several recipients', () => {
    assert.deepStrictEqual(
      brevo.recipients('a@b.com, c@d.com'),
      [{ email: 'a@b.com' }, { email: 'c@d.com' }]
    );
  });

  await t.test('an empty list is not a recipient', () => {
    assert.deepStrictEqual(brevo.recipients(' , '), []);
  });

  await t.test('no key is said plainly', async () => {
    await assert.rejects(
      () => brevo.sendViaBrevo({ to: 'a@b.com', subject: 'S', html: 'H' }),
      /No Brevo API key/
    );
  });

  await t.test('an attachment past what Brevo carries is refused before sending', async () => {
    // Base64 inflates a file by a third, so a 9MB gzip is an 12MB request
    // and Brevo answers 413. Better to say which copy to use instead.
    await assert.rejects(
      () => brevo.sendViaBrevo({
        apiKey: 'k',
        to: 'a@b.com',
        subject: 'S',
        html: 'H',
        attachments: [{ filename: 'b.gz', content: Buffer.alloc(brevo.MAX_ATTACHMENT_BYTES + 1) }],
      }),
      /Cloudinary copy/
    );
  });
});
