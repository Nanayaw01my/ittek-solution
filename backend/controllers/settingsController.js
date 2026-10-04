const Settings = require('../models/Settings');
const multer = require('multer');
const { sendSms, smsBalance } = require('../utils/arkesel');
const path = require('path');

const CLEARABLE_MODELS = [
  '../models/Sale', '../models/Debt', '../models/Product', '../models/Category',
  '../models/Supplier', '../models/Purchase', '../models/Expense', '../models/WorkerPayment',
  '../models/StockRequest', '../models/CreditAgreement', '../models/Notification',
  '../models/AuditLog', '../models/Refund', '../models/Customer', '../models/Payment',
  '../models/InstallmentPlan', '../models/Device', '../models/EmailQueue',
  '../models/PasswordReset',
];

/**
 * GET /api/settings
 */
const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        company_name: 'DAN & DOR SOLAR COMPANY LIMITED',
        currency_symbol: 'GH₵',
      });
    }
    // The SMS key is select:false, so it is already absent — but the screen
    // still has to show whether one is set, and which. The last four
    // characters tell one key from another without handing over a working one.
    const withKey = await Settings.findById(settings._id).select('+sms_config.api_key').lean();
    const key = withKey?.sms_config?.api_key || '';
    const data = settings.toObject();
    data.sms_config = {
      ...(data.sms_config || {}),
      api_key: undefined,
      api_key_set: !!key,
      api_key_tail: key ? key.slice(-4) : '',
    };

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Get settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/settings
 */
const updateSettings = async (req, res) => {
  try {
    const {
      company_name, company_address, company_phone, company_email,
      tax_rate, low_stock_alert, receipt_header, receipt_footer,
      currency_symbol, notification_settings, logo_url,
      base_currency, currencies, loyalty_settings, fraud_settings, layaway_settings,
      receipt_width_mm,
    } = req.body;

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }

    if (company_name !== undefined) settings.company_name = company_name;
    if (company_address !== undefined) settings.company_address = company_address;
    if (company_phone !== undefined) settings.company_phone = company_phone;
    if (company_email !== undefined) settings.company_email = company_email;
    if (tax_rate !== undefined) settings.tax_rate = tax_rate;
    if (low_stock_alert !== undefined) settings.low_stock_alert = low_stock_alert;
    if (receipt_header !== undefined) settings.receipt_header = receipt_header;
    if (receipt_footer !== undefined) settings.receipt_footer = receipt_footer;
    if (currency_symbol !== undefined) settings.currency_symbol = currency_symbol;
    if (notification_settings !== undefined) {
      settings.notification_settings = { ...settings.notification_settings, ...notification_settings };
    }
    if (logo_url !== undefined) settings.logo_url = logo_url;
    if (base_currency !== undefined) settings.base_currency = base_currency;
    if (Array.isArray(currencies)) {
      // The base currency must always sit at rate 1, or every conversion drifts.
      settings.currencies = currencies.map((c) => ({
        code: String(c.code || '').toUpperCase(),
        symbol: c.symbol,
        rate: String(c.code || '').toUpperCase() === (base_currency || settings.base_currency)
          ? 1
          : Number(c.rate) || 0,
        is_active: c.is_active !== false,
      }));
    }
    if (loyalty_settings !== undefined) {
      settings.loyalty_settings = { ...(settings.loyalty_settings || {}), ...loyalty_settings };
    }
    if (fraud_settings !== undefined) {
      settings.fraud_settings = { ...(settings.fraud_settings || {}), ...fraud_settings };
    }
    if (receipt_width_mm !== undefined) {
      // Clamp rather than reject: a bad value here would break every receipt.
      settings.receipt_width_mm = Math.min(82, Math.max(20, Number(receipt_width_mm) || 80));
    }
    if (layaway_settings !== undefined) {
      settings.layaway_settings = { ...(settings.layaway_settings || {}), ...layaway_settings };
    }

    settings.updated_at = new Date();
    settings.updated_by = req.user._id;
    await settings.save();

    return res.status(200).json({ success: true, message: 'Settings updated.', data: settings });
  } catch (err) {
    console.error('Update settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * The key and sender in force, whichever way they were set.
 *
 * Settings win over the environment, so the person who buys the credits can
 * change the key without a deploy — but an environment variable still works,
 * which is how a fresh install sends anything before anybody has opened
 * Settings at all.
 */
const smsCredentials = async () => {
  const settings = await Settings.findOne().select('+sms_config.api_key').lean();
  const cfg = settings?.sms_config || {};
  return {
    apiKey: cfg.api_key || process.env.ARKESEL_API_KEY || '',
    sender: cfg.sender_id || process.env.ARKESEL_SENDER_ID || '',
    enabled: cfg.enabled !== false,
  };
};

/** PUT /api/settings/sms — the Arkesel key, sender ID and on/off switch. */
const updateSmsConfig = async (req, res) => {
  try {
    const { api_key, sender_id, enabled } = req.body;

    let settings = await Settings.findOne().select('+sms_config.api_key');
    if (!settings) settings = new Settings();

    const next = { ...(settings.sms_config?.toObject?.() || settings.sms_config || {}) };

    // An empty key means "leave it alone", not "delete it" — the screen never
    // receives the key, so it cannot send it back, and a blank box on save
    // would wipe a working key every time anything else was changed.
    if (typeof api_key === 'string' && api_key.trim()) next.api_key = api_key.trim();

    if (typeof sender_id === 'string') {
      const id = sender_id.trim();
      if (id.length > 11) {
        return res.status(400).json({
          success: false,
          message: 'Arkesel allows at most 11 characters in a sender ID.',
        });
      }
      next.sender_id = id;
    }
    if (typeof enabled === 'boolean') next.enabled = enabled;
    next.provider = 'arkesel';
    settings.sms_config = next;

    // Chasing rides on the same screen, because it is the same question:
    // what does this shop send, and when.
    const chase = req.body?.debt_chasing;
    if (chase && typeof chase === 'object') {
      const now = { ...(settings.debt_chasing?.toObject?.() || settings.debt_chasing || {}) };
      if (typeof chase.enabled === 'boolean') now.enabled = chase.enabled;
      if (typeof chase.on_due_day === 'boolean') now.on_due_day = chase.on_due_day;
      const num = (v, lo, hi, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
      };
      if (chase.repeat_every_days !== undefined) now.repeat_every_days = num(chase.repeat_every_days, 0, 90, now.repeat_every_days ?? 7);
      if (chase.max_reminders !== undefined) now.max_reminders = num(chase.max_reminders, 1, 20, now.max_reminders ?? 4);
      if (chase.hour !== undefined) now.hour = num(chase.hour, 0, 23, now.hour ?? 9);
      if (chase.minimum_amount !== undefined) now.minimum_amount = Math.max(0, Number(chase.minimum_amount) || 0);
      settings.debt_chasing = now;
    }
    settings.updated_at = new Date();
    settings.updated_by = req.user._id;
    await settings.save();

    return res.status(200).json({
      success: true,
      message: 'SMS settings saved.',
      data: {
        provider: 'arkesel',
        sender_id: next.sender_id || '',
        enabled: next.enabled !== false,
        api_key_set: !!next.api_key,
        api_key_tail: next.api_key ? String(next.api_key).slice(-4) : '',
        debt_chasing: settings.debt_chasing,
      },
    });
  } catch (err) {
    console.error('Update SMS config error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/settings/sms/test — send one message to a number you can check.
 *
 * Worth its own button: a key that is wrong, a sender ID that was never
 * registered and an account with no credit all look identical from the
 * Reminders screen, where the only sign is that nobody replies.
 */
const testSms = async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'Which number should it go to?' });

    const { apiKey, sender } = await smsCredentials();
    const settings = await Settings.findOne().select('company_name').lean();
    const result = await sendSms({
      apiKey,
      sender,
      to,
      message: `Test message from ${settings?.company_name || 'your shop'}. If you are reading this, SMS is working.`,
    });

    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    return res.status(200).json({ success: true, message: `Sent to ${result.to}. Check the phone.` });
  } catch (err) {
    console.error('Test SMS error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** GET /api/settings/sms/balance — credits left, before a run of reminders. */
const getSmsBalance = async (req, res) => {
  try {
    const { apiKey } = await smsCredentials();
    const result = await smsBalance({ apiKey });
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('SMS balance error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/settings/email (Super Admin only)
 */
const updateEmailConfig = async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_email } = req.body;

    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();

    settings.email_config = {
      smtp_host: smtp_host || settings.email_config?.smtp_host,
      smtp_port: smtp_port || settings.email_config?.smtp_port,
      smtp_user: smtp_user || settings.email_config?.smtp_user,
      smtp_pass: smtp_pass || settings.email_config?.smtp_pass,
      from_email: from_email || settings.email_config?.from_email,
    };
    settings.updated_at = new Date();
    settings.updated_by = req.user._id;
    await settings.save();

    return res.status(200).json({ success: true, message: 'Email configuration updated.' });
  } catch (err) {
    console.error('Update email config error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/settings/logo
 */
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    // Push to Cloudinary so the logo survives restarts and redeploys. Storing
    // a /uploads/... path here used to produce a logo that worked until the
    // service next restarted, then 404'd.
    const cloudinary = require('../config/cloudinary');
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: 'ittek/logo', resource_type: 'image', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
          (err, data) => (err ? reject(err) : resolve(data))
        )
        .end(req.file.buffer);
    });

    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();

    settings.logo_url = result.secure_url;
    settings.updated_at = new Date();
    settings.updated_by = req.user._id;
    await settings.save();

    return res.status(200).json({
      success: true,
      message: 'Logo uploaded successfully.',
      data: { logo_url: settings.logo_url },
    });
  } catch (err) {
    console.error('Upload logo error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/settings/clear-data (Super Admin only)
 * Drops all business data but preserves Users and Settings.
 */
const clearAllData = async (req, res) => {
  try {
    const results = {};
    for (const modelPath of CLEARABLE_MODELS) {
      try {
        const Model = require(modelPath);
        const { deletedCount } = await Model.deleteMany({});
        results[Model.modelName] = deletedCount;
      } catch {
        // model may not exist in this env — skip
      }
    }
    console.log('Data cleared by', req.user.username, results);
    return res.status(200).json({ success: true, message: 'All business data cleared.', data: results });
  } catch (err) {
    console.error('Clear data error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getSettings, updateSettings, updateEmailConfig, uploadLogo, clearAllData,
  updateSmsConfig, testSms, getSmsBalance, smsCredentials,
};
