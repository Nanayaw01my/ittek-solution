const { validationResult } = require('express-validator');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Device = require('../models/Device');
const InstallmentPlan = require('../models/InstallmentPlan');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const { generateAccountNumber } = require('../utils/accountGenerator');
const { initializePayment } = require('../utils/paystack');
const { v4: uuidv4 } = require('uuid');

/**
 * Calculate the installment schedule array given a start date, frequency, and total payments.
 * Returns an array of { due_date, amount, paid: false, payment_id: null }
 */
const buildSchedule = (startDate, frequency, totalPayments, installmentAmount) => {
  const schedule = [];
  let currentDate = new Date(startDate);

  for (let i = 0; i < totalPayments; i++) {
    // Calculate this payment's due date
    let dueDate;
    if (i === 0) {
      dueDate = new Date(currentDate);
    } else {
      dueDate = new Date(schedule[i - 1].due_date);
      if (frequency === 'daily') {
        dueDate.setDate(dueDate.getDate() + 1);
      } else if (frequency === 'weekly') {
        dueDate.setDate(dueDate.getDate() + 7);
      } else {
        // monthly
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
    }

    schedule.push({
      due_date: dueDate,
      amount: installmentAmount,
      paid: false,
      payment_id: null,
    });
  }

  return schedule;
};

/**
 * Calculate the end date of the plan based on frequency and total payments.
 */
const calculateEndDate = (startDate, frequency, totalPayments) => {
  const endDate = new Date(startDate);
  if (frequency === 'daily') {
    endDate.setDate(endDate.getDate() + (totalPayments - 1));
  } else if (frequency === 'weekly') {
    endDate.setDate(endDate.getDate() + (totalPayments - 1) * 7);
  } else {
    endDate.setMonth(endDate.getMonth() + (totalPayments - 1));
  }
  return endDate;
};

/**
 * GET /api/staff/customers
 * List customers created by this staff member.
 */
const getMyCustomers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const { search } = req.query;

    const filter = { created_by: req.user._id };

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const matchingUsers = await User.find({
        $or: [{ email: searchRegex }, { account_number: searchRegex }, { phone: searchRegex }],
      }).select('_id');

      const userIds = matchingUsers.map((u) => u._id);

      filter.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { ghana_card_id: searchRegex },
        { user_id: { $in: userIds } },
      ];

      // Remove created_by from filter.$or check — we keep it via filter.created_by
      // Actually we need to combine: created_by AND ($or search)
      const createdByFilter = { created_by: req.user._id };
      delete filter.$or;
      Object.assign(filter, createdByFilter);
      filter.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { ghana_card_id: searchRegex },
        { user_id: { $in: userIds } },
      ];
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .populate({ path: 'user_id', select: 'account_number email is_active' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    // Enrich with active plan status
    const enriched = await Promise.all(
      customers.map(async (c) => {
        const plan = await InstallmentPlan.findOne(
          { customer_id: c._id },
          { status: 1, next_due_date: 1, remaining_balance: 1 }
        ).lean();
        return { ...c, installment_plan: plan };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Customers retrieved.',
      data: {
        customers: enriched,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Staff getMyCustomers error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/staff/customers
 * Full customer registration flow.
 */
const addCustomer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const {
      // User / Account
      full_name,
      email,
      phone,
      password,
      // Customer info
      ghana_card_id,
      occupation,
      income,
      location,
      guarantor,
      // Device & Plan
      device_id,
      down_payment,
      frequency,
    } = req.body;

    // --- 1. Validate password length (max 5 chars) ---
    if (!password || password.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Customer password must be between 1 and 5 characters.',
      });
    }

    // --- 2. Check device availability ---
    const device = await Device.findById(device_id);
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }
    if (device.sold_status !== 'available') {
      return res.status(400).json({ success: false, message: 'Device is not available for sale.' });
    }

    // --- 3. Check email uniqueness ---
    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    // --- 4. Generate account number ---
    const accountNumber = await generateAccountNumber();

    // --- 5. Create User account ---
    const newUser = await User.create({
      name: full_name.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone?.trim(),
      role: 'customer',
      account_number: accountNumber,
    });

    // --- 6. Handle uploaded photos ---
    const photos = {};
    if (req.files) {
      if (req.files.ghana_card_front?.[0]) photos.ghana_card_front = req.files.ghana_card_front[0].path;
      if (req.files.ghana_card_back?.[0]) photos.ghana_card_back = req.files.ghana_card_back[0].path;
      if (req.files.customer_photo?.[0]) photos.customer_photo = req.files.customer_photo[0].path;
      if (req.files.guarantor_photo?.[0]) photos.guarantor_photo = req.files.guarantor_photo[0].path;
    }

    let proof_of_income = null;
    if (req.files?.proof_of_income?.[0]) {
      proof_of_income = req.files.proof_of_income[0].path;
    }

    // --- 7. Create Customer record ---
    const newCustomer = await Customer.create({
      user_id: newUser._id,
      full_name: full_name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      ghana_card_id,
      photos,
      occupation,
      income: income || { amount: 0, source: '' },
      location: location || {},
      guarantor: guarantor || {},
      proof_of_income,
      created_by: req.user._id,
    });

    // --- 8. Calculate installment plan ---
    const downPaymentAmount = parseFloat(down_payment) || 0;
    const totalPrice = device.price;
    const remainingBalance = totalPrice - downPaymentAmount;

    if (remainingBalance < 0) {
      // Rollback user creation
      await User.findByIdAndDelete(newUser._id);
      await Customer.findByIdAndDelete(newCustomer._id);
      return res.status(400).json({
        success: false,
        message: 'Down payment cannot exceed device price.',
      });
    }

    // Determine total payments by frequency
    const frequencyPaymentsMap = { daily: 180, weekly: 26, monthly: 6 };
    const totalPayments = frequencyPaymentsMap[frequency] || 6;

    // Calculate installment amount (round to 2 decimal places)
    const installmentAmount = Math.ceil((remainingBalance / totalPayments) * 100) / 100;

    // Start date is today; first payment is due today
    const startDate = new Date();
    const nextDueDate = new Date(startDate);
    const endDate = calculateEndDate(startDate, frequency, totalPayments);

    // Generate payment schedule
    const schedule = buildSchedule(startDate, frequency, totalPayments, installmentAmount);

    // --- 9. Create InstallmentPlan ---
    const plan = await InstallmentPlan.create({
      customer_id: newCustomer._id,
      device_id: device._id,
      created_by: req.user._id,
      down_payment: downPaymentAmount,
      total_price: totalPrice,
      remaining_balance: remainingBalance,
      installment_amount: installmentAmount,
      frequency,
      total_payments: totalPayments,
      payments_made: 0,
      start_date: startDate,
      next_due_date: nextDueDate,
      end_date: endDate,
      status: 'active',
      schedule,
    });

    // --- 10. Update device status ---
    await Device.findByIdAndUpdate(device._id, {
      sold_status: 'sold',
      assigned_to: newCustomer._id,
    });

    // --- 11. Create audit log ---
    await AuditLog.create({
      user_id: req.user._id,
      action: 'customer_registered',
      target_user_id: newUser._id,
      details: {
        customer_id: newCustomer._id,
        account_number: accountNumber,
        device_id: device._id,
        device_model: device.model,
        plan_id: plan._id,
        down_payment: downPaymentAmount,
        total_price: totalPrice,
        frequency,
      },
      ip_address: req.ip,
    });

    // --- 12. Return full data ---
    const populatedCustomer = await Customer.findById(newCustomer._id)
      .populate({ path: 'user_id', select: '-password' })
      .lean();

    const populatedPlan = await InstallmentPlan.findById(plan._id)
      .populate({ path: 'device_id' })
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Customer registered successfully.',
      data: {
        customer: populatedCustomer,
        user: {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          account_number: accountNumber,
          role: newUser.role,
        },
        installment_plan: populatedPlan,
      },
    });
  } catch (error) {
    console.error('Staff addCustomer error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate entry: email or account number already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/staff/customers/:id
 * Full customer detail for a customer created by this staff member (or admin).
 */
const getCustomerDetail = async (req, res) => {
  try {
    const filter = { _id: req.params.id };

    // Staff can only view their own customers; admin can view all
    if (req.user.role === 'staff') {
      filter.created_by = req.user._id;
    }

    const customer = await Customer.findOne(filter)
      .populate({ path: 'user_id', select: '-password' })
      .populate({ path: 'created_by', select: 'name email staff_id' })
      .lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found or access denied.' });
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
    console.error('Staff getCustomerDetail error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/staff/customers/:id/payments
 * Payment history for a customer.
 */
const getCustomerPayments = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === 'staff') filter.created_by = req.user._id;

    const customer = await Customer.findOne(filter).lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found or access denied.' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      Payment.find({ customer_id: customer._id })
        .sort({ payment_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments({ customer_id: customer._id }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Customer payments retrieved.',
      data: {
        payments,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Staff getCustomerPayments error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/staff/customers/:id/payment
 * Initialize Paystack payment on behalf of a customer.
 */
const makePaymentForCustomer = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === 'staff') filter.created_by = req.user._id;

    const customer = await Customer.findOne(filter)
      .populate({ path: 'user_id', select: 'email account_number' })
      .lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found or access denied.' });
    }

    const plan = await InstallmentPlan.findOne({ customer_id: customer._id, status: 'active' })
      .populate({ path: 'device_id', select: 'model' })
      .lean();

    if (!plan) {
      return res.status(404).json({ success: false, message: 'No active installment plan found for this customer.' });
    }

    if (plan.remaining_balance <= 0) {
      return res.status(400).json({ success: false, message: 'Installment plan is already fully paid.' });
    }

    const amountToPay = req.body.amount || plan.installment_amount;
    const reference = `TH-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const callbackUrl = `${frontendUrl}/payment/verify?reference=${reference}`;

    const paystackResponse = await initializePayment({
      email: customer.email || customer.user_id?.email,
      amount: amountToPay,
      reference,
      callback_url: callbackUrl,
      metadata: {
        customer_id: customer._id.toString(),
        customer_name: customer.full_name,
        account_number: customer.user_id?.account_number,
        plan_id: plan._id.toString(),
        device_model: plan.device_id?.model,
        initiated_by: req.user._id.toString(),
        initiated_by_role: req.user.role,
      },
    });

    if (!paystackResponse.status) {
      return res.status(502).json({ success: false, message: 'Failed to initialize payment with Paystack.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment initialized. Redirect customer to authorization URL.',
      data: {
        authorization_url: paystackResponse.data.authorization_url,
        reference,
        amount: amountToPay,
        customer: {
          name: customer.full_name,
          email: customer.email,
          account_number: customer.user_id?.account_number,
        },
      },
    });
  } catch (error) {
    console.error('Staff makePaymentForCustomer error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getMyCustomers,
  addCustomer,
  getCustomerDetail,
  getCustomerPayments,
  makePaymentForCustomer,
};
