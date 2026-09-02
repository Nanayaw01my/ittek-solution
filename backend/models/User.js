const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * Email is optional, so its uniqueness has to be stated carefully.
 *
 * A plain unique index counts a missing field as null and treats every such
 * document as holding the same value — so the first user without an email is
 * accepted and the second is rejected as a duplicate. That is what "Username
 * or email already exists" was: not a name clash at all, just a second user
 * created without an email address.
 *
 * `sparse` fixes the missing case but not a stored null, and it does not
 * rebuild an index that already exists in the database. A partial index is the
 * exact statement of the rule: only documents whose email is actually a string
 * are indexed, and among those it must be unique.
 */
const EMAIL_INDEX_NAME = 'email_unique_when_set';
const EMAIL_PARTIAL_FILTER = { email: { $type: 'string' } };

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [50, 'Username cannot exceed 50 characters'],
    },
    email: {
      // Optional. Uniqueness is declared as a partial index below rather than
      // here — see the note on that index.
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['Super Admin', 'CEO', 'Manager', 'Sales'],
      required: [true, 'Role is required'],
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    last_login: {
      type: Date,
    },
    last_ip: {
      type: String,
    },
    avatar_url: {
      type: String,
    },
    /**
     * Product categories a Manager has been put in charge of by the CEO or
     * Super Admin. A Manager may add new products to these categories, and the
     * Products page shows them nothing outside this list.
     *
     * Empty means no product-management rights at all — not "everything", so
     * an unassigned Manager cannot quietly gain access to the whole catalogue.
     * Ignored for Super Admin, CEO and Sales.
     */
    assigned_categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    /**
     * Screens this user has been given access to beyond what their role
     * already opens, as page id -> mode (see backend/config/pageAccess.js).
     * e.g. { products: 'inventory' } lets a Sales user add products and fix
     * stock counts without ever seeing a price.
     *
     * Only ever widens access — a grant cannot remove what the role allows.
     */
    page_access: {
      type: Map,
      of: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT
UserSchema.methods.generateJWT = function () {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set. Add it in Render → Environment.');
  return jwt.sign(
    { id: this._id, username: this.username, email: this.email, role: this.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );
};

UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: EMAIL_PARTIAL_FILTER, name: EMAIL_INDEX_NAME },
);

const User = mongoose.model('User', UserSchema);

/**
 * Replace an older email index with the partial one.
 *
 * Changing the schema does not touch an index the database already has, so a
 * deployment that once created a plain or sparse unique index keeps it — and
 * keeps refusing the second user without an email. Run once at startup.
 */
User.ensureEmailIndex = async () => {
  const coll = User.collection;
  const existing = await coll.indexes();
  const emailIndex = existing.find((i) => i.key && i.key.email === 1 && Object.keys(i.key).length === 1);

  const alreadyRight = emailIndex
    && emailIndex.unique
    && JSON.stringify(emailIndex.partialFilterExpression || null) === JSON.stringify(EMAIL_PARTIAL_FILTER);
  if (alreadyRight) return { changed: false };

  if (emailIndex) await coll.dropIndex(emailIndex.name);
  await coll.createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: EMAIL_PARTIAL_FILTER, name: EMAIL_INDEX_NAME },
  );
  return { changed: true, replaced: emailIndex?.name || null };
};

module.exports = User;
