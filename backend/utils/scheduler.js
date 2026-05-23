const cron = require('node-cron');
const InstallmentPlan = require('../models/InstallmentPlan');
const Device = require('../models/Device');
const Customer = require('../models/Customer');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { lockDevice } = require('./simpleMDM');
const { sendLockNotificationEmail } = require('./email');

/**
 * Check for overdue installment plans and lock devices.
 * An installment plan is considered overdue if:
 * - Status is 'active'
 * - next_due_date is more than 48 hours in the past
 */
const checkOverduePayments = async () => {
  console.log('[Scheduler] Running checkOverduePayments job...');

  try {
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

    // Find all active plans where next_due_date is past the 48-hour cutoff
    const overduePlans = await InstallmentPlan.find({
      status: 'active',
      next_due_date: { $lt: cutoffDate },
    })
      .populate({
        path: 'device_id',
        select: 'model udid lock_status serial_number',
      })
      .populate({
        path: 'customer_id',
        select: 'user_id full_name email phone',
      });

    if (overduePlans.length === 0) {
      console.log('[Scheduler] No overdue plans found.');
      return;
    }

    console.log(`[Scheduler] Found ${overduePlans.length} overdue plan(s). Processing...`);

    for (const plan of overduePlans) {
      try {
        const device = plan.device_id;
        const customer = plan.customer_id;

        if (!device || !customer) {
          console.warn(`[Scheduler] Plan ${plan._id} missing device or customer data. Skipping.`);
          continue;
        }

        // Skip if device is already locked
        if (device.lock_status === 'locked') {
          console.log(`[Scheduler] Device ${device.udid || device._id} already locked. Skipping.`);
          continue;
        }

        // Only lock if device has a UDID (required for MDM)
        if (!device.udid) {
          console.warn(
            `[Scheduler] Device ${device._id} has no UDID. Cannot lock via MDM. Marking plan as defaulted.`
          );
          await InstallmentPlan.findByIdAndUpdate(plan._id, { status: 'defaulted' });
          continue;
        }

        console.log(
          `[Scheduler] Locking device ${device.udid} for overdue plan ${plan._id} (customer: ${customer.full_name})`
        );

        // Attempt to lock the device via SimpleMDM
        let lockSuccess = false;
        try {
          await lockDevice(device.udid);
          lockSuccess = true;
        } catch (mdmError) {
          console.error(
            `[Scheduler] SimpleMDM lock failed for device ${device.udid}: ${mdmError.message}`
          );
          // Continue with local status update even if MDM call fails
        }

        // Update local device lock status regardless of MDM result
        await Device.findByIdAndUpdate(device._id, { lock_status: 'locked' });

        // Mark plan as defaulted
        await InstallmentPlan.findByIdAndUpdate(plan._id, { status: 'defaulted' });

        // Create audit log entry
        await AuditLog.create({
          action: 'device_lock',
          device_udid: device.udid,
          target_user_id: customer.user_id,
          details: {
            reason: 'Automated lock: payment overdue by more than 48 hours',
            installment_plan_id: plan._id,
            next_due_date: plan.next_due_date,
            hours_overdue: Math.round((Date.now() - new Date(plan.next_due_date)) / (1000 * 60 * 60)),
            mdm_lock_success: lockSuccess,
            device_model: device.model,
            customer_name: customer.full_name,
          },
          ip_address: 'scheduler',
        });

        // Send lock notification email to customer
        try {
          let customerEmail = customer.email;
          if (!customerEmail && customer.user_id) {
            const userRecord = await User.findById(customer.user_id).select('email');
            customerEmail = userRecord?.email;
          }

          if (customerEmail) {
            await sendLockNotificationEmail(customerEmail, customer.full_name, device.model);
            console.log(`[Scheduler] Lock notification email sent to ${customerEmail}`);
          }
        } catch (emailError) {
          console.error(
            `[Scheduler] Failed to send lock notification email: ${emailError.message}`
          );
          // Don't fail the whole process if email fails
        }

        console.log(
          `[Scheduler] Successfully processed overdue plan ${plan._id}: device locked, plan defaulted.`
        );
      } catch (planError) {
        console.error(`[Scheduler] Error processing plan ${plan._id}: ${planError.message}`);
        // Continue with next plan
      }
    }

    console.log('[Scheduler] checkOverduePayments job completed.');
  } catch (error) {
    console.error('[Scheduler] Fatal error in checkOverduePayments:', error.message);
  }
};

/**
 * Start all cron jobs.
 * - Every hour: check for overdue installment plans and lock devices.
 */
const startScheduler = () => {
  console.log('[Scheduler] Initializing scheduled jobs...');

  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    await checkOverduePayments();
  });

  console.log('[Scheduler] Overdue payment checker scheduled: every hour.');

  // Run an initial check at startup (delayed by 10 seconds to allow DB connection)
  setTimeout(async () => {
    await checkOverduePayments();
  }, 10000);
};

module.exports = { startScheduler, checkOverduePayments };
