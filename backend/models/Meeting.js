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
     * Who runs the meeting.
     *
     * Calling a meeting and running it are different jobs. The owner
     * who puts "Monday staff meeting" in the diary is often not the
     * person who will actually chair it — a manager runs their own
     * team's, a head of department runs the stock review — and that
     * person needs to be able to close the meeting when it is over
     * without coming back to an owner for it.
     *
     * Defaults to whoever called the meeting, so a meeting always has
     * exactly one host and the field is never empty.
     */
    host_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    host_name: { type: String, trim: true },

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

    /**
     * People the host has put out of the meeting.
     *
     * Held on the document rather than in the room's memory, because
     * the whole point is that they cannot simply tap Join again — and
     * a list that lives only in the running process forgets them the
     * moment the server restarts.
     */
    removed_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

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
  // Put out of the room by the host, and not through the door again.
  if ((meeting.removed_ids || []).some((id) => String(id) === String(user._id))) return false;
  if (String(meeting.created_by) === String(user._id)) return true;
  /**
   * The host is in the meeting they are running, whatever the audience
   * says. A manager asked to chair the sales attendants' meeting is not
   * a sales attendant, and being shut out of a meeting you were told to
   * run is the kind of thing that makes a feature look untested.
   */
  if (meeting.host_id && String(meeting.host_id) === String(user._id)) return true;
  if (meeting.audience === 'everyone') return true;
  if (meeting.audience === 'roles') {
    return (meeting.roles || []).includes(user.role);
  }
  return (meeting.user_ids || []).some((id) => String(id) === String(user._id));
};

/**
 * Who may silence or remove somebody.
 *
 * Whoever is running the meeting, and any owner as a backstop: a host
 * whose phone dies mid-meeting would otherwise leave a noisy room with
 * nobody able to quiet it.
 */
MeetingSchema.statics.moderatedBy = function moderatedBy(meeting, user, isOwnerRole) {
  if (!meeting || !user) return false;
  if (meeting.host_id && String(meeting.host_id) === String(user._id)) return true;
  if (String(meeting.created_by) === String(user._id)) return true;
  return Boolean(isOwnerRole);
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
      { host_id: user._id },
      { audience: 'everyone' },
      { audience: 'roles', roles: user.role },
      { audience: 'people', user_ids: user._id },
    ],
  };
};

module.exports = mongoose.model('Meeting', MeetingSchema);
