const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Device = require('../models/Device');
const InstallmentPlan = require('../models/InstallmentPlan');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const { generateStaffId } = require('../utils/accountGenerator');
const { lockDevice: mdmLock, unlockDevice: mdmUnlock } = require('../utils/simpleMDM');

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

/**
 * GET /api/admin/dashboard
 * Returns aggregate stats: counts, revenue, recent transactions.
 */
const getDashboard = async (req, res) => {
  try {
    const [
      totalStaff,
      totalCustomers,
      totalDevices,
      overduePayments,
      lockedPhones,
      activeInstallmentPlans,
      recentTransactions,
      totalRevenue,
      monthlyRevenue,
    ] = await Promise.all([
      User.countDocuments({ role: 'staff', is_active: true }),
      Customer.countDocuments(),
      Device.countDocuments(),
      InstallmentPlan.countDocuments({ status: 'defaulted' }),
      Device.countDocuments({ lock_status: 'locked' }),
      InstallmentPlan.countDocuments({ status: 'active' }),
      Payment.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate({ path: 'customer_id', select: 'full_name email' })
        .populate({ path: 'installment_plan_id', select: 'device_id' })
        .lean(),
      Payment.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const totalRevenueAmount = totalRevenue[0]?.total || 0;
    const monthlyRevenueAmount = monthlyRevenue[0]?.total || 0;

    return res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved.',
      data: {
        stats: {
          totalStaff,
          totalCustomers,
          totalDevices,
          overduePayments,
          lockedPhones,
          activeInstallmentPlans,
          totalRevenue: totalRevenueAmount,
          monthlyRevenue: monthlyRevenueAmount,
        },
        recentTransactions,
      },
    });
  } catch (error) {
    console.error('Admin getDashboard error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/customers
 * Paginated list with search and filter.
 */
const getCustomers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const { search, region } = req.query;

    const filter = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      // Find user IDs matching email or account_number
      const matchingUsers = await User.find({
        $or: [
          { email: searchRegex },
          { account_number: searchRegex },
          { phone: searchRegex },
        ],
      }).select('_id');

      const userIds = matchingUsers.map((u) => u._id);

      filter.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { ghana_card_id: searchRegex },
        { user_id: { $in: userIds } },
      ];
    }

    if (region) {
      filter['location.region'] = new RegExp(region, 'i');
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .populate({ path: 'user_id', select: 'account_number email is_active' })
        .populate({ path: 'created_by', select: 'name email staff_id' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Customers retrieved.',
      data: {
        customers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Admin getCustomers error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/admin/customers/:id
 * Full customer detail with plan, payments, device.
 */
const getCustomerDetail = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate({ path: 'user_id', select: '-password' })
      .populate({ path: 'created_by', select: 'name email staff_id' })
      .lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const [plan, payments] = await Promise.all([
      InstallmentPlan.findOne({ customer_id: customer._id })
        .populate({ path: 'device_id', select: 'model price serial_number udid imei lock_status' })
        .lean(),
      Payment.find({ customer_id: customer._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Customer detail retrieved.',
      data: { customer, plan, payments },
    });
  } catch (error) {
    console.error('Admin getCustomerDetail error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/admin/customers/:id
 */
const updateCustomer = async (req, res) => {
  try {
    const allowedFields = [
      'full_name', 'phone', 'ghana_card_id', 'occupation',
      'income', 'location', 'guarantor', 'photos',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate({ path: 'user_id', select: '-password' });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    await AuditLog.create({
      user_id: req.user._id,
      action: 'customer_updated',
      target_user_id: customer.user_id,
      details: { customer_id: customer._id, updated_fields: Object.keys(updates) },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Customer updated successfully.',
      data: { customer },
    });
  } catch (error) {
    console.error('Admin updateCustomer error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/admin/customers/:id
 */
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const userId = customer.user_id;

    // Soft-delete: deactivate the user account
    await User.findByIdAndUpdate(userId, { is_active: false });

    await AuditLog.create({
      user_id: req.user._id,
      action: 'customer_deleted',
      target_user_id: userId,
      details: { customer_id: customer._id, customer_name: customer.full_name },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Customer account deactivated successfully.',
      data: null,
    });
  } catch (error) {
    console.error('Admin deleteCustomer error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── STAFF ────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/staff
 */
const getStaff = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = { role: 'staff' };
    if (req.query.search) {
      const r = new RegExp(req.query.search, 'i');
      filter.$or = [{ name: r }, { email: r }, { staff_id: r }];
    }
    if (req.query.is_active !== undefined) {
      filter.is_active = req.query.is_active === 'true';
    }

    const [staff, total] = await Promise.all([
      User.find(filter).select('-password').sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    // Enrich with customer count
    const enriched = await Promise.all(
      staff.map(async (s) => {
        const customerCount = await Customer.countDocuments({ created_by: s._id });
        return { ...s, customer_count: customerCount };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Staff list retrieved.',
      data: {
        staff: enriched,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Admin getStaff error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/admin/staff
 * Create a new staff member.
 */
const addStaff = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { name, email, password, phone } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email is already in use.' });
    }

    const staffId = await generateStaffId();

    const newStaff = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone?.trim(),
      role: 'staff',
      staff_id: staffId,
    });

    await AuditLog.create({
      user_id: req.user._id,
      action: 'staff_added',
      target_user_id: newStaff._id,
      details: { staff_id: staffId, name: newStaff.name, email: newStaff.email },
      ip_address: req.ip,
    });

    const staffData = await User.findById(newStaff._id).select('-password');

    return res.status(201).json({
      success: true,
      message: 'Staff member created successfully.',
      data: { staff: staffData },
    });
  } catch (error) {
    console.error('Admin addStaff error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/admin/staff/:id
 */
const updateStaff = async (req, res) => {
  try {
    const allowedFields = ['name', 'phone', 'is_active'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // Don't allow changing role or email via this endpoint
    const staffMember = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'staff' },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!staffMember) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    await AuditLog.create({
      user_id: req.user._id,
      action: 'staff_updated',
      target_user_id: staffMember._id,
      details: { updated_fields: Object.keys(updates) },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Staff member updated.',
      data: { staff: staffMember },
    });
  } catch (error) {
    console.error('Admin updateStaff error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/admin/staff/:id
 * Soft delete - set is_active=false.
 */
const deleteStaff = async (req, res) => {
  try {
    const staffMember = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'staff' },
      { is_active: false },
      { new: true }
    ).select('-password');

    if (!staffMember) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    await AuditLog.create({
      user_id: req.user._id,
      action: 'staff_deleted',
      target_user_id: staffMember._id,
      details: { name: staffMember.name, email: staffMember.email },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Staff member deactivated successfully.',
      data: null,
    });
  } catch (error) {
    console.error('Admin deleteStaff error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── DEVICES ──────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/devices
 */
const getDevices = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.sold_status) filter.sold_status = req.query.sold_status;
    if (req.query.lock_status) filter.lock_status = req.query.lock_status;
    if (req.query.search) {
      const r = new RegExp(req.query.search, 'i');
      filter.$or = [{ model: r }, { serial_number: r }, { udid: r }, { imei: r }];
    }

    const [devices, total] = await Promise.all([
      Device.find(filter)
        .populate({
          path: 'assigned_to',
          select: 'full_name phone email',
          populate: { path: 'user_id', select: 'account_number' },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Device.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Devices retrieved.',
      data: {
        devices,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Admin getDevices error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/admin/devices
 */
const addDevice = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { model, price, serial_number, udid, imei } = req.body;

    const device = await Device.create({ model, price, serial_number, udid, imei });

    await AuditLog.create({
      user_id: req.user._id,
      action: 'device_added',
      device_udid: udid,
      details: { model, price, serial_number, device_id: device._id },
      ip_address: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: 'Device added successfully.',
      data: { device },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A device with that serial number or UDID already exists.' });
    }
    console.error('Admin addDevice error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/admin/devices/:id
 */
const updateDevice = async (req, res) => {
  try {
    const allowedFields = ['model', 'price', 'serial_number', 'udid', 'imei'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const device = await Device.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    await AuditLog.create({
      user_id: req.user._id,
      action: 'device_updated',
      device_udid: device.udid,
      details: { device_id: device._id, updated_fields: Object.keys(updates) },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Device updated.',
      data: { device },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A device with that serial number or UDID already exists.' });
    }
    console.error('Admin updateDevice error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/admin/devices/:id
 */
const deleteDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    if (device.sold_status === 'sold') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a device that is currently sold/assigned to a customer.',
      });
    }

    await Device.findByIdAndDelete(req.params.id);

    await AuditLog.create({
      user_id: req.user._id,
      action: 'device_deleted',
      device_udid: device.udid,
      details: { model: device.model, serial_number: device.serial_number },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Device deleted successfully.',
      data: null,
    });
  } catch (error) {
    console.error('Admin deleteDevice error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/admin/devices/:id/lock
 */
const lockDeviceHandler = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    if (!device.udid) {
      return res.status(400).json({ success: false, message: 'Device has no UDID. Cannot lock via MDM.' });
    }

    if (device.lock_status === 'locked') {
      return res.status(400).json({ success: false, message: 'Device is already locked.' });
    }

    // Call SimpleMDM
    let mdmResult = null;
    try {
      mdmResult = await mdmLock(device.udid);
    } catch (mdmError) {
      console.error('MDM lock error:', mdmError.message);
      // Continue with local update even if MDM fails
    }

    // Update local status
    device.lock_status = 'locked';
    await device.save();

    await AuditLog.create({
      user_id: req.user._id,
      action: 'device_lock',
      device_udid: device.udid,
      details: {
        device_id: device._id,
        model: device.model,
        reason: req.body.reason || 'Manual lock by admin',
        mdm_result: mdmResult,
      },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Device locked successfully.',
      data: { device },
    });
  } catch (error) {
    console.error('Admin lockDevice error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/admin/devices/:id/unlock
 */
const unlockDeviceHandler = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    if (!device.udid) {
      return res.status(400).json({ success: false, message: 'Device has no UDID. Cannot unlock via MDM.' });
    }

    if (device.lock_status === 'unlocked') {
      return res.status(400).json({ success: false, message: 'Device is already unlocked.' });
    }

    // Call SimpleMDM
    let mdmResult = null;
    try {
      mdmResult = await mdmUnlock(device.udid);
    } catch (mdmError) {
      console.error('MDM unlock error:', mdmError.message);
    }

    device.lock_status = 'unlocked';
    await device.save();

    await AuditLog.create({
      user_id: req.user._id,
      action: 'device_unlock',
      device_udid: device.udid,
      details: {
        device_id: device._id,
        model: device.model,
        reason: req.body.reason || 'Manual unlock by admin',
        mdm_result: mdmResult,
      },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Device unlocked successfully.',
      data: { device },
    });
  } catch (error) {
    console.error('Admin unlockDevice error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/transactions
 */
const getTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.payment_method) filter.payment_method = req.query.payment_method;
    if (req.query.from_date || req.query.to_date) {
      filter.payment_date = {};
      if (req.query.from_date) filter.payment_date.$gte = new Date(req.query.from_date);
      if (req.query.to_date) filter.payment_date.$lte = new Date(req.query.to_date);
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate({ path: 'customer_id', select: 'full_name email phone' })
        .populate({ path: 'installment_plan_id', select: 'device_id frequency' })
        .populate({ path: 'recorded_by', select: 'name email role' })
        .sort({ payment_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Transactions retrieved.',
      data: {
        payments,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Admin getTransactions error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── REPORTS ──────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/reports
 * Aggregate data for daily/weekly/monthly reports.
 */
const getReports = async (req, res) => {
  try {
    const { period = 'monthly', year, month } = req.query;
    const now = new Date();
    let startDate, endDate, groupBy;

    if (period === 'daily') {
      // Last 30 days
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      endDate = now;
      groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$payment_date' } };
    } else if (period === 'weekly') {
      // Last 12 weeks
      startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
      endDate = now;
      groupBy = {
        $concat: [
          { $toString: { $isoWeekYear: '$payment_date' } },
          '-W',
          { $toString: { $isoWeek: '$payment_date' } },
        ],
      };
    } else {
      // Monthly: last 12 months
      startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      endDate = now;
      groupBy = { $dateToString: { format: '%Y-%m', date: '$payment_date' } };
    }

    const [revenueData, paymentMethodSplit, newCustomers, deviceStats] = await Promise.all([
      Payment.aggregate([
        { $match: { payment_date: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: groupBy,
            total_revenue: { $sum: '$amount' },
            transaction_count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        { $match: { payment_date: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: '$payment_method',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Customer.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: period === 'daily' ? '%Y-%m-%d' : '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Device.aggregate([
        {
          $group: {
            _id: '$sold_status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalRevenue = revenueData.reduce((sum, r) => sum + r.total_revenue, 0);
    const totalTransactions = revenueData.reduce((sum, r) => sum + r.transaction_count, 0);

    return res.status(200).json({
      success: true,
      message: 'Reports retrieved.',
      data: {
        period,
        summary: {
          totalRevenue,
          totalTransactions,
          avgTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
        },
        revenueData,
        paymentMethodSplit,
        newCustomers,
        deviceStats,
      },
    });
  } catch (error) {
    console.error('Admin getReports error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit-logs
 */
const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.user_id) filter.user_id = req.query.user_id;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate({ path: 'user_id', select: 'name email role' })
        .populate({ path: 'target_user_id', select: 'name email role account_number staff_id' })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Audit logs retrieved.',
      data: {
        logs,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Admin getAuditLogs error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── RESET CUSTOMER PASSWORD ──────────────────────────────────────────────────

/**
 * POST /api/admin/reset-customer-password/:id
 * Admin resets a customer's password directly.
 */
const resetCustomerPassword = async (req, res) => {
  try {
    const { new_password } = req.body;

    if (!new_password) {
      return res.status(400).json({ success: false, message: 'New password is required.' });
    }

    // Customers have max 5 char passwords
    if (new_password.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Customer password must be at most 5 characters.',
      });
    }

    // Find the customer to get their user_id
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const user = await User.findById(customer.user_id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer user account not found.' });
    }

    user.password = new_password;
    await user.save();

    await AuditLog.create({
      user_id: req.user._id,
      action: 'password_reset',
      target_user_id: user._id,
      details: { event: 'admin_reset_customer_password', customer_id: customer._id },
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Customer password reset successfully.',
      data: null,
    });
  } catch (error) {
    console.error('Admin resetCustomerPassword error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

// In-memory settings store (in production, persist to DB or config file)
let appSettings = {
  business_name: 'Tritech Hub iOS',
  contact_email: 'support@tritech.com',
  contact_phone: '',
  lock_grace_period_hours: 48,
  installment_frequencies: ['daily', 'weekly', 'monthly'],
  currency: 'GHS',
};

const getSettings = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Settings retrieved.',
      data: { settings: appSettings },
    });
  } catch (error) {
    console.error('Admin getSettings error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const updateSettings = async (req, res) => {
  try {
    const allowedKeys = Object.keys(appSettings);
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        appSettings[key] = req.body[key];
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Settings updated.',
      data: { settings: appSettings },
    });
  } catch (error) {
    console.error('Admin updateSettings error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getDashboard,
  getCustomers,
  getCustomerDetail,
  updateCustomer,
  deleteCustomer,
  getStaff,
  addStaff,
  updateStaff,
  deleteStaff,
  getDevices,
  addDevice,
  updateDevice,
  deleteDevice,
  lockDevice: lockDeviceHandler,
  unlockDevice: unlockDeviceHandler,
  getTransactions,
  getReports,
  getAuditLogs,
  resetCustomerPassword,
  getSettings,
  updateSettings,
};
