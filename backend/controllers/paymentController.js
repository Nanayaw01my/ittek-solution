const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Payment = require('../models/Payment');
const Device = require('../models/Device');
const AuditLog = require('../models/AuditLog');
const { initializePayment, verifyPayment } = require('../utils/paystack');
const { unlockDevice: mdmUnlock } = require('../utils/simpleMDM');
const { sendPaymentConfirmationEmail } = require('../utils/email');

/**
 * Helper: Process a successful payment (used by both verify endpoint and webhook).
 * - Creates Payment record
 * - Updates InstallmentPlan (balance, payments_made, next_due_date, status)
 * - Marks schedule item as paid
 * - Unlocks device if plan is completed
 * - Creates audit log
 * - Sends confirmation email
 */
const processSuccessfulPayment = async ({
  paystackData,
  customer,
  plan,
  device,
  paidBy,
  recordedBy,
  notes = '',
}) => {
  // Amount from Paystack is in kobo — convert back to GHS
  const amountGHS = paystackData.amount / 100;
  const reference = paystackData.reference;

  // Check for duplicate payment (idempotency)
  const existingPayment = await Payment.findOne({ paystack_reference: reference });
  if (existingPayment) {
    return { duplicate: true, payment: existingPayment };
  }

  // Create Payment record
  const payment = await Payment.create({
    installment_plan_id: plan._id,
    customer_id: customer._id,
    amount: amountGHS,
    payment_date: new Date(paystackData.paid_at || Date.now()),
    payment_method: 'paystack',
    paystack_reference: reference,
    paystack_status: paystackData.status,
    paid_by: paidBy,
    recorded_by: recordedBy,
    notes,
  });

  // Update installment plan
  const newPaymentsMade = plan.payments_made + 1;
  const newRemainingBalance = Math.max(0, plan.remaining_balance - amountGHS);
  const isCompleted = newPaymentsMade >= plan.total_payments || newRemainingBalance <= 0;

  // Calculate next due date
  let nextDueDate = plan.next_due_date;
  if (!isCompleted) {
    nextDueDate = new Date(plan.next_due_date);
    if (plan.frequency === 'daily') {
      nextDueDate.setDate(nextDueDate.getDate() + 1);
    } else if (plan.frequency === 'weekly') {
      nextDueDate.setDate(nextDueDate.getDate() + 7);
    } else {
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    }
  }

  // Mark the earliest unpaid schedule item as paid
  const scheduleUpdate = [...(plan.schedule || [])];
  const unpaidIndex = scheduleUpdate.findIndex((s) => !s.paid);
  if (unpaidIndex !== -1) {
    scheduleUpdate[unpaidIndex].paid = true;
    scheduleUpdate[unpaidIndex].payment_id = payment._id;
  }

  const planUpdateData = {
    payments_made: newPaymentsMade,
    remaining_balance: newRemainingBalance,
    next_due_date: isCompleted ? plan.end_date : nextDueDate,
    status: isCompleted ? 'completed' : 'active',
    schedule: scheduleUpdate,
  };

  await InstallmentPlan.findByIdAndUpdate(plan._id, planUpdateData);

  // If plan is completed, unlock the device
  let deviceUnlocked = false;
  if (isCompleted && device) {
    // Update local device status
    await Device.findByIdAndUpdate(device._id, { lock_status: 'unlocked' });
    deviceUnlocked = true;

    // Attempt MDM unlock if device has UDID
    if (device.udid) {
      try {
        await mdmUnlock(device.udid);
      } catch (mdmError) {
        console.error(`MDM unlock failed after plan completion for UDID ${device.udid}:`, mdmError.message);
      }
    }

    // Log plan completion
    await AuditLog.create({
      action: 'installment_completed',
      device_udid: device.udid,
      target_user_id: customer.user_id,
      details: {
        plan_id: plan._id,
        customer_id: customer._id,
        device_id: device._id,
        total_paid: plan.total_price,
      },
    });
  } else if (device && device.lock_status === 'locked' && !isCompleted) {
    // Unlock device after payment if it was locked for late payment
    await Device.findByIdAndUpdate(device._id, { lock_status: 'unlocked' });
    if (device.udid) {
      try {
        await mdmUnlock(device.udid);
      } catch (mdmError) {
        console.error(`MDM unlock failed after payment for UDID ${device.udid}:`, mdmError.message);
      }
    }

    // Reactivate defaulted plan back to active
    await InstallmentPlan.findByIdAndUpdate(plan._id, { status: 'active' });
    deviceUnlocked = true;
  }

  // Create payment audit log
  await AuditLog.create({
    user_id: recordedBy,
    action: 'payment_made',
    device_udid: device?.udid,
    target_user_id: customer.user_id,
    details: {
      payment_id: payment._id,
      amount: amountGHS,
      reference,
      plan_id: plan._id,
      payments_made: newPaymentsMade,
      remaining_balance: newRemainingBalance,
      is_completed: isCompleted,
      device_unlocked: deviceUnlocked,
    },
  });

  // Send payment confirmation email
  try {
    const customerEmail = customer.email;
    if (customerEmail) {
      const paymentsLeft = Math.max(0, plan.total_payments - newPaymentsMade);
      await sendPaymentConfirmationEmail(customerEmail, customer.full_name, amountGHS, {
        deviceModel: device?.model || 'iPhone',
        remainingBalance: newRemainingBalance,
        paymentsLeft,
        nextDueDate: isCompleted ? null : nextDueDate,
        reference,
      });
    }
  } catch (emailError) {
    console.error('Payment confirmation email failed:', emailError.message);
  }

  return {
    duplicate: false,
    payment,
    isCompleted,
    deviceUnlocked,
    newRemainingBalance,
    newPaymentsMade,
  };
};

/**
 * POST /api/payment/initialize
 * Initialize a Paystack payment for an installment.
 */
const initializePaymentHandler = async (req, res) => {
  try {
    // Find the customer for the authenticated user
    const customer = await Customer.findOne({ user_id: req.user._id }).lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer profile not found.' });
    }

    const plan = await InstallmentPlan.findOne({
      customer_id: customer._id,
      status: { $in: ['active', 'defaulted'] },
    })
      .populate({ path: 'device_id', select: 'model' })
      .lean();

    if (!plan) {
      return res.status(404).json({ success: false, message: 'No active installment plan found.' });
    }

    if (plan.remaining_balance <= 0) {
      return res.status(400).json({ success: false, message: 'Installment plan is fully paid.' });
    }

    // Determine amount to pay
    const amountToPay = parseFloat(req.body.amount) || plan.installment_amount;

    if (amountToPay <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount.' });
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
        initiated_by_role: req.user.role,
      },
    });

    if (!paystackResponse.status) {
      return res.status(502).json({ success: false, message: 'Paystack initialization failed.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment initialized.',
      data: {
        authorization_url: paystackResponse.data.authorization_url,
        access_code: paystackResponse.data.access_code,
        reference,
        amount: amountToPay,
      },
    });
  } catch (error) {
    console.error('initializePayment error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/payment/verify/:reference
 * Verify a Paystack payment by reference and process it.
 */
const verifyPaymentHandler = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'Payment reference is required.' });
    }

    // Verify with Paystack
    const paystackResponse = await verifyPayment(reference);

    if (!paystackResponse.status || paystackResponse.data.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: `Payment verification failed. Status: ${paystackResponse.data?.status || 'unknown'}.`,
        data: { paystack_status: paystackResponse.data?.status },
      });
    }

    const paystackData = paystackResponse.data;
    const metadata = paystackData.metadata || {};

    // Find customer from metadata or from the logged-in user
    let customer;
    if (metadata.customer_id) {
      customer = await Customer.findById(metadata.customer_id).lean();
    } else {
      customer = await Customer.findOne({ user_id: req.user._id }).lean();
    }

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    // Find the installment plan
    let plan;
    if (metadata.plan_id) {
      plan = await InstallmentPlan.findById(metadata.plan_id).lean();
    } else {
      plan = await InstallmentPlan.findOne({
        customer_id: customer._id,
        status: { $in: ['active', 'defaulted'] },
      }).lean();
    }

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Installment plan not found.' });
    }

    const device = await Device.findById(plan.device_id).lean();

    const paidBy = {
      user_id: req.user._id,
      user_role: req.user.role,
      name: req.user.name,
    };

    const result = await processSuccessfulPayment({
      paystackData,
      customer,
      plan,
      device,
      paidBy,
      recordedBy: req.user._id,
    });

    if (result.duplicate) {
      return res.status(200).json({
        success: true,
        message: 'Payment already processed.',
        data: { payment: result.payment, duplicate: true },
      });
    }

    return res.status(200).json({
      success: true,
      message: result.isCompleted
        ? 'Payment successful. Your installment plan is now complete and your device is unlocked!'
        : 'Payment successful.',
      data: {
        payment: result.payment,
        is_completed: result.isCompleted,
        device_unlocked: result.deviceUnlocked,
        remaining_balance: result.newRemainingBalance,
        payments_made: result.newPaymentsMade,
      },
    });
  } catch (error) {
    console.error('verifyPayment error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/webhooks/paystack
 * Process Paystack webhook events.
 * Verifies HMAC-SHA512 signature before processing.
 */
const paystackWebhook = async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-paystack-signature'];
    const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;

    if (signature && webhookSecret) {
      const hash = crypto
        .createHmac('sha512', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== signature) {
        console.warn('Paystack webhook: Invalid signature');
        return res.status(401).json({ success: false, message: 'Invalid webhook signature.' });
      }
    }

    const event = req.body;
    console.log(`Paystack webhook received: ${event.event}`);

    // Handle charge.success event
    if (event.event === 'charge.success') {
      const paystackData = event.data;
      const metadata = paystackData.metadata || {};

      // Respond to Paystack quickly (200) then process
      res.status(200).json({ success: true, message: 'Webhook received.' });

      try {
        // Find customer
        let customer;
        if (metadata.customer_id) {
          customer = await Customer.findById(metadata.customer_id).lean();
        } else {
          // Try to find by email
          const User = require('../models/User');
          const user = await User.findOne({ email: paystackData.customer?.email?.toLowerCase() }).lean();
          if (user) {
            customer = await Customer.findOne({ user_id: user._id }).lean();
          }
        }

        if (!customer) {
          console.error(`Webhook: Customer not found for reference ${paystackData.reference}`);
          return;
        }

        // Find the plan
        let plan;
        if (metadata.plan_id) {
          plan = await InstallmentPlan.findById(metadata.plan_id).lean();
        } else {
          plan = await InstallmentPlan.findOne({
            customer_id: customer._id,
            status: { $in: ['active', 'defaulted'] },
          }).lean();
        }

        if (!plan) {
          console.error(`Webhook: Plan not found for customer ${customer._id}`);
          return;
        }

        const device = await Device.findById(plan.device_id).lean();

        const paidBy = {
          user_id: null,
          user_role: metadata.initiated_by_role || 'customer',
          name: metadata.customer_name || customer.full_name,
        };

        const result = await processSuccessfulPayment({
          paystackData,
          customer,
          plan,
          device,
          paidBy,
          recordedBy: null,
          notes: 'Processed via Paystack webhook',
        });

        if (result.duplicate) {
          console.log(`Webhook: Duplicate payment for reference ${paystackData.reference}`);
        } else {
          console.log(
            `Webhook: Payment processed for ${customer.full_name}. ` +
            `Amount: GHS ${paystackData.amount / 100}. Completed: ${result.isCompleted}`
          );
        }
      } catch (processError) {
        console.error('Webhook processing error:', processError.message);
      }

      return; // Already responded
    }

    // For other event types, acknowledge receipt
    return res.status(200).json({ success: true, message: 'Webhook received.' });
  } catch (error) {
    console.error('Webhook handler error:', error);
    // Always return 200 to Paystack to prevent retries
    return res.status(200).json({ success: true, message: 'Webhook received.' });
  }
};

module.exports = { initializePayment: initializePaymentHandler, verifyPayment: verifyPaymentHandler, paystackWebhook };
