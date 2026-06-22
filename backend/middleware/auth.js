const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const authenticate = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      logger.warn('Auth: no token', { ip: req.ip, path: req.path, reqId: req.requestId });
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      logger.warn('Auth: invalid token', { ip: req.ip, path: req.path, err: err.name, reqId: req.requestId });
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token has expired. Please log in again.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      logger.warn('Auth: user not found', { userId: decoded.id, reqId: req.requestId });
      return res.status(401).json({ success: false, message: 'Invalid token. User not found.' });
    }

    if (!user.is_active) {
      logger.warn('Auth: deactivated account', { username: user.username, reqId: req.requestId });
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact an administrator.' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error: error.message, reqId: req.requestId });
    return res.status(500).json({ success: false, message: 'Authentication error.' });
  }
};

// Role-based access control — call after authenticate
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (!roles.includes(req.user.role)) {
    logger.warn('Authorize: access denied', { username: req.user.username, role: req.user.role, required: roles, reqId: req.requestId });
    return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
  }
  next();
};

module.exports = { authenticate, authorize };
