/**
 * Sending email through Brevo's HTTPS API.
 *
 * Render's free plan blocks outbound SMTP — ports 25, 465 and 587 are closed,
 * so nodemailer sits there until it times out and every email the system
 * wants to send is lost. That is not a password fault and no amount of
 * correcting the Gmail details fixes it; the port is simply shut.
 *
 * Brevo accepts the same email over ordinary HTTPS on 443, which is open.
 * One API key, no SMTP, and the nightly backup can leave the building again.
 *
 * Written against the native https module on purpose: the backend has no
 * axios, and adding a dependency to post one JSON body is not worth the
 * install. The SMS gateway in arkesel.js talks the same way.
 */

const https = require('https');

const HOST = 'api.brevo.com';
const SEND_PATH = '/v3/smtp/email';

/** A mail API that has not answered in twenty seconds is not going to. */
const TIMEOUT_MS = 20000;

/**
 * Brevo refuses a payload past 10MB, and base64 inflates a file by a third.
 * So the real ceiling on an attachment is about 7MB — stay clear of it.
 */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

/**
 * "ITTEK Solution <shop@example.com>" split into the two parts Brevo wants.
 *
 * Nodemailer takes that one string; Brevo takes {name, email} and rejects
 * the combined form outright, which would be a 400 on every send.
 */
const parseFrom = (from) => {
  const text = String(from || '').trim();
  const angled = text.match(/^(.*?)\s*<([^>]+)>$/);
  if (angled) {
    return { name: angled[1].replace(/^"|"$/g, '').trim() || undefined, email: angled[2].trim() };
  }
  return { email: text };
};

/** One address, or several separated by commas, as Brevo's list of objects. */
const recipients = (to) =>
  String(to || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email }));

const post = (apiKey, body) =>
  new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        host: HOST,
        path: SEND_PATH,
        method: 'POST',
        headers: {
          'api-key': apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch { /* reported below */ }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      }
    );

    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null, raw: 'timeout' }); });
    req.on('error', (err) => resolve({ status: 0, body: null, raw: err.message }));
    req.write(payload);
    req.end();
  });

/** Whatever Brevo said went wrong, in words worth putting on a screen. */
const reasonFrom = (res) => {
  if (res.status === 0) {
    return res.raw === 'timeout'
      ? 'Brevo did not answer. Try again in a moment.'
      : `Could not reach Brevo: ${res.raw}`;
  }
  const said = res.body?.message;
  if (res.status === 401) {
    return 'Brevo refused the API key. Check it in Settings → Email Config.';
  }
  if (res.status === 400 && /sender/i.test(String(said || ''))) {
    return `Brevo rejected the From address — it has to be a sender you have verified `
      + `in your Brevo account. ${said}`;
  }
  if (said) return String(said);
  return `Brevo answered ${res.status}.`;
};

/**
 * Send one email.
 *
 * Throws on failure, like nodemailer's sendMail does, so the callers that
 * already catch around sending do not each need a second shape to handle.
 *
 * @param {Object} o
 * @param {string} o.apiKey    Brevo API key (v3).
 * @param {string} o.from      "Name <address>" or a bare address.
 * @param {string} o.to        One address, or several comma-separated.
 * @param {string} o.subject
 * @param {string} o.html
 * @param {Array}  [o.attachments] [{ filename, content: Buffer }]
 */
const sendViaBrevo = async ({ apiKey, from, to, subject, html, attachments }) => {
  if (!apiKey) throw new Error('No Brevo API key is set. Fill it in under Settings → Email Config.');

  const people = recipients(to);
  if (people.length === 0) throw new Error('No address to send to.');

  const files = (attachments || []).filter((a) => a?.content);
  const bytes = files.reduce((n, a) => n + Buffer.byteLength(a.content), 0);
  if (bytes > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment is ${(bytes / 1024 / 1024).toFixed(1)}MB — Brevo will not carry `
      + 'more than about 7MB. Use the Cloudinary copy instead.');
  }

  const res = await post(apiKey, {
    sender: parseFrom(from),
    to: people,
    subject,
    htmlContent: html,
    ...(files.length
      ? {
        attachment: files.map((a) => ({
          name: a.filename,
          content: Buffer.from(a.content).toString('base64'),
        })),
      }
      : {}),
  });

  if (res.status < 200 || res.status >= 300) throw new Error(reasonFrom(res));

  return { messageId: res.body?.messageId || res.body?.messageIds?.[0] || 'brevo' };
};

module.exports = { sendViaBrevo, parseFrom, recipients, MAX_ATTACHMENT_BYTES };
