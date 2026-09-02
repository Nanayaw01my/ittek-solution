const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/User');
const Category = require('../models/Category');
const { sanitizeGrants } = require('../config/pageAccess');

const ROLE_LEVELS = { 'Super Admin': 4, CEO: 3, Manager: 2, Sales: 1 };

const canManage = (actorRole, targetRole) => {
  const actorLevel = ROLE_LEVELS[actorRole] || 0;
  const targetLevel = ROLE_LEVELS[targetRole] || 0;
  // Super Admin can manage anyone; CEO can manage Manager and Sales only
  if (actorRole === 'Super Admin') return true;
  if (actorRole === 'CEO') return targetLevel <= 2; // Manager=2, Sales=1
  return false;
};

/**
 * GET /api/users
 */
const getUsers = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'CEO') {
      filter.role = { $in: ['Manager', 'Sales'] };
    }

    const users = await User.find(filter).populate('created_by', 'username email').sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: users, count: users.length });
  } catch (err) {
    console.error('Get users error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * Name the field the database rejected, and its value where there is one.
 *
 * "Username or email already exists" sent people hunting for a clash that was
 * not there — the real cause was an index treating two users with no email as
 * the same user. An error about a unique field should say which field.
 */
const duplicateMessage = (err) => {
  const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
  const value = (err.keyValue || {})[field];
  const label = field === 'username' ? 'That username'
    : field === 'email' ? 'That email address'
    : 'That value';
  return value ? `${label} (${value}) is already taken.` : `${label} is already taken.`;
};

/**
 * POST /api/users
 */
const createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { username, email, password, role, assigned_categories, page_access } = req.body;
    const normalUsername = username.trim().toLowerCase();
    const normalEmail = email ? email.trim().toLowerCase() : null;

    if (!canManage(req.user.role, role)) {
      return res.status(403).json({ success: false, message: 'You cannot create a user with that role.' });
    }

    const orClauses = [{ username: normalUsername }];
    if (normalEmail) orClauses.push({ email: normalEmail });
    const existing = await User.findOne({ $or: orClauses });
    if (existing) {
      const field = existing.username === normalUsername ? 'Username' : 'Email';
      return res.status(409).json({ success: false, message: `${field} is already taken.` });
    }

    // Product categories a new Manager is being put in charge of. Validated
    // the same way as on update, and ignored for any other role.
    let categoryIds = [];
    if (Array.isArray(assigned_categories)) {
      categoryIds = assigned_categories.filter((id) => mongoose.isValidObjectId(id));
      const found = await Category.countDocuments({ _id: { $in: categoryIds } });
      if (found !== categoryIds.length) {
        return res.status(400).json({ success: false, message: 'One of those categories no longer exists.' });
      }
    }

    const { avatar_url } = req.body;
    const user = await User.create({
      username: normalUsername,
      ...(normalEmail ? { email: normalEmail } : {}),
      password,
      role,
      created_by: req.user._id,
      ...(avatar_url ? { avatar_url } : {}),
      ...(categoryIds.length ? { assigned_categories: categoryIds } : {}),
      // Screens this user may reach beyond what their role opens.
      ...(page_access ? { page_access: sanitizeGrants(page_access) } : {}),
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Create user error:', err.message);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: duplicateMessage(err) });
    }
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/users/:id
 */
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('created_by', 'username email');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!canManage(req.user.role, user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error('Get user error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/users/:id
 */
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!canManage(req.user.role, user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { username, email, role, avatar_url, assigned_categories, page_access } = req.body;

    if (role && !canManage(req.user.role, role)) {
      return res.status(403).json({ success: false, message: 'Cannot assign that role.' });
    }

    if (username) user.username = username;

    // Email is optional and clearable. Sending it empty removes it, and the
    // field is unset rather than stored as an empty string: an empty string is
    // a value like any other, so two users holding one would collide on the
    // uniqueness rule exactly as two nulls used to.
    if (email !== undefined) {
      const trimmed = String(email).trim();
      if (trimmed) {
        user.email = trimmed.toLowerCase();
      } else {
        user.email = undefined;
        user.markModified('email');
      }
    }

    if (role) user.role = role;
    if (avatar_url !== undefined) user.avatar_url = avatar_url;

    // Which product categories this Manager may add products to. Sent as an
    // array of category ids; an empty array withdraws the assignment entirely.
    if (Array.isArray(assigned_categories)) {
      const ids = assigned_categories.filter((id) => mongoose.isValidObjectId(id));
      const found = await Category.countDocuments({ _id: { $in: ids } });
      if (found !== ids.length) {
        return res.status(400).json({ success: false, message: 'One of those categories no longer exists.' });
      }
      user.assigned_categories = ids;
    }

    // Page grants. Replaces the whole set, so removing a page is just leaving
    // it out. Only a Super Admin or CEO reaches this route at all.
    if (page_access && typeof page_access === 'object') {
      user.page_access = sanitizeGrants(page_access);
    }

    await user.save();
    return res.status(200).json({ success: true, message: 'User updated.', data: user });
  } catch (err) {
    console.error('Update user error:', err.message);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: duplicateMessage(err) });
    }
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/users/:id
 */
const deleteUser = async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!canManage(req.user.role, user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await User.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'User deleted.' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/users/:id/toggle-active
 */
const toggleActive = async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!canManage(req.user.role, user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    user.is_active = !user.is_active;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User ${user.is_active ? 'activated' : 'deactivated'} successfully.`,
      data: { is_active: user.is_active },
    });
  } catch (err) {
    console.error('Toggle active error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/users/:id/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!canManage(req.user.role, user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    user.password = new_password;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getUsers, createUser, getUser, updateUser, deleteUser, toggleActive, resetPassword };
