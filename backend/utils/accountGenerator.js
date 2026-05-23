const User = require('../models/User');

/**
 * Generate a unique account number in format TRI + year + 5-digit-zero-padded number
 * Example: TRI202400001
 */
const generateAccountNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `TRI${year}`;

  // Find all account numbers starting with current year prefix, sorted descending
  const lastUser = await User.findOne(
    { account_number: { $regex: `^${prefix}` } },
    { account_number: 1 },
    { sort: { account_number: -1 } }
  );

  let sequence = 1;

  if (lastUser && lastUser.account_number) {
    // Extract the numeric suffix
    const numericPart = lastUser.account_number.replace(prefix, '');
    const lastNumber = parseInt(numericPart, 10);
    if (!isNaN(lastNumber)) {
      sequence = lastNumber + 1;
    }
  }

  // Zero-pad to 5 digits
  const paddedSequence = String(sequence).padStart(5, '0');
  const accountNumber = `${prefix}${paddedSequence}`;

  // Safety check: ensure uniqueness
  const existing = await User.findOne({ account_number: accountNumber });
  if (existing) {
    // If collision, try next number
    sequence++;
    const nextPadded = String(sequence).padStart(5, '0');
    return `${prefix}${nextPadded}`;
  }

  return accountNumber;
};

/**
 * Generate a unique staff ID in format Tri001, Tri002, etc.
 */
const generateStaffId = async () => {
  const prefix = 'Tri';

  // Find the last staff ID sorted in descending order
  const lastUser = await User.findOne(
    { staff_id: { $regex: `^${prefix}\\d+$` } },
    { staff_id: 1 },
    { sort: { staff_id: -1 } }
  );

  let sequence = 1;

  if (lastUser && lastUser.staff_id) {
    const numericPart = lastUser.staff_id.replace(prefix, '');
    const lastNumber = parseInt(numericPart, 10);
    if (!isNaN(lastNumber)) {
      sequence = lastNumber + 1;
    }
  }

  // Zero-pad to at least 3 digits
  const paddedSequence = String(sequence).padStart(3, '0');
  const staffId = `${prefix}${paddedSequence}`;

  // Safety check: ensure uniqueness
  const existing = await User.findOne({ staff_id: staffId });
  if (existing) {
    sequence++;
    const nextPadded = String(sequence).padStart(3, '0');
    return `${prefix}${nextPadded}`;
  }

  return staffId;
};

module.exports = { generateAccountNumber, generateStaffId };
