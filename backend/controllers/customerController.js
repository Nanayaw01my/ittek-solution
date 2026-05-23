const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Payment = require('../models/Payment');
const Device = require('../models/Device');
const { initializePayment } = require('../utils/paystack');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/customer/dashboard
 * Returns: plan, device, next payment, payment history, lock status, progress %.
 */
const getDashboard = async (req, res) => {
  try {
    // Find the Customer record linked to this user
    const customer = await Customer.findOne({ user_id: req.user._id }).lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found.',
      });
    }

    // Get active installment plan with device details
    const plan = await InstallmentPlan.findOne({ customer_id: customer._id })
      .populate({
        path: 'device_id',
        select: 'model price serial_number udid imei lock_status',
      })
      .lean();

    // Get recent payment history (last 5)
    const recentPayments = await Payment.find({ customer_id: customer._id })
      .sort({ payment_date: -1 })
      .limit(5)
      .lean();

    // Calculate progress percentage
    let progressPercentage = 0;
    let nextPayment = null;
    let device = null;
    let lockStatus = 'unlocked';

    if (plan) {
      device = plan.device_id;
      lockStatus = device?.lock_status || 'unlocked';

      if (plan.total_payments > 0) {
        progressPercentage = Math.round((plan.payments_made / plan.total_payments) * 100);
      }

      // Find next unpaid schedule item
      if (plan.schedule && plan.schedule.length > 0) {
        const nextUnpaid = plan.schedule.find((s) => !s.paid);
        if (nextUnpaid) {
          nextPayment = {
            due_date: nextUnpaid.due_date,
            amount: nextUnpaid.amount,
          };
        }
      } else {
        nextPayment = {
          due_date: plan.next_due_date,
          amount: plan.installment_amount,
        };
      }
    }

    // Compute total paid amount
    const totalPaidResult = await Payment.aggregate([
      { $match: { customer_id: customer._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalPaid = totalPaidResult[0]?.total || 0;

    return res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved.',
      data: {
        customer: {
          _id: customer._id,
          full_name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          account_number: req.user.account_number,
        },
        plan,
        device,
        lock_status: lockStatus,
        next_payment: nextPayment,
        recent_payments: recentPayments,
        progress: {
          percentage: progressPercentage,
          payments_made: plan?.payments_made || 0,
          total_payments: plan?.total_payments || 0,
          total_paid: totalPaid,
          remaining_balance: plan?.remaining_balance || 0,
        },
      },
    });
  } catch (error) {
    console.error('Customer getDashboard error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/customer/payments
 * Full payment history for the logged-in customer.
 */
const getPayments = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user_id: req.user._id }).lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer profile not found.' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
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
      message: 'Payment history retrieved.',
      data: {
        payments,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Customer getPayments error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/customer/payment
 * Initialize a Paystack payment for the customer.
 */
const makePayment = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user_id: req.user._id }).lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer profile not found.' });
    }

    const plan = await InstallmentPlan.findOne({
      customer_id: customer._id,
      status: 'active',
    })
      .populate({ path: 'device_id', select: 'model' })
      .lean();

    if (!plan) {
      return res.status(404).json({ success: false, message: 'No active installment plan found.' });
    }

    if (plan.remaining_balance <= 0) {
      return res.status(400).json({ success: false, message: 'Your installment plan is already fully paid.' });
    }

    const amountToPay = req.body.amount || plan.installment_amount;

    if (amountToPay <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    // Generate unique reference
    const reference = `TH-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const callbackUrl = `${frontendUrl}/payment/verify?reference=${reference}`;

    const paystackResponse = await initializePayment({
      email: req.user.email,
      amount: amountToPay,
      reference,
      callback_url: callbackUrl,
      metadata: {
        customer_id: customer._id.toString(),
        customer_name: customer.full_name,
        account_number: req.user.account_number,
        plan_id: plan._id.toString(),
        device_model: plan.device_id?.model,
        initiated_by: req.user._id.toString(),
        initiated_by_role: 'customer',
      },
    });

    if (!paystackResponse.status) {
      return res.status(502).json({ success: false, message: 'Failed to initialize payment.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment initialized. Redirect to authorization URL to complete payment.',
      data: {
        authorization_url: paystackResponse.data.authorization_url,
        reference,
        amount: amountToPay,
        access_code: paystackResponse.data.access_code,
      },
    });
  } catch (error) {
    console.error('Customer makePayment error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/customer/profile
 * Customer profile with photos.
 */
const getProfile = async (req, res) => {
  try {
    const customer = await Customer.findOne({ user_id: req.user._id })
      .populate({ path: 'user_id', select: '-password' })
      .lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer profile not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved.',
      data: { customer },
    });
  } catch (error) {
    console.error('Customer getProfile error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getDashboard, getPayments, makePayment, getProfile };
