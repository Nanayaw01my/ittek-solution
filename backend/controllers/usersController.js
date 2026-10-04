const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/User');
const Category = require('../models/Category');
const { sanitizeGrants } = require('../config/pageAccess');

const { ROLE_LEVELS } = require('../config/pageAccess');

const canManage = (actorRole, targetRole) => {
  const actorLevel = ROLE_LEVELS[actorRole] || 0;
  const targetLevel = ROLE_LEVELS[targetRole] || 0;
  // Super Admin can manage anyone; CEO can manage Manager and Sales only
  if (actorRole === 'Super Admin') return true;
  // A CEO or COO manages the staff below them, never each other.
  if (['CEO', 'COO'].includes(actorRole)) return targetLevel <= 2;
  return false;
};

/**
 * GET /api/users
 */
const getUsers = async (req, res) => {
  try {
    let filter = {};
    // A CEO manages the staff below them, not the other owners. Every role
    // below CEO belongs here — leaving one out hides those people from the
    // only screen that can edit them.
    if (['CEO', 'COO'].includes(req.user.role)) {
      filter.role = { $in: ['Manager', 'Sales', 'Field Agent'] };
    }

    const users = await User.find(filter).populate('created_by', 'username email').sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: users, count: users.length });
  } catch (err) {
    console.error('Get users error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * A staff photo, checked before it is stored.
 *
 * Photos are kept with the user record rather than sent to an image service,
 * so the shop needs no third-party account for them to work. That only holds
 * if what arrives is small: the browser shrinks the file to a 256px square
 * before sending, and this refuses anything that did not.
 *
 * An ordinary http(s) address is still accepted, so photos uploaded through
 * the old image service keep working.
 */
const MAX_AVATAR_CHARS = 400 * 1024;   // ~300KB of image once base64 is undone

const avatarRefusal = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value);

  if (/^https?:\/\//i.test(v)) return null;

  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(v)) {
    return 'That photo could not be read. Choose a JPEG, PNG or WebP image.';
  }
  if (v.length > MAX_AVATAR_CHARS) {
    return 'That photo is too large. Choose a smaller image.';
  }
  return null;
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
    const avatarProblem = avatarRefusal(avatar_url);
    if (avatarProblem) return res.status(400).json({ success: false, message: avatarProblem });
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
    if (avatar_url !== undefined) {
      const problem = avatarRefusal(avatar_url);
      if (problem) return res.status(400).json({ success: false, message: problem });
      // An empty value clears the photo rather than storing an empty string.
      user.avatar_url = avatar_url || undefined;
    }

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


/**
 * Staff badges — issuing, revoking, and the PIN behind one.
 *
 * The code is random rather than counted up: a sequential badge would let
 * anyone holding one guess a colleague's, and a guessed badge signs the
 * wrong person in while the audit log names them for it.
 */
const { badgeLoginAllowed, badgeNeedsPin } = require('../config/badges');
const { mintEan13 } = require('../utils/barcode');

const freeBadgeCode = async (attempts = 12) => {
  for (let i = 0; i < attempts; i += 1) {
    const candidate = mintEan13();
    const taken = await User.findOne({ badge_code: candidate }).select('_id').lean();
    if (!taken) return candidate;
  }
  return null;
};

/**
 * POST /api/users/:id/badge — issue one, or replace the one they have.
 *
 * `badge_code` in the body attaches a card that already exists: a shop that
 * printed its own cards before this screen did can scan each one onto its
 * owner instead of throwing them away and printing the system's numbers.
 * Without it a fresh number is minted as before.
 *
 * Whatever a scanner reads off a card is what gets stored, so the format is
 * left open. Length and character checks only keep out the obvious mistakes —
 * a stray keystroke, a whole line of text pasted in.
 */
const issueBadge = async (req, res) => {
  try {
    // badge_pin is select:false, and it has to be read to tell "this agent
    // already has a code" from "this agent has none yet".
    const user = await User.findById(req.params.id).select('+badge_pin');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const supplied = String(req.body?.badge_code || '').trim();
    let code;

    if (supplied) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._\-]{3,31}$/.test(supplied)) {
        return res.status(400).json({
          success: false,
          message: 'A card number is 4 to 32 letters or digits. Scan the card again.',
        });
      }
      // One card, one person. Two people on the same number means the system
      // cannot say who did anything, which is the whole point of a badge.
      const taken = await User.findOne({ badge_code: supplied, _id: { $ne: user._id } })
        .select('username').lean();
      if (taken) {
        return res.status(409).json({
          success: false,
          message: `That card is already ${taken.username}'s. Scan a different one.`,
        });
      }
      code = supplied;
    } else {
      code = await freeBadgeCode();
      if (!code) {
        return res.status(503).json({ success: false, message: 'Could not find a free badge number. Try again.' });
      }
    }

    user.badge_code = code;
    user.badge_active = true;
    user.badge_issued_at = new Date();

    // A role that needs a PIN cannot be left without one, or the badge would
    // be worth more than it should be until somebody remembered.
    const pin = String(req.body?.pin || '').trim();
    if (badgeNeedsPin(user.role)) {
      if (pin) {
        if (!/^\d{4}$/.test(pin)) {
          return res.status(400).json({ success: false, message: 'A code must be 4 digits.' });
        }
        user.badge_pin = pin;
      } else if (!user.badge_pin) {
        // Named so the screen can send them straight to where a code is set,
        // rather than leaving a scan box saying something it cannot fix.
        return res.status(400).json({
          success: false,
          code: 'pin_required',
          message: `A ${user.role} needs a 4-digit code with their card. Set one now.`,
        });
      }
      // Already has one — swapping the card does not change the code.
    } else if (pin) {
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ success: false, message: 'A code must be 4 digits.' });
      }
      user.badge_pin = pin;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: `Badge issued to ${user.username}.`,
      data: {
        username: user.username,
        role: user.role,
        badge_code: user.badge_code,
        needs_pin: badgeNeedsPin(user.role),
      },
    });
  } catch (err) {
    console.error('Issue badge error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not issue it: ${err.message}` });
  }
};

/**
 * GET /api/users/badge/:code
 *
 * Whose card is this? For the scanning station on the Users page, where a
 * freshly printed stack is checked against the people it was made for, and
 * where a card found on the floor is identified.
 *
 * A lookup, not a sign-in: it tells an owner who is already signed in what a
 * card belongs to, and hands back nothing that would let anybody use it.
 */
const identifyBadge = async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ success: false, message: 'Nothing was scanned.' });

    const user = await User.findOne({ badge_code: code })
      .select('username role avatar_url is_active badge_code badge_active badge_issued_at')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `No badge here carries ${code}. It may belong to another shop, or have been reissued.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: String(user._id),
        username: user.username,
        role: user.role,
        avatar_url: user.avatar_url || '',
        badge_code: user.badge_code,
        // Revoked, or the account itself switched off — both mean the card
        // is dead, and the station should say which.
        badge_active: user.badge_active !== false,
        account_active: user.is_active !== false,
        badge_issued_at: user.badge_issued_at || null,
        login_allowed: badgeLoginAllowed(user.role),
        needs_pin: badgeNeedsPin(user.role),
      },
    });
  } catch (err) {
    console.error('Identify badge error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/users/badge-cards[?id=]
 *
 * The cards themselves, to print and cut out. One person with ?id, or
 * everybody who has a badge.
 */
const getBadgeCards = async (req, res) => {
  try {
    const { modules: eanModules } = require('../utils/ean13');
    const { generateBadgeCards } = require('../utils/pdfGenerator');
    const Settings = require('../models/Settings');

    const filter = { badge_code: { $exists: true, $ne: null }, badge_active: { $ne: false } };
    if (req.query.id) filter._id = req.query.id;

    const people = await User.find(filter)
      .select('username role badge_code')
      .sort({ role: 1, username: 1 })
      .lean();

    const settings = await Settings.findOne().lean();
    const pdf = await generateBadgeCards({
      staff: people.map((p) => ({
        username: p.username,
        role: p.role,
        badge_code: p.badge_code,
        bits: eanModules(p.badge_code),
        needs_pin: badgeNeedsPin(p.role),
        login_allowed: badgeLoginAllowed(p.role),
      })),
      logoUrl: settings?.logo_url || null,
      company: { name: settings?.company_name },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="staff-badges.pdf"');
    res.setHeader('X-Badge-Count', String(people.length));
    return res.send(pdf);
  } catch (err) {
    console.error('Badge cards error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: 'Could not build the cards.' });
  }
};

/** DELETE /api/users/:id/badge — the card in their pocket stops working. */
const revokeBadge = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!user.badge_code) {
      return res.status(400).json({ success: false, message: `${user.username} has no badge.` });
    }

    // Cleared rather than merely switched off, so the number can never be
    // brought back by turning a flag over.
    user.badge_code = undefined;
    user.badge_active = false;
    user.badge_pin = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `${user.username}'s badge no longer works.`,
      data: { username: user.username },
    });
  } catch (err) {
    console.error('Revoke badge error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  issueBadge,
  revokeBadge,
  identifyBadge,
  getBadgeCards, getUsers, createUser, getUser, updateUser, deleteUser, toggleActive, resetPassword };
