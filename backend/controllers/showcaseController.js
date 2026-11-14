const ShowcaseItem = require('../models/ShowcaseItem');
const cloudinary = require('../config/cloudinary');

/**
 * The shop's own work, as it appears between the prices.
 *
 * Everything here is written by staff and shown to customers, so the
 * same rule as the price board applies: the board is sent named fields
 * and nothing else. There is less at stake — a photograph of a roof is
 * not a cost price — but who uploaded it, and when, is the shop's
 * business and not the street's.
 */

/** What a wall screen is allowed to know about a slide. */
const forTheWall = (d) => ({
  id: String(d._id),
  kind: d.kind,
  url: d.url,
  poster_url: d.poster_url || null,
  caption: d.caption || '',
  location: d.location || '',
  seconds: Number(d.seconds) || 12,
});

/** Active slides in rotation order, ready for the board. */
const activeForBoard = async () => {
  const rows = await ShowcaseItem
    .find({ is_active: true })
    .select('kind url poster_url caption location seconds sort_order')
    .sort({ sort_order: 1, createdAt: -1 })
    .limit(40)
    .lean();
  return rows.map(forTheWall);
};

/**
 * GET /api/showcase
 *
 * The management list: everything, including what is switched off, with
 * the housekeeping fields the screen needs to manage it.
 */
const listShowcase = async (req, res) => {
  try {
    const items = await ShowcaseItem
      .find({})
      .populate('created_by', 'username')
      .sort({ sort_order: 1, createdAt: -1 })
      .lean();
    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    console.error('List showcase error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not load the showcase.' });
  }
};

/**
 * POST /api/showcase
 *
 * Records a file that has already been uploaded. The upload itself goes
 * through /api/upload, which is where the Cloudinary credentials and the
 * file-type rules live; this only writes down what came back.
 */
const createShowcase = async (req, res) => {
  try {
    const kind = req.body?.kind === 'video' ? 'video' : 'image';
    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ success: false, message: 'No file was uploaded.' });

    const last = await ShowcaseItem.findOne({}).sort({ sort_order: -1 }).select('sort_order').lean();

    const item = await ShowcaseItem.create({
      kind,
      url,
      poster_url: String(req.body?.poster_url || '').trim() || undefined,
      caption: String(req.body?.caption || '').trim(),
      location: String(req.body?.location || '').trim(),
      seconds: Math.min(60, Math.max(4, Number(req.body?.seconds) || 12)),
      public_id: String(req.body?.public_id || '').trim() || undefined,
      bytes: Number(req.body?.bytes) || undefined,
      // Onto the end of the rotation, not the front: a new slide should
      // not jump ahead of work the shop has already chosen to lead with.
      sort_order: (last?.sort_order ?? 0) + 1,
      created_by: req.user._id,
    });

    return res.status(201).json({ success: true, message: 'Added to the board.', data: item });
  } catch (err) {
    console.error('Create showcase error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not add that.' });
  }
};

/** PUT /api/showcase/:id — caption, location, how long, on or off, order. */
const updateShowcase = async (req, res) => {
  try {
    const set = {};
    if (req.body?.caption !== undefined) set.caption = String(req.body.caption).trim();
    if (req.body?.location !== undefined) set.location = String(req.body.location).trim();
    if (req.body?.seconds !== undefined) {
      set.seconds = Math.min(60, Math.max(4, Number(req.body.seconds) || 12));
    }
    if (req.body?.is_active !== undefined) set.is_active = !!req.body.is_active;
    if (req.body?.sort_order !== undefined) set.sort_order = Number(req.body.sort_order) || 0;

    const item = await ShowcaseItem.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Not found.' });
    return res.status(200).json({ success: true, message: 'Saved.', data: item });
  } catch (err) {
    console.error('Update showcase error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not save that.' });
  }
};

/**
 * DELETE /api/showcase/:id
 *
 * Takes the file with it. A record removed while its video stays on
 * Cloudinary is a file nobody can see, nobody can find, and the shop
 * goes on paying for — and videos are the heavy ones.
 */
const deleteShowcase = async (req, res) => {
  try {
    const item = await ShowcaseItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found.' });

    if (item.public_id) {
      try {
        await cloudinary.uploader.destroy(item.public_id, {
          resource_type: item.kind === 'video' ? 'video' : 'image',
        });
      } catch (err) {
        // The record is already gone and the slide is off the wall, which
        // is what was asked for. A file left behind is a bill, not a bug
        // the person deleting it can do anything about.
        console.error('Showcase file not removed from Cloudinary:', err.message);
      }
    }

    return res.status(200).json({ success: true, message: 'Removed.' });
  } catch (err) {
    console.error('Delete showcase error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not remove that.' });
  }
};

module.exports = {
  listShowcase, createShowcase, updateShowcase, deleteShowcase,
  activeForBoard, forTheWall,
};
