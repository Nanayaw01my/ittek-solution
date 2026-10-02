/**
 * Sending an SMS through Arkesel.
 *
 * Until now a reminder was "sent" by opening WhatsApp with the words ready
 * and trusting somebody to press the green button. That works at a counter
 * and not at all for forty overdue balances, and it leaves no honest record:
 * the log said a message was prepared, not that it arrived.
 *
 * Arkesel is a Ghanaian gateway, which matters — the numbers are local, the
 * sender ID is registered locally, and the credits are bought in cedis.
 *
 * Nothing here throws at the caller. A gateway is somebody else's computer:
 * it goes down, it runs out of credit, it rejects a sender ID that was fine
 * last week. Every path returns {ok, message, ...} so a failed send is a
 * reminder still waiting rather than a crash in the middle of a list.
 */

const https = require('https');
const { normaliseGhanaPhone } = require('./phone');

const HOST = 'sms.arkesel.com';
const SEND_PATH = '/api/v2/sms/send';
const BALANCE_PATH = '/api/v2/clients/balance-details';

/** A gateway that has not answered in fifteen seconds is not going to. */
const TIMEOUT_MS = 15000;

/**
 * The longest a single message may be before it costs more than one credit.
 *
 * Not enforced — a reminder that needs 170 characters should still go — but
 * reported, so the shop can see what it is spending before it spends it.
 */
const SEGMENT = 160;

/** How many credits a message of this length costs, by GSM-7 counting. */
const creditsFor = (message) => {
  const len = String(message || '').length;
  if (len <= SEGMENT) return 1;
  // Concatenated messages lose 7 characters per part to the joining header.
  return Math.ceil(len / 153);
};

const request = ({ method, path, apiKey, body }) =>
  new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: HOST,
        path,
        method,
        headers: {
          'api-key': apiKey,
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch { /* answered below */ }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      }
    );

    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null, raw: 'timeout' }); });
    req.on('error', (err) => resolve({ status: 0, body: null, raw: err.message }));
    if (payload) req.write(payload);
    req.end();
  });

/**
 * Did that work?
 *
 * Arkesel has answered in two shapes over the years — v2 returns
 * {status: 'success'}, the older one {code: 'ok'} — and a shop's account can
 * be on either. Both are accepted rather than picking one and leaving half
 * the world unable to send.
 */
const succeeded = (res) => {
  if (res.status < 200 || res.status >= 300) return false;
  const b = res.body;
  if (!b) return false;
  if (typeof b.status === 'string') return b.status.toLowerCase() === 'success';
  if (typeof b.code === 'string') return b.code.toLowerCase() === 'ok';
  return false;
};

/** Whatever the gateway said went wrong, in words worth showing somebody. */
const reasonFrom = (res) => {
  if (res.status === 0) {
    return res.raw === 'timeout'
      ? 'The SMS gateway did not answer. Try again in a moment.'
      : `Could not reach the SMS gateway: ${res.raw}`;
  }
  const said = res.body?.message || res.body?.data?.message;
  if (said) return String(said);
  if (res.status === 401 || res.status === 403) {
    return 'Arkesel refused the API key. Check it in Settings.';
  }
  if (res.status === 400) return 'Arkesel rejected the message. Check the sender ID.';
  return `The SMS gateway answered ${res.status}.`;
};

/**
 * Send one message.
 *
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.sender     registered sender ID, 11 characters at most
 * @param {string} opts.to         any shape a Ghanaian number is written in
 * @param {string} opts.message
 * @returns {Promise<{ok: boolean, message: string, credits?: number, to?: string}>}
 */
const sendSms = async ({ apiKey, sender, to, message }) => {
  if (!apiKey) return { ok: false, message: 'No Arkesel API key is set. Add one in Settings.' };
  if (!sender) return { ok: false, message: 'No sender ID is set. Add one in Settings.' };
  if (!message || !String(message).trim()) return { ok: false, message: 'There is nothing to send.' };

  // Arkesel wants 233XXXXXXXXX, which is exactly what this returns — and it
  // refuses anything that is not a real Ghanaian number, so a typo is caught
  // here rather than paid for and delivered nowhere.
  const number = normaliseGhanaPhone(to);
  if (!number) return { ok: false, message: `${to || 'That number'} is not a Ghana number we can text.` };

  const res = await request({
    method: 'POST',
    path: SEND_PATH,
    apiKey,
    body: { sender: String(sender).slice(0, 11), message: String(message), recipients: [number] },
  });

  if (!succeeded(res)) return { ok: false, message: reasonFrom(res), to: number };
  return {
    ok: true,
    message: 'Sent.',
    to: number,
    credits: creditsFor(message),
  };
};

/**
 * What is left in the account.
 *
 * Worth showing before a run of forty reminders, because the failure a shop
 * actually hits is running out halfway and not knowing which ones went.
 */
const smsBalance = async ({ apiKey }) => {
  if (!apiKey) return { ok: false, message: 'No Arkesel API key is set.' };
  const res = await request({ method: 'GET', path: BALANCE_PATH, apiKey });
  if (!succeeded(res) && res.status !== 200) return { ok: false, message: reasonFrom(res) };

  // The figure has sat under several names across versions; take the first
  // that looks like a number rather than insisting on one spelling.
  const d = res.body?.data || res.body || {};
  const raw = [d.sms_balance, d.balance, d.main_balance, d.credit_balance]
    .find((v) => v !== undefined && v !== null);
  const balance = Number(String(raw).replace(/[^\d.]/g, ''));

  return {
    ok: true,
    balance: Number.isFinite(balance) ? balance : null,
    user: d.user || d.name || null,
    message: 'ok',
  };
};

module.exports = { sendSms, smsBalance, creditsFor, SEGMENT };
