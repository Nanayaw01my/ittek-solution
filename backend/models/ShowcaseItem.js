const mongoose = require('mongoose');

/**
 * A photograph or a short film of work the shop has done.
 *
 * The price board sells what is on the shelf. This sells what the shop
 * can do with it — a roof of panels in Prestea, an inverter wired into a
 * shop, a crew on a ladder. On a wall screen those are the slides people
 * actually watch, because a price is read in a second and a job someone
 * recognises holds the eye for twenty.
 *
 * Kept apart from products on purpose. A finished installation is not
 * stock: it has no price, no quantity and nothing to sell, and hanging
 * it off a product record would mean inventing one.
 */
const ShowcaseItemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['image', 'video'], required: true },
    url: { type: String, required: true, trim: true },

    /**
     * The still a video shows before it starts playing.
     *
     * A video element with nothing to show is a black rectangle, which on
     * a shop wall reads as a broken screen for however long the file
     * takes to arrive over the shop's connection. Cloudinary makes one
     * from the first frame; see showcaseController.
     */
    poster_url: { type: String, trim: true },

    /** What the customer is looking at, in the shop's own words. */
    caption: { type: String, trim: true, maxlength: 120 },
    /** Where the job was. "Prestea", "Bogoso Market" — a town, not an address. */
    location: { type: String, trim: true, maxlength: 80 },

    /**
     * How long a still photograph stays up, in seconds.
     *
     * A video runs for as long as it runs, capped by the board. A
     * photograph has no natural length, so the shop decides: a busy
     * picture of a whole roof deserves longer than a close-up of a
     * switch.
     */
    seconds: { type: Number, default: 12, min: 4, max: 60 },

    /** Off without being deleted — a job the shop would rather not show today. */
    is_active: { type: Boolean, default: true },
    /** Where it falls in the rotation. Lower first. */
    sort_order: { type: Number, default: 0 },

    /**
     * What Cloudinary calls the file, kept so deleting the record can
     * delete the file too. Without it, every removed slide stays on the
     * shop's Cloudinary quota for ever.
     */
    public_id: { type: String, trim: true },
    bytes: { type: Number },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ShowcaseItemSchema.index({ is_active: 1, sort_order: 1, createdAt: -1 });

module.exports = mongoose.model('ShowcaseItem', ShowcaseItemSchema);
