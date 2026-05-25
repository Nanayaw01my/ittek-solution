const Settings = require('../models/Settings');
const multer = require('multer');
const path = require('path');

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
      currency_symbol, notification_settings,
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

    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();

    settings.logo_url = `/uploads/${req.file.filename}`;
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

module.exports = { getSettings, updateSettings, updateEmailConfig, uploadLogo };
