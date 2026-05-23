const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const AuditLog = require('../models/AuditLog');
const { sendPasswordResetEmail } = require('../utils/email');

/**
 * POST /api/auth/login
 * Accept email OR account_number OR staff_id + password
 * Returns JWT token and user data with role.
 */
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { identifier, email, account_number, staff_id, password } = req.body;

    // Support both 'identifier' field and individual fields
    const loginIdentifier = identifier || email || account_number || staff_id;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a login identifier (email, account number, or staff ID) and password.',
      });
    }

    // Build query: match by email, account_number, or staff_id
    const query = {
      $or: [
        { email: loginIdentifier.toLowerCase().trim() },
        { account_number: loginIdentifier.trim() },
        { staff_id: loginIdentifier.trim() },
      ],
    };

    const user = await User.findOne(query).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    // Generate JWT
    const token = user.generateAuthToken();

    // Return user data without password
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      staff_id: user.staff_id,
      account_number: user.account_number,
      is_active: user.is_active,
      created_at: user.created_at,
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: userData,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
};

/**
 * POST /api/auth/logout
 * Clears the token (client-side). Server-side we just confirm.
 */
const logout = async (req, res) => {
  try {
    // Clear cookie if used
    res.clearCookie('token');

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
      data: null,
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during logout.',
    });
  }
};

/**
 * POST /api/auth/forgot-password
 * Generate reset token, save to PasswordReset, send reset email.
 */
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
        data: null,
      });
    }

    // Invalidate any existing reset tokens for this email
    await PasswordReset.updateMany(
      { email: email.toLowerCase().trim(), used: false },
      { used: true }
    );

    // Generate secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Save reset record
    await PasswordReset.create({
      email: email.toLowerCase().trim(),
      token: hashedToken,
      expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    // Build reset URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email.toLowerCase().trim())}`;

    // Send email
    try {
      await sendPasswordResetEmail(email, user.name, resetUrl);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
      // Don't expose email errors to the client
    }

    // Log this action
    await AuditLog.create({
      user_id: user._id,
      action: 'password_reset',
      details: { event: 'password_reset_requested', email: user.email },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
      data: null,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
    });
  }
};

/**
 * POST /api/auth/reset-password
 * Verify token, update password.
 */
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { token, email, password } = req.body;

    if (!token || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token, email, and new password are required.',
      });
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const resetRecord = await PasswordReset.findOne({
      email: email.toLowerCase().trim(),
      token: hashedToken,
      used: false,
      expires_at: { $gt: new Date() },
    });

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token. Please request a new password reset.',
      });
    }

    // Find the user
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Update password (pre-save hook will hash it)
    user.password = password;
    await user.save();

    // Mark token as used
    resetRecord.used = true;
    await resetRecord.save();

    // Log this action
    await AuditLog.create({
      user_id: user._id,
      action: 'password_reset',
      details: { event: 'password_reset_completed', email: user.email },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
      data: null,
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
    });
  }
};

/**
 * POST /api/auth/change-password
 * Authenticated user changes their own password.
 */
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.',
      });
    }

    // Fetch user with password
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(current_password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    // Prevent setting the same password
    const isSame = await user.comparePassword(new_password);
    if (isSame) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password.',
      });
    }

    // Update password
    user.password = new_password;
    await user.save();

    // Log this action
    await AuditLog.create({
      user_id: user._id,
      action: 'password_reset',
      details: { event: 'password_changed_by_user' },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
      data: null,
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
    });
  }
};

module.exports = { login, logout, forgotPassword, resetPassword, changePassword };
