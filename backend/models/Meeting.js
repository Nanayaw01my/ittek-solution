const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * A staff meeting, held inside the app.
 *
 * The document holds who is invited, when, and what was decided. It does
 * NOT hold the call: the audio and video go directly between the phones
 * in the room and never touch this server or this database. What lives
 * here is the paperwork around the call — which is the part anyone needs
 * three weeks later, when the question is "what did we agree on Monday".
 *
 * Only an owner creates one. That was the shop's decision, and it is
 * enforced on the route rather than here, so this model stays a record
 * of a meeting rather than a statement about rank.
 */

const AttendanceSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, trim: true },
    role: { type: String, trim: true },
    joined_at: { type: Date, default: Date.now },
    left_at: { type: Date, default: null },
  },
  { _id: false }
);

const MeetingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    /** What the meeting is about, written before it happens. */
    agenda: { type: String, trim: true, default: '' },

    scheduled_for: { type: Date, required: true },

    /**
     * Who is invited.
     *
     * The same three shapes the staff-message screen already uses, so the
     * two screens ask the same question the same way and an owner does
     * not have to learn a second idea of "who".
     */
    audience: {
      type: String,
      enum: ['everyone', 'roles', 'people'],
      default: 'everyone',
    },
    roles: [{ type: String, trim: true }],
    user_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    created_by_name: { type: String, trim: true },

    /**
     * The room's name on the wire, and the one secret in this document.
     *
     * Anyone holding it can be put through to the call by the signalling
     * server, so it is random rather than derived from the meeting's id:
     * ids appear in URLs, in logs and in the browser's history, and a
     * room name that can be worked out from one is a room anybody can
     * walk into. Never sent to a user who is not on the invitation list.
     */
    room_key: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomBytes(24).toString('base64url'),
    },

    status: {
      type: String,
      enum: ['scheduled', 'live', 'ended', 'cancelled'],
      default: 'scheduled',
    },
    started_at: { type: Date, default: null },
    ended_at: { type: Date, default: null },

    /** What was decided, written afterwards. */
    notes: { type: String, trim: true, default: '' },

    /**
     * Who actually turned up, and when.
     *
     * One row per person per meeting — joining again from a dropped
     * connection updates the row rather than adding another, so a bad
     * line does not read as somebody arriving four times.
     */
    attendance: [AttendanceSchema],

    created_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/** The list screen asks for "mine, soonest first" on every load. */
MeetingSchema.index({ scheduled_for: -1 });
MeetingSchema.index({ status: 1, scheduled_for: -1 });

/**
 * Is this person on the invitation list?
 *
 * Asked by every route that hands out the room key, and by the signalling
 * server before it puts a socket into a room. One function, because an
 * invitation rule that is written out twice is a rule that will disagree
 * with itself.
 *
 * The person who called the meeting is always in it. They may not be in
 * their own audience — an owner inviting "the sales attendants" is not a
 * sales attendant — and being unable to join the meeting you called is
 * the kind of bug that makes a feature look untested.
 */
MeetingSchema.statics.invites = function invites(meeting, user) {
  if (!meeting || !user) return false;
  if (String(meeting.created_by) === String(user._id)) return true;
  if (meeting.audience === 'everyone') return true;
  if (meeting.audience === 'roles') {
    return (meeting.roles || []).includes(user.role);
  }
  return (meeting.user_ids || []).some((id) => String(id) === String(user._id));
};

/**
 * The query that finds the meetings a person is invited to.
 *
 * Kept beside invites() above and tested against it, because the two have
 * to agree: a meeting that appears in somebody's list but refuses them at
 * the door is worse than one they never saw.
 */
MeetingSchema.statics.invitedFilter = function invitedFilter(user) {
  return {
    $or: [
      { created_by: user._id },
      { audience: 'everyone' },
      { audience: 'roles', roles: user.role },
      { audience: 'people', user_ids: user._id },
    ],
  };
};

module.exports = mongoose.model('Meeting', MeetingSchema);
