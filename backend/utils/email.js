const nodemailer = require('nodemailer');
const EmailQueue = require('../models/EmailQueue');
const Settings = require('../models/Settings');

/**
 * The mail account, from Settings first and the server's variables second.
 *
 * Settings has an Email Config tab that writes smtp_host, smtp_user and the
 * rest into the database — and nothing read them. The transporter was built
 * from environment variables alone, so everything typed into that tab was
 * ignored, and the only way to set up mail was a Render deploy. That is also
 * how a shop ends up with a backup that is made every night and posted
 * nowhere.
 *
 * Settings wins where it is filled in, because the person who owns the
 * mailbox should be able to paste the details in without a deploy. The
 * environment stays as the fallback so existing deployments keep working.
 */
const mailAccount = async () => {
  let saved = {};
  try {
    // Leaf paths only. Asking for email_config and email_config.smtp_pass
    // together is a path collision, which mongo rejects outright.
    const doc = await Settings.findOne()
      .select('email_config.smtp_host email_config.smtp_port email_config.smtp_user '
        + 'email_config.from_email +email_config.smtp_pass')
      .lean();
    saved = doc?.email_config || {};
  } catch (err) {
    // No database, or none saved. The environment may still carry it.
    console.error('[Email] Could not read the saved mail settings:', err.message);
  }

  const host = saved.smtp_host || process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = Number(saved.smtp_port) || parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = saved.smtp_user || process.env.EMAIL_USER;
  const pass = saved.smtp_pass || process.env.EMAIL_PASS;
  const from = saved.from_email || process.env.EMAIL_FROM || `ITTEK Solution <${user}>`;

  return { host, port, user, pass, from, source: saved.smtp_user ? 'settings' : 'server' };
};

/**
 * Create and return a configured nodemailer transporter.
 */
const createTransporter = async () => {
  const { host, port, user, pass } = await mailAccount();

  if (!user || !pass) {
    // Said plainly. Without this nodemailer attempts an unauthenticated
    // connection and fails much later with something about a socket, which
    // sends whoever reads it looking for a network fault that is not there.
    throw new Error('No mail account is set. Fill in Settings → Email Config, or set '
      + 'EMAIL_USER and EMAIL_PASS on the server.');
  }

  return nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS. Sending 465 as plain
    // is a connection that hangs until it times out.
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * Queue an email to the EmailQueue collection.
 * @param {Object} options - { to, toName, subject, html, priority }
 */
const queueEmail = async ({ to, toName = '', subject, html, priority = 'normal' }) => {
  try {
    await EmailQueue.create({
      to_email: to,
      to_name: toName,
      subject,
      body: html,
      priority,
      status: 'pending',
    });
  } catch (err) {
    console.error('Failed to queue email:', err.message);
  }
};

/**
 * Send an email directly (bypassing queue).
 * @param {Object} options - { to, subject, html, attachments }
 */
const sendEmail = async ({ to, subject, html, attachments }) => {
  const account = await mailAccount();
  const transporter = await createTransporter();
  const mailOptions = {
    from: account.from,
    to,
    subject,
    html,
    // A nightly backup is only a backup once it is somewhere other than the
    // machine it came from, and email is the one place this shop already has.
    ...(attachments?.length ? { attachments } : {}),
  };
  const info = await transporter.sendMail(mailOptions);
  console.log(`Email sent to ${to}: ${info.messageId}`);
  return info;
};

/**
 * Process pending emails from the queue (max 3 retries).
 */
const processEmailQueue = async () => {
  try {
    const pending = await EmailQueue.find({ status: 'pending', retry_count: { $lt: 3 } })
      .sort({ priority: -1, created_at: 1 })
      .limit(20);

    if (pending.length === 0) return;

    const account = await mailAccount();
    const transporter = await createTransporter();

    for (const email of pending) {
      try {
        await transporter.sendMail({
          from: account.from,
          to: email.to_email,
          subject: email.subject,
          html: email.body,
        });

        email.status = 'sent';
        email.sent_at = new Date();
        await email.save();
        console.log(`[EmailQueue] Sent email to ${email.to_email}`);
      } catch (err) {
        email.retry_count += 1;
        email.error_message = err.message;
        if (email.retry_count >= 3) {
          email.status = 'failed';
        }
        await email.save();
        console.error(`[EmailQueue] Failed to send to ${email.to_email}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('[EmailQueue] Process error:', err.message);
  }
};

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────────────────

const saleSummary = (saleData) => {
  const { invoice_no, customer_name, total_amount, items, user } = saleData;
  const itemRows = (items || []).map(
    (i) => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>GH₵${i.unit_price.toFixed(2)}</td><td>GH₵${i.total.toFixed(2)}</td></tr>`
  ).join('');
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #2c7a2c;">Sale Completed - ${invoice_no}</h2>
      <p>A new sale has been processed by <strong>${user || 'staff'}</strong>.</p>
      <p><strong>Customer:</strong> ${customer_name || 'Walk-in'}</p>
      <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse;">
        <tr style="background:#f0f0f0;"><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
        ${itemRows}
      </table>
      <p style="font-size:18px;"><strong>Total: GH₵${Number(total_amount).toFixed(2)}</strong></p>
    </div>`;
};

const debtCreated = (debtData) => {
  const { customer_name, amount_owed, due_date } = debtData;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #cc4400;">New Debt Created</h2>
      <p><strong>Customer:</strong> ${customer_name}</p>
      <p><strong>Amount Owed:</strong> GH₵${Number(amount_owed).toFixed(2)}</p>
      <p><strong>Due Date:</strong> ${new Date(due_date).toLocaleDateString('en-GH')}</p>
    </div>`;
};

const debtPayment = (paymentData) => {
  const { customer_name, amount_paid, remaining } = paymentData;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #2c7a2c;">Debt Payment Received</h2>
      <p><strong>Customer:</strong> ${customer_name}</p>
      <p><strong>Amount Paid:</strong> GH₵${Number(amount_paid).toFixed(2)}</p>
      <p><strong>Remaining Balance:</strong> GH₵${Number(remaining).toFixed(2)}</p>
    </div>`;
};

const stockAlert = (productData) => {
  const { name, quantity, low_stock_level } = productData;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #cc4400;">Low Stock Alert</h2>
      <p>Product <strong>${name}</strong> is running low.</p>
      <p><strong>Current Stock:</strong> ${quantity} units</p>
      <p><strong>Low Stock Level:</strong> ${low_stock_level} units</p>
      <p>Please restock immediately.</p>
    </div>`;
};

const dailySummary = (statsData) => {
  const { date, total_sales, total_revenue, total_expenses, net_profit, sales_count } = statsData;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #1a5276;">Daily Summary - ${date}</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse;">
        <tr><td><strong>Total Sales</strong></td><td>${sales_count || 0} transactions</td></tr>
        <tr><td><strong>Total Revenue</strong></td><td>GH₵${Number(total_revenue || 0).toFixed(2)}</td></tr>
        <tr><td><strong>Total Expenses</strong></td><td>GH₵${Number(total_expenses || 0).toFixed(2)}</td></tr>
        <tr><td><strong>Net Profit</strong></td><td>GH₵${Number(net_profit || 0).toFixed(2)}</td></tr>
      </table>
    </div>`;
};

const userWelcome = (userData) => {
  const { username, email, role, password } = userData;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #1a5276;">Welcome to ITTEK Solution</h2>
      <p>Hello <strong>${username}</strong>,</p>
      <p>Your account has been created successfully.</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Role:</strong> ${role}</p>
      ${password ? `<p><strong>Temporary Password:</strong> ${password}</p><p>Please change your password on first login.</p>` : ''}
      <p>Company: DAN &amp; DOR SOLAR COMPANY LIMITED</p>
    </div>`;
};

const lowStockAlert = (products) => {
  const rows = products.map(
    (p) => `<tr><td>${p.name}</td><td>${p.quantity}</td><td>${p.low_stock_level}</td></tr>`
  ).join('');
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #cc4400;">Low Stock Report</h2>
      <p>The following products need restocking:</p>
      <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse;">
        <tr style="background:#f0f0f0;"><th>Product</th><th>Current Stock</th><th>Min Level</th></tr>
        ${rows}
      </table>
    </div>`;
};

module.exports = {
  createTransporter,
  mailAccount,
  sendEmail,
  queueEmail,
  processEmailQueue,
  templates: {
    saleSummary,
    debtCreated,
    debtPayment,
    stockAlert,
    dailySummary,
    userWelcome,
    lowStockAlert,
  },
};
