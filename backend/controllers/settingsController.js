const Settings = require('../models/Settings');
const multer = require('multer');
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
    return res.status(200).json({ success: true, data: settings });
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
      base_currency, currencies, loyalty_settings, fraud_settings,
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

module.exports = { getSettings, updateSettings, updateEmailConfig, uploadLogo, clearAllData };
