require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const connectDB = require('./config/db');
const { startSchedulers } = require('./utils/scheduler');
const logger = require('./utils/logger');
const requestId = require('./middleware/requestId');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Render's reverse proxy so rate limiting uses real client IPs
app.set('trust proxy', 1);

// Ensure uploads directory exists
const uploadsPath = path.resolve(process.env.UPLOAD_PATH || './uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// ─── STEP 1: REQUEST ID (must be first so all logs carry the ID) ─────────────
app.use(requestId);

// ─── STEP 2: SERVE STATIC FILES ───────────────────────────────────────────────
const frontendBuild = path.join(__dirname, '..', 'frontend', 'dist');

if (process.env.NODE_ENV === 'production' && fs.existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild, { index: false }));
  logger.info('Serving frontend from:', { path: frontendBuild });
} else if (process.env.NODE_ENV === 'production') {
  logger.warn('frontend/dist not found', { path: frontendBuild });
}

// ─── STEP 3: UPLOADS ──────────────────────────────────────────────────────────
app.use('/uploads', express.static(uploadsPath));

// ─── STEP 4: SECURITY ─────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    contentSecurityPolicy: false, // Vite inline module scripts need this off
  })
);

// ─── STEP 5: HTTP REQUEST LOGGING ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  const morganFormat = process.env.NODE_ENV === 'production'
    ? ':remote-addr :method :url :status :res[content-length] :response-time ms :req[x-request-id]'
    : 'dev';
  app.use(morgan(morganFormat));
}

// ─── STEP 6: CORS ─────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://dandorsolar.online',
  'https://www.dandorsolar.online',
  'https://ittek-solution-1.onrender.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8081',
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked', { origin });
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
};

app.use('/api', cors(corsOptions));

// ─── STEP 7: RATE LIMITING ────────────────────────────────────────────────────
// Helper to build a limiter with consistent options
const makeLimit = (windowMs, max, message, skipSuccessful = false) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: skipSuccessful,
    message: { success: false, message },
    handler: (req, res, next, options) => {
      logger.warn('Rate limit hit', { ip: req.ip, path: req.path, reqId: req.requestId });
      res.status(429).json(options.message);
    },
  });

// Tiers (all per-IP):
// strict  — auth endpoints, password resets
// tight   — file uploads, backups, PDF exports
// standard — general API reads/writes
// heavy   — bulk operations (reports, search)

const strictLimiter   = makeLimit(15 * 60 * 1000,  10,  'Too many attempts. Try again in 15 minutes.', true);
const tightLimiter    = makeLimit(15 * 60 * 1000,  30,  'Too many requests. Try again in 15 minutes.');
const standardLimiter = makeLimit(15 * 60 * 1000,  200, 'Too many requests. Try again in 15 minutes.');
const heavyLimiter    = makeLimit(60 * 60 * 1000,  60,  'Too many bulk requests. Try again in 1 hour.');

// Global API limit (safety net)
app.use('/api', standardLimiter);

// Route-specific tighter limits applied before routes are mounted
app.use('/api/auth/login',    strictLimiter);
app.use('/api/auth/register', strictLimiter);
app.use('/api/upload',        tightLimiter);
app.use('/api/backup',        tightLimiter);
app.use('/api/credit-agreements/:id/pdf', tightLimiter);
app.use('/api/reports',       heavyLimiter);
app.use('/api/search',        heavyLimiter);

// ─── STEP 8: BODY PARSING ─────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── STEP 9: HEALTH + DEBUG ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug', (req, res) => {
    const mongoose = require('mongoose');
    res.json({
      env: {
        NODE_ENV: process.env.NODE_ENV || 'NOT SET',
        JWT_SECRET: process.env.JWT_SECRET ? `SET (${process.env.JWT_SECRET.length} chars)` : 'NOT SET',
        MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'NOT SET',
        PORT: process.env.PORT || 'NOT SET',
      },
      mongodb: {
        state: mongoose.connection.readyState,
        stateLabel: ['disconnected','connected','connecting','disconnecting'][mongoose.connection.readyState] || 'unknown',
        host: mongoose.connection.host || 'none',
      },
      request_id: req.requestId,
      frontendDist: fs.existsSync(frontendBuild) ? 'EXISTS' : 'MISSING',
    });
  });
}

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ITTEK Solution API is running.',
    data: {
      company: 'DAN & DOR SOLAR COMPANY LIMITED',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      request_id: req.requestId,
    },
  });
});

// ─── STEP 10: API ROUTES ──────────────────────────────────────────────────────
app.use('/api/auth',              require('./routes/auth'));
app.use('/api/users',             require('./routes/users'));
app.use('/api/products',          require('./routes/products'));
app.use('/api/categories',        require('./routes/categories'));
app.use('/api/suppliers',         require('./routes/suppliers'));
app.use('/api/pos',               require('./routes/pos'));
app.use('/api/expenses',          require('./routes/expenses'));
app.use('/api/debts',             require('./routes/debts'));
app.use('/api/workers',           require('./routes/workers'));
app.use('/api/purchases',         require('./routes/purchases'));
app.use('/api/stock-requests',    require('./routes/stockRequests'));
app.use('/api/credit-agreements', require('./routes/creditAgreements'));
app.use('/api/financial',         require('./routes/financial'));
app.use('/api/reports',           require('./routes/reports'));
app.use('/api/search',            require('./routes/search'));
app.use('/api/backup',            require('./routes/backup'));
app.use('/api/settings',          require('./routes/settings'));
app.use('/api/notifications',     require('./routes/notifications'));
app.use('/api/audit-logs',        require('./routes/auditLogs'));
app.use('/api/sync',              require('./routes/sync'));
app.use('/api/refunds',           require('./routes/refunds'));
app.use('/api/upload',            require('./routes/upload'));

// ─── STEP 11: REACT ROUTER CATCH-ALL ─────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const indexPath = path.join(frontendBuild, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(503).send('Frontend not built. Run: npm --prefix frontend run build');
    }
  });
}

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path, reqId: req.requestId });

  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: 'Validation error.', errors: messages });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `Duplicate value: ${field} already exists.` });
  }
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired.' });
  }

  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error.',
    request_id: req.requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── SEED: DEFAULT USERS + SETTINGS ──────────────────────────────────────────
const ensureSuperAdmin = async () => {
  try {
    const User = require('./models/User');
    const Settings = require('./models/Settings');

    const demoUsers = [
      { username: 'superadmin', email: 'admin@dandorsolar.com',    password: 'Admin@123',   role: 'Super Admin' },
      { username: 'ceo',        email: 'ceo@dandorsolar.com',       password: 'CEO@123',     role: 'CEO' },
      { username: 'manager',    email: 'manager@dandorsolar.com',   password: 'Manager@123', role: 'Manager' },
      { username: 'sales1',     email: 'sales1@dandorsolar.com',    password: 'Sales@123',   role: 'Sales' },
    ];

    for (const u of demoUsers) {
      const exists = await User.findOne({ username: u.username });
      if (!exists) {
        const hashed = await bcrypt.hash(u.password, 12);
        await User.create({ username: u.username, email: u.email, password: hashed, role: u.role, is_active: true });
        logger.info('Seed: user created', { username: u.username, role: u.role });
      }
    }

    const settingsExists = await Settings.findOne();
    if (!settingsExists) {
      await Settings.create({
        company_name: 'DAN & DOR SOLAR COMPANY LIMITED',
        company_address: 'Bogoso, Western Region',
        company_phone: '+233 598565277',
        company_email: 'Dananddorsolarcompanyltd@gmail.com',
        currency_symbol: 'GHC',
      });
      logger.info('Seed: default settings created');
    }
  } catch (error) {
    logger.error('Seed error', { error: error.message });
  }
};

// ─── BACKFILL: credit agreements → debt records ───────────────────────────────
const backfillCreditAgreementDebts = async () => {
  try {
    const CreditAgreement = require('./models/CreditAgreement');
    const Debt = require('./models/Debt');

    const agreements = await CreditAgreement.find({ status: { $ne: 'completed' } });
    let created = 0;

    for (const agreement of agreements) {
      const existing = await Debt.findOne({ credit_agreement_id: agreement._id });
      if (existing) continue;

      const totalPaid = agreement.payments.reduce((sum, p) => sum + p.amount, 0);
      const amountOwed = Math.max(0.01, (agreement.remaining || agreement.total_amount) - 0);

      await Debt.create({
        credit_agreement_id: agreement._id,
        customer_name: agreement.customer_name,
        customer_phone: agreement.customer_phone,
        amount_owed: amountOwed,
        amount_paid: totalPaid,
        due_date: agreement.end_date || (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d; })(),
        created_by: agreement.created_by,
      });
      created++;
    }

    if (created > 0) logger.info('Backfill: debt records created', { count: created });
  } catch (err) {
    logger.error('Backfill error', { error: err.message });
  }
};

const startServer = async () => {
  app.listen(PORT, () => {
    logger.info('Server started', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });

  try {
    await connectDB();
    await ensureSuperAdmin();
    await backfillCreditAgreementDebts();
    startSchedulers();
  } catch (error) {
    logger.error('Startup error', { error: error.message });
  }
};

process.on('unhandledRejection', (reason) => logger.error('Unhandled Rejection', { reason: String(reason) }));
process.on('uncaughtException',  (error)  => { logger.error('Uncaught Exception', { error: error.message }); process.exit(1); });
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));

startServer();

module.exports = app;
