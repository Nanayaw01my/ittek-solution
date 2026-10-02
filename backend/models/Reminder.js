const mongoose = require('mongoose');

/**
 * A customer who needs chasing, and a record that they were.
 *
 * Two kinds live here. Most are worked out rather than stored — everybody
 * with a debt, a layaway, a credit agreement or a phone instalment due soon
 * is already known to the system, and writing them down again would only
 * create a second list to keep in step. This collection holds the other
 * kind: something somebody wants remembering that the system could not have
 * known about, such as calling a customer back about an installation.
 *
 * It also holds the log of what was actually sent, which is the part that
 * matters in an argument: "we reminded you on the 4th" is only worth saying
 * if it is written down.
 */
const ReminderSchema = new mongoose.Schema(
  {
    customer_name: { type: String, required: true, trim: true },
    customer_phone: { type: String, required: true, trim: true },

    about: { type: String, required: true, trim: true },
    message: { type: String, trim: true },
    due_date: { type: Date },

    /**
     * Chasing money, or keeping in touch.
     *
     * The two are not the same job and should not share a list. Money is
     * owed, overdue, and counted; goodwill is a birthday, a note to call
     * somebody back, or asking how the panels are doing three weeks on. Put
     * together, the kind thing gets lost among the debts and never gets done,
     * and the debt list stops being a list of who owes what.
     *
     * Defaults to money so that every reminder written before this existed
     * stays exactly where it was.
     */
    kind: {
      type: String,
      enum: ['money', 'goodwill'],
      default: 'money',
      index: true,
    },

    /**
     * What a goodwill reminder is for, which decides how the message reads.
     *
     *   wish    — a birthday, a festival, a congratulations
     *   note    — something to tell them that is not money
     *   checkup — how is it working? anything needing attention?
     */
    purpose: {
      type: String,
      enum: ['wish', 'note', 'checkup'],
      default: 'note',
    },

    /**
     * Comes round again every year. A birthday is not done once it has been
     * wished — it is due again in twelve months, and marking it finished for
     * ever is how a shop forgets somebody's birthday the following year.
     */
    yearly: { type: Boolean, default: false },

    /**
     * Where it came from. A 'custom' one was typed by somebody; the rest name
     * the record they were raised against, so a reminder can be traced back
     * and does not outlive the thing it was about.
     */
    source: {
      type: String,
      enum: ['custom', 'debt', 'layaway', 'credit', 'phone_credit'],
      default: 'custom',
    },
    source_id: { type: mongoose.Schema.Types.ObjectId },
    amount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['pending', 'sent', 'done', 'cancelled'],
      default: 'pending',
    },

    // Every time somebody actually reached out, and how.
    sends: [
      {
        channel: { type: String, enum: ['whatsapp', 'sms', 'call', 'other'], default: 'whatsapp' },
        sent_at: { type: Date, default: Date.now },
        sent_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, trim: true },
        _id: false,
      },
    ],

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ReminderSchema.index({ status: 1, due_date: 1 });
ReminderSchema.index({ customer_phone: 1 });

module.exports = mongoose.model('Reminder', ReminderSchema);
