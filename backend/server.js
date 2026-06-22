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

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Render's reverse proxy so rate limiting uses real client IPs
app.set('trust proxy', 1);

// Ensure uploads directory exists
const uploadsPath = path.resolve(process.env.UPLOAD_PATH || './uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// ─── STEP 1: SERVE STATIC FILES FIRST (before CORS/rate-limit) ───────────────
// Vite builds with crossorigin attributes, so assets must be served before
// any CORS middleware that could reject same-site Origin headers.

const frontendBuild = path.join(__dirname, '..', 'frontend', 'dist');

if (process.env.NODE_ENV === 'production' && fs.existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild, { index: false }));
  console.log('Serving frontend from:', frontendBuild);
} else if (process.env.NODE_ENV === 'production') {
  console.warn('WARNING: frontend/dist not found at', frontendBuild);
}

// ─── STEP 2: UPLOADS ──────────────────────────────────────────────────────────

app.use('/uploads', express.static(uploadsPath));

// ─── STEP 3: SECURITY + LOGGING ──────────────────────────────────────────────

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    // HSTS: tell browsers to only use HTTPS for 1 year
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    // CSP disabled — Vite bundles inline module scripts that would be blocked.
    // Re-enable after extracting nonce values from the built index.html.
    contentSecurityPolicy: false,
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── STEP 4: CORS — scoped to /api only ──────────────────────────────────────

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
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use('/api', cors(corsOptions));

// ─── STEP 5: RATE LIMITING — scoped to /api only ────────────────────────────

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again in 15 minutes.' },
});

// Tighter limit on login specifically — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,  // only counts failed/errored requests
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

app.use('/api', limiter);
app.use('/api/auth/login', authLimiter);

// ─── STEP 6: BODY PARSING ─────────────────────────────────────────────────────

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── STEP 7: HEALTH + DEBUG ───────────────────────────────────────────────────

// Debug endpoint — only available outside production
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug', (req, res) => {
    const mongoose = require('mongoose');
    res.json({
      env: {
        NODE_ENV: process.env.NODE_ENV || 'NOT SET',
        JWT_SECRET: process.env.JWT_SECRET ? `SET (${process.env.JWT_SECRET.length} chars)` : 'NOT SET ❌',
        MONGODB_URI: process.env.MONGODB_URI ? 'SET ✓' : 'NOT SET ❌',
        PORT: process.env.PORT || 'NOT SET',
      },
      mongodb: {
        state: mongoose.connection.readyState,
        stateLabel: ['disconnected','connected','connecting','disconnecting'][mongoose.connection.readyState] || 'unknown',
        host: mongoose.connection.host || 'none',
      },
      frontendDist: fs.existsSync(frontendBuild) ? 'EXISTS ✓' : 'MISSING ❌',
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
    },
  });
});

// ─── STEP 8: API ROUTES ───────────────────────────────────────────────────────

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/pos', require('./routes/pos'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/debts', require('./routes/debts'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/stock-requests', require('./routes/stockRequests'));
app.use('/api/credit-agreements', require('./routes/creditAgreements'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/search', require('./routes/search'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/refunds', require('./routes/refunds'));
app.use('/api/upload', require('./routes/upload'));

// ─── STEP 9: REACT ROUTER CATCH-ALL ──────────────────────────────────────────

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
  console.error('Unhandled error:', err.message);

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
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── DEFAULT SUPER ADMIN CREATION ────────────────────────────────────────────

const ensureSuperAdmin = async () => {
  try {
    const User = require('./models/User');
    const Settings = require('./models/Settings');

    // Only create users if they do not already exist — never overwrite existing passwords.
    // Change passwords from the app Settings page or directly in MongoDB.
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
        console.log(`[Seed] Created ${u.username} (${u.role}) — change this password immediately`);
      }
    }

    const LOGO_URL = 'https://scontent.facc6-1.fna.fbcdn.net/v/t39.30808-6/707433689_878908205248703_884185614336842023_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=833d8c&_nc_eui2=AeFyt1HcPt1R704P4NnOWyRTVPWfzO5VOaRU9Z_M7lU5pBHyLj7sHlqT_1FF_m7deTCdYP_FufRNrCkdW0CTsAoh&_nc_ohc=7dBS36QAdfsQ7kNvwFu9j-1&_nc_oc=AdqjCtPP-ztTxvaX_V4r1H0nWBJkQls-BcAY6x80lAaMNd0tZd-Iwicr4AnCtIHKk1E&_nc_zt=23&_nc_ht=scontent.facc6-1.fna&_nc_gid=7TdPVFdjoPaMmMawmSoTAg&_nc_ss=7b2a8&oh=00_Af5OkTLX9drHXsXFsnfCiVik6RgDxXvLN2ufA5IP83pxMQ&oe=6A1B3F34';
    const COMPANY_DEFAULTS = {
      company_name: 'DAN & DOR SOLAR COMPANY LIMITED',
      company_address: 'Bogoso, Western Region',
      company_phone: '+233 598565277',
      company_email: 'Dananddorsolarcompanyltd@gmail.com',
      currency_symbol: 'GHC',
      logo_url: LOGO_URL,
    };
    const settingsExists = await Settings.findOne();
    if (!settingsExists) {
      await Settings.create(COMPANY_DEFAULTS);
    } else {
      // Always sync company defaults on startup
      await Settings.updateOne({}, { $set: COMPANY_DEFAULTS });
    }
  } catch (error) {
    console.error('Super admin init error:', error.message);
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
      const amountPaid = totalPaid;

      await Debt.create({
        credit_agreement_id: agreement._id,
        customer_name: agreement.customer_name,
        customer_phone: agreement.customer_phone,
        amount_owed: amountOwed,
        amount_paid: amountPaid,
        due_date: agreement.end_date || (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d; })(),
        created_by: agreement.created_by,
      });
      created++;
    }

    if (created > 0) console.log(`[Backfill] Created ${created} debt record(s) from existing credit agreements`);
  } catch (err) {
    console.error('[Backfill] Credit agreement debts error:', err.message);
  }
};

const startServer = async () => {
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  ITTEK Solution — DAN & DOR SOLAR`);
    console.log(`  Port: ${PORT} | Env: ${process.env.NODE_ENV || 'development'}`);
    console.log(`========================================\n`);
  });

  try {
    await connectDB();
    await ensureSuperAdmin();
    await backfillCreditAgreementDebts();
    startSchedulers();
  } catch (error) {
    console.error('Startup error:', error.message);
  }
};

process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (error) => { console.error('Uncaught Exception:', error); process.exit(1); });
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

startServer();

module.exports = app;
