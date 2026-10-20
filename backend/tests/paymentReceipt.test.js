const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/**
 * Telling the debtor their payment landed.
 *
 * The shop's record is updated the moment money changes hands; the
 * customer's record is their memory. That gap is where "I paid you last
 * month" comes from, and the shop has nothing but its own word against it.
 *
 * Two things must hold. The text has to fit one credit, or a shop watching
 * its Arkesel balance will switch the whole thing off. And a text that fails
 * must never undo a payment — the money was taken, and the receipt is a
 * courtesy on top of that, not a condition of it.
 */

let settings = null;
let contact = null;
let sent = [];
let smsResult = { ok: true, message: 'Sent.', credits: 1 };

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Settings')) return {
    findOne: () => ({ select: () => ({ lean: async () => settings }) }),
  };
  if (req.includes('models/Contact')) return {
    findOne: () => ({ select: () => ({ lean: async () => contact, catch: () => ({}) }) }),
  };
  if (req.endsWith('./arkesel') || req.includes('utils/arkesel')) return {
    sendSms: async (o) => { sent.push(o); return smsResult; },
  };
  return orig.apply(this, arguments);
};
const pr = require(path.join(B, 'utils/paymentReceipt.js'));
Module._load = orig;

const ok = () => ({
  sms_config: { api_key: 'k', sender_id: 'DANDOR', enabled: true },
  company_name: 'DAN & DOR SOLAR',
});

test('what the customer reads', async (t) => {
  await t.test('the amount, what is left, and the receipt', () => {
    const m = pr.composeReceiptSms({
      company: 'DAN & DOR SOLAR', name: 'KWESI MENSAH',
      amount: 500, remaining: 1500, receiptNo: 'RCPT-17',
    });
    assert.match(m, /GHC500\.00/);
    assert.match(m, /GHC1500\.00/);
    assert.match(m, /RCPT-17/);
    assert.match(m, /Kwesi|KWESI/);
  });

  await t.test('a cleared debt is told it is cleared, not that 0 is left', () => {
    // "Balance left: GHC0.00" is a sentence that worries somebody who has
    // just finished paying.
    const m = pr.composeReceiptSms({ name: 'Ama', amount: 300, remaining: 0 });
    assert.match(m, /cleared/i);
    assert.ok(!/Balance left/.test(m));
  });

  await t.test('a rounding crumb still counts as cleared', () => {
    const m = pr.composeReceiptSms({ name: 'Ama', amount: 300, remaining: 0.002 });
    assert.match(m, /cleared/i);
  });

  await t.test('one message, one credit', () => {
    // 160 characters is one credit. A receipt that quietly costs three is a
    // receipt the shop turns off.
    const m = pr.composeReceiptSms({
      company: 'DAN & DOR SOLAR COMPANY LIMITED, BOGOSO',
      name: 'EMMANUEL KWABENA OSEI-BONSU',
      amount: 12500.5, remaining: 48750.75, receiptNo: 'RCPT-1760000000000',
    });
    assert.ok(m.length <= 160, `${m.length} characters: ${m}`);
  });

  await t.test('the shop name is what gets dropped, never a figure', () => {
    const m = pr.composeReceiptSms({
      company: 'DAN & DOR SOLAR COMPANY LIMITED, BOGOSO',
      name: 'EMMANUEL KWABENA OSEI-BONSU',
      amount: 12500.5, remaining: 48750.75, receiptNo: 'RCPT-1760000000000',
    });
    assert.match(m, /GHC12500\.50/);
    assert.match(m, /GHC48750\.75/);
    assert.match(m, /RCPT-1760000000000/);
  });

  await t.test('no name is still a sendable message', () => {
    const m = pr.composeReceiptSms({ amount: 100, remaining: 50 });
    assert.match(m, /Customer/);
    assert.match(m, /GHC100\.00/);
  });
});

test('when it sends, and when it does not', async (t) => {
  t.beforeEach(() => {
    settings = ok(); contact = null; sent = [];
    smsResult = { ok: true, message: 'Sent.', credits: 1 };
  });

  const send = () => pr.sendPaymentReceipt({
    name: 'Kwesi', phone: '0240000001', amount: 500, remaining: 1500, receiptNo: 'RCPT-1',
  });

  await t.test('it sends to the number on the debt', async () => {
    const r = await send();
    assert.strictEqual(r.sent, true);
    assert.strictEqual(sent.length, 1);
    // Normalised on the way out: Arkesel wants 233XXXXXXXXX and refuses a
    // local 0-prefixed number, so sending the raw one would be paid for and
    // delivered nowhere.
    assert.strictEqual(sent[0].to, '233240000001');
    assert.strictEqual(sent[0].sender, 'DANDOR');
  });

  await t.test('switched off means nothing is sent', async () => {
    settings.sms_config.payment_receipts = false;
    const r = await send();
    assert.strictEqual(r.sent, false);
    assert.strictEqual(sent.length, 0);
    assert.match(r.reason, /switched off/);
  });

  await t.test('unset means on — a shop with texting set up wants receipts', async () => {
    delete settings.sms_config.payment_receipts;
    assert.strictEqual((await send()).sent, true);
  });

  await t.test('texting off at the top switches this off too', async () => {
    settings.sms_config.enabled = false;
    assert.strictEqual((await send()).sent, false);
    assert.strictEqual(sent.length, 0);
  });

  await t.test('somebody who asked not to be messaged is not messaged', async () => {
    // Whatever the message is for. A receipt is still a message.
    contact = { _id: 'c1' };
    const r = await send();
    assert.strictEqual(r.sent, false);
    assert.match(r.reason, /asked not to be messaged/);
    assert.strictEqual(sent.length, 0);
  });

  await t.test('a debt with no phone number is not an error', async () => {
    const r = await pr.sendPaymentReceipt({ name: 'Kwesi', amount: 100, remaining: 0 });
    assert.strictEqual(r.sent, false);
    assert.match(r.reason, /phone/);
  });

  await t.test('no key or sender means nothing is attempted', async () => {
    settings.sms_config.api_key = '';
    delete process.env.ARKESEL_API_KEY;
    const r = await send();
    assert.strictEqual(r.sent, false);
    assert.strictEqual(sent.length, 0);
  });

  await t.test('a refused send is reported, never thrown', async () => {
    // The payment is already recorded by the time this runs. Throwing here
    // would turn a failed courtesy into a failed payment.
    smsResult = { ok: false, message: 'Arkesel refused the API key.' };
    const r = await send();
    assert.strictEqual(r.sent, false);
    assert.match(r.reason, /refused the API key/);
  });

  await t.test('a database fault is swallowed, not propagated', async () => {
    settings = null;
    await assert.doesNotReject(() => send());
  });
});

test('writing down whether it went can never cost a payment', async (t) => {
  await t.test('a model without the method does not throw', async () => {
    // This runs after money has been taken and saved. A synchronous throw
    // here — a stub, a mis-wired model, anything — would turn a recorded
    // payment into a 500 and send the customer away unsure.
    await assert.doesNotReject(() => pr.recordSend({}, { _id: 'x' }, { sent: true }));
  });

  await t.test('a database that refuses the write does not throw', async () => {
    await assert.doesNotReject(() => pr.recordSend(
      { updateOne: async () => { throw new Error('connection lost'); } },
      { _id: 'x' }, { sent: false, reason: 'nope' }
    ));
  });

  await t.test('a successful send is written as sent', async () => {
    let got = null;
    await pr.recordSend({ updateOne: async (f, u) => { got = u; } }, { _id: 'x' }, { sent: true });
    assert.strictEqual(got.$set['payments.$.sms_sent'], true);
  });

  await t.test('a failed send keeps the reason', async () => {
    let got = null;
    await pr.recordSend(
      { updateOne: async (f, u) => { got = u; } },
      { _id: 'x' }, { sent: false, reason: 'Arkesel refused the API key.' }
    );
    assert.strictEqual(got.$set['payments.$.sms_sent'], false);
    assert.match(got.$set['payments.$.sms_error'], /refused/);
  });
});
