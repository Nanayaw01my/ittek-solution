/**
 * Keeping the nightly backup on Cloudinary.
 *
 * A backup written to the container's disk is not a backup — Render wipes
 * that disk on every deploy, so the copy dies with the thing it was meant to
 * outlive. Email was the answer, and on Render's free plan email cannot
 * leave: the SMTP ports are shut. A night where the backup is made and then
 * goes nowhere is a night with no backup.
 *
 * Cloudinary is already set up here for the company logo, it is reached over
 * ordinary HTTPS, and it does not care that the file is a gzip rather than a
 * picture. So the copy goes there regardless of whether email works.
 *
 * It is uploaded `authenticated`, not public. A shop's whole database at a
 * guessable URL would be worse than no backup at all — anybody who found it
 * would have every customer, every price and every password hash. Reading it
 * back needs a URL this server signs with the API secret.
 */

const cloudinary = require('../config/cloudinary');

/** Where the copies live, so they can be listed without sifting the logos. */
const FOLDER = 'ittek/backups';

/** How many nights are kept. Older ones are deleted so storage is bounded. */
const KEEP = 30;

/**
 * Is Cloudinary set up at all?
 *
 * Asked of the library rather than of the environment. A server can be told
 * about Cloudinary through three separate variables or through the single
 * CLOUDINARY_URL the dashboard hands out, and reading only the three meant
 * a shop whose logo uploads had worked for months was told its off-site
 * backups were "not set up".
 */
const cloudConfigured = () => {
  const cfg = cloudinary.config() || {};
  return Boolean(cfg.cloud_name && cfg.api_key && cfg.api_secret);
};

/**
 * A link that opens the file, signed by this server.
 *
 * An `authenticated` raw file has no public URL; the signature is what makes
 * it readable, and only somebody holding the API secret can produce one. The
 * link is made fresh each time the Backup screen is opened rather than
 * stored, so a saved link cannot outlive the person's access to the screen.
 */
const signedLink = (publicId) => cloudinary.url(publicId, {
  resource_type: 'raw',
  type: 'authenticated',
  sign_url: true,
  secure: true,
});

/**
 * Put tonight's backup on Cloudinary.
 *
 * @param {Buffer} packed   the gzipped backup
 * @param {string} name     filename, e.g. ittek-backup-2026-10-18.json.gz
 * @returns {Promise<{public_id: string, bytes: number, url: string}>}
 */
const uploadBackup = (packed, name) => new Promise((resolve, reject) => {
  if (!cloudConfigured()) {
    reject(new Error('Cloudinary is not set up on this server (CLOUDINARY_CLOUD_NAME, '
      + 'CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).'));
    return;
  }

  cloudinary.uploader
    .upload_stream(
      {
        folder: FOLDER,
        resource_type: 'raw',
        // Not public. See the note at the top of this file.
        type: 'authenticated',
        public_id: name.replace(/\.gz$/, ''),
        // Cloudinary otherwise appends a random suffix, which makes the
        // night's copy impossible to name from anywhere else.
        use_filename: false,
        unique_filename: false,
        overwrite: true,
      },
      (err, data) => {
        if (err) { reject(new Error(err.message || 'Cloudinary refused the upload.')); return; }
        resolve({
          public_id: data.public_id,
          bytes: data.bytes ?? packed.length,
          url: signedLink(data.public_id),
        });
      }
    )
    .end(packed);
});

/**
 * The copies that are up there, newest first, each with a link.
 *
 * This is the honest answer to "are the backups working" — not a job log
 * saying a file was sent, but the files themselves.
 */
const listBackups = async ({ limit = KEEP } = {}) => {
  if (!cloudConfigured()) return [];

  const res = await cloudinary.api.resources({
    resource_type: 'raw',
    type: 'authenticated',
    prefix: `${FOLDER}/`,
    max_results: Math.min(Math.max(limit, 1), 100),
  });

  return (res?.resources || [])
    .map((r) => ({
      public_id: r.public_id,
      filename: String(r.public_id).split('/').pop(),
      bytes: r.bytes,
      created_at: r.created_at,
      url: signedLink(r.public_id),
    }))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
};

/**
 * Delete everything past the newest `keep`.
 *
 * Quiet on failure: a month-old copy that would not delete is untidy, not a
 * reason to record tonight's backup as failed.
 */
const pruneBackups = async ({ keep = KEEP } = {}) => {
  try {
    const all = await listBackups({ limit: 100 });
    const old = all.slice(keep);
    if (old.length === 0) return 0;
    await cloudinary.api.delete_resources(old.map((b) => b.public_id), {
      resource_type: 'raw',
      type: 'authenticated',
    });
    return old.length;
  } catch (err) {
    console.error('[CloudBackup] Could not prune old copies:', err.message);
    return 0;
  }
};

module.exports = {
  uploadBackup, listBackups, pruneBackups, signedLink, cloudConfigured, FOLDER, KEEP,
};
