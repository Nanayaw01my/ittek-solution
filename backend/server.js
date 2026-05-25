require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

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
    contentSecurityPolicy: false,
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── STEP 4: CORS — scoped to /api only ──────────────────────────────────────

const allowedOrigins = [
  process.env.FRONTEND_URL,
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

app.use('/api', limiter);

// ─── STEP 6: BODY PARSING ─────────────────────────────────────────────────────

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ─── STEP 7: HEALTH CHECK ─────────────────────────────────────────────────────

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

    const adminExists = await User.findOne({ role: 'Super Admin' });
    if (!adminExists) {
      await User.create({
        username: 'superadmin',
        email: 'admin@dandorsolar.com',
        password: 'Admin@123',
        role: 'Super Admin',
        is_active: true,
      });
      console.log('Default Super Admin created: admin@dandorsolar.com / Admin@123');
    }

    const settingsExists = await Settings.findOne();
    if (!settingsExists) {
      await Settings.create({
        company_name: 'DAN & DOR SOLAR COMPANY LIMITED',
        currency_symbol: 'GH₵',
      });
    }
  } catch (error) {
    console.error('Super admin init error:', error.message);
  }
};

// ─── SERVER START ─────────────────────────────────────────────────────────────

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
