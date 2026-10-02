const mongoose = require('mongoose');

/**
 * Everybody who has ever given the shop a phone number.
 *
 * The Customer collection next to this one is for credit applications — it
 * wants an email, a Ghana card, an income and a guarantor, which is right for
 * lending somebody a phone over twelve weeks and absurd for the woman who
 * bought a bulb and left her number for the receipt. So her number went
 * nowhere, and there was no list to send a word to at Christmas.
 *
 * This is that list, and it fills itself: every sale carrying a number writes
 * one. Nobody has to remember to add anybody, which is the only way a contact
 * book in a busy shop is ever accurate.
 *
 * Keyed on the normalised number, 233XXXXXXXXX, because that is the one thing
 * about a customer that does not change between visits. The same person
 * typed as 0244…, +233 244… and 244… is one row, not three.
 */
const ContactSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    /** As last written on a sale. Updated when a fuller version turns up. */
    name: { type: String, trim: true, default: '' },

    first_seen: { type: Date, default: Date.now },
    last_seen: { type: Date, default: Date.now },
    visits: { type: Number, default: 0 },
    total_spent: { type: Number, default: 0 },

    /**
     * Their birthday, if the shop ever learns it. Only the day and month are
     * ever used, but the year is kept as given rather than thrown away.
     */
    birthday: { type: Date },

    /**
     * They asked not to be messaged.
     *
     * A list built automatically from every sale will eventually include
     * somebody who does not want to hear from the shop, and the only decent
     * answer to "stop texting me" is a switch that works. Nothing goodwill
     * sends may go to a contact with this set.
     */
    do_not_contact: { type: Boolean, default: false },

    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// Finding the regulars, and finding somebody by name.
ContactSchema.index({ last_seen: -1 });
ContactSchema.index({ name: 1 });

module.exports = mongoose.model('Contact', ContactSchema);
