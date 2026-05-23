require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const connectDB = require('./config/db');
const { startScheduler } = require('./utils/scheduler');

// ─── APP SETUP ───────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 5000;

// ─── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────

// Helmet: sets various HTTP security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow serving uploaded files
  })
);

// CORS: allow requests from the frontend URL
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8081',
    ].filter(Boolean);

    // Allow any *.onrender.com subdomain (Render deployments)
    const isRender = origin && /^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin);

    if (!origin || isRender || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy does not allow origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(cors(corsOptions));

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again in 15 minutes.',
  },
  skip: (req) => {
    // Skip rate limiting for webhook endpoint (Paystack needs to send many events)
    return req.path.startsWith('/api/webhooks/');
  },
});
app.use(limiter);

// ─── REQUEST PARSING ──────────────────────────────────────────────────────────

// Parse JSON — needed for webhook signature verification (raw body access)
// We store the raw body for webhook signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// ─── LOGGING ─────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── STATIC FILES ─────────────────────────────────────────────────────────────

// Serve uploaded files (photos, documents)
const uploadsPath = path.resolve(process.env.UPLOAD_PATH || './uploads');
app.use('/uploads', express.static(uploadsPath));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Tritech Hub iOS API is running.',
    data: {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    },
  });
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/webhooks', require('./routes/webhook'));

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Handle CORS errors
  if (err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({
      success: false,
      message: 'Not allowed by CORS policy.',
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error.',
      errors: messages,
    });
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `Duplicate value: ${field} already exists.`,
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired.' });
  }

  // Generic error
  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── SEED DATA ────────────────────────────────────────────────────────────────

/**
 * Seed the database with default admin, staff, and sample devices on first run.
 */
const seedDatabase = async () => {
  try {
    const User = require('./models/User');
    const Device = require('./models/Device');

    // ── Seed Admin ──
    const adminExists = await User.findOne({ email: 'admin@tritech.com' });
    if (!adminExists) {
      await User.create({
        name: 'Tritech Admin',
        email: 'admin@tritech.com',
        password: 'admin123',
        role: 'admin',
        is_active: true,
      });
      console.log('✓ Default admin created: admin@tritech.com / admin123');
    }

    // ── Seed Staff ──
    const staffExists = await User.findOne({ email: 'staff@tritech.com' });
    if (!staffExists) {
      await User.create({
        name: 'Tritech Staff',
        email: 'staff@tritech.com',
        password: 'staff123',
        role: 'staff',
        staff_id: 'Tri001',
        is_active: true,
      });
      console.log('✓ Default staff created: staff@tritech.com / staff123');
    }

    // ── Seed Sample Devices ──
    const deviceCount = await Device.countDocuments();
    if (deviceCount === 0) {
      const sampleDevices = [
        {
          model: 'iPhone 14 Pro Max 256GB Space Black',
          price: 6500,
          serial_number: 'C02XG3XKJGH5',
          udid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          imei: '352001234567890',
          lock_status: 'unlocked',
          sold_status: 'available',
        },
        {
          model: 'iPhone 14 Pro 128GB Silver',
          price: 5800,
          serial_number: 'C02YH4YLKHI6',
          udid: 'b2c3d4e5-f6a7-8901-bcde-f01234567891',
          imei: '352001234567891',
          lock_status: 'unlocked',
          sold_status: 'available',
        },
        {
          model: 'iPhone 13 256GB Midnight',
          price: 4500,
          serial_number: 'C02ZI5ZMLIJ7',
          udid: 'c3d4e5f6-a7b8-9012-cdef-012345678902',
          imei: '352001234567892',
          lock_status: 'unlocked',
          sold_status: 'available',
        },
        {
          model: 'iPhone 13 Pro Max 512GB Sierra Blue',
          price: 7200,
          serial_number: 'C02AJ6ANMJK8',
          udid: 'd4e5f6a7-b8c9-0123-def0-123456789013',
          imei: '352001234567893',
          lock_status: 'unlocked',
          sold_status: 'available',
        },
        {
          model: 'iPhone 12 128GB Product Red',
          price: 3200,
          serial_number: 'C02BK7BONKL9',
          udid: 'e5f6a7b8-c9d0-1234-ef01-234567890124',
          imei: '352001234567894',
          lock_status: 'unlocked',
          sold_status: 'available',
        },
        {
          model: 'iPhone 15 Pro 256GB Natural Titanium',
          price: 8500,
          serial_number: 'C02CL8CPOLM0',
          udid: 'f6a7b8c9-d0e1-2345-f012-345678901235',
          imei: '352001234567895',
          lock_status: 'unlocked',
          sold_status: 'available',
        },
      ];

      await Device.insertMany(sampleDevices);
      console.log(`✓ ${sampleDevices.length} sample iPhone devices seeded.`);
    }

    console.log('Database seed complete.');
  } catch (error) {
    console.error('Database seed error:', error.message);
    // Non-fatal: continue starting server even if seeding fails
  }
};

// ─── SERVER START ─────────────────────────────────────────────────────────────

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Seed default data
    await seedDatabase();

    // Start scheduled jobs (overdue payment checker)
    startScheduler();

    // Start the HTTP server
    app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  Tritech Hub iOS API`);
      console.log(`  Server running on port ${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Health: http://localhost:${PORT}/health`);
      console.log(`========================================\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

startServer();

module.exports = app; // Export for testing
