const https = require('https');

// Normalise Ghana phone numbers to international format (233XXXXXXXXX)
function normalisePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return '233' + digits.slice(1);
  if (digits.length === 9) return '233' + digits;
  return digits;
}

/**
 * Send an SMS via Arkesel v2 API.
 * Requires env vars: ARKESEL_API_KEY, ARKESEL_SENDER_ID (optional, defaults to SMS)
 *
 * @param {string|string[]} to  - Phone number(s) in any Ghana format
 * @param {string} message      - SMS body (max 160 chars for single SMS)
 * @returns {Promise<{success: boolean, message: string, raw?: any}>}
 */
async function sendSMS(to, message) {
  const apiKey = process.env.ARKESEL_API_KEY;

  if (!apiKey) {
    console.warn('[SMS] ARKESEL_API_KEY not configured — SMS skipped');
    return { success: false, message: 'SMS API key not configured' };
  }

  const recipients = (Array.isArray(to) ? to : [to])
    .map(normalisePhone)
    .filter(Boolean);

  if (recipients.length === 0) {
    return { success: false, message: 'No valid phone numbers' };
  }

  const payload = JSON.stringify({
    sender: process.env.ARKESEL_SENDER_ID || 'DANDORSOLTD',
    message,
    recipients,
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'sms.arkesel.com',
      path: '/api/v2/sms/send',
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          resolve({ success: ok, message: parsed.message || 'Sent', raw: parsed });
        } catch {
          resolve({ success: false, message: 'Invalid response from SMS API', raw: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[SMS] Request error:', err.message);
      resolve({ success: false, message: err.message });
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendSMS, normalisePhone };
