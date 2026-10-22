const zlib = require('zlib');
const { promisify } = require('util');

/**
 * Required at the top, not inside the function.
 *
 * These used to be lazy requires. A lazy require resolves when the job runs,
 * which is long after a test has put its stand-ins in place — so every test
 * of this file quietly got the real models and sat waiting for a database
 * that is not there. Hoisted, the stand-ins are what the module holds.
 */
const { createBackup } = require('./backup');
const { sendEmail } = require('./email');
const Settings = require('../models/Settings');
const { notifyOwners } = require('./notify');
const { uploadBackup, pruneBackups, cloudConfigured } = require('./cloudBackup');

const gzip = promisify(zlib.gzip);

/**
 * A backup that happens without anybody remembering to make one.
 *
 * Backing up was a button. A button gets pressed when somebody thinks of it,
 * which is not a schedule — and the shop's entire books live in one database
 * with a "Clear All Data" button three screens away. The failure this guards
 * against is the one that cannot be undone.
 *
 * It leaves the server, because a copy written to the container's disk is not
 * a backup: Render wipes that disk on every deploy, so the copy dies with the
 * thing it was meant to survive. It goes to two different companies' machines
 * — Cloudinary over HTTPS, and the owner's inbox — because for months it went
 * only by email, and on Render's free plan the SMTP ports are shut, so it
 * went nowhere at all. One route failing is now an inconvenience rather than
 * a shop with no backups.
 *
 * Compressed first. A shop's data is JSON, which gzips to roughly a tenth of
 * its size, and the difference decides whether it fits in an email at all.
 */

/** Gmail refuses attachments past 25MB; stay well clear of the edge. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const human = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Where a backup is sent, in one place.
 *
 * Four possible sources and they are tried in the order somebody would
 * expect: an address set for backups specifically, then the admin address,
 * then the shop's own email, then whatever mailbox the system sends from.
 * The job and the "send me one now" button must agree about this, or a test
 * that arrives proves nothing about tonight.
 */
const backupAddress = (settings) => process.env.BACKUP_EMAIL
  || process.env.ADMIN_EMAIL
  || settings?.company_email
  || process.env.EMAIL_USER
  || '';

/**
 * Make tonight's backup and send it somewhere safe.
 *
 * Returns a sentence describing what happened, which the job log keeps — so
 * "the backups are working" is a question with an answer rather than a hope.
 */
const runNightlyBackup = async () => {
  const settings = await Settings.findOne().select('company_name company_email').lean();
  const to = backupAddress(settings);

  if (!to && !cloudConfigured()) {
    // Said out loud rather than failing quietly, because a backup nobody is
    // told about is indistinguishable from no backup.
    await notifyOwners({
      type: 'system',
      title: 'Backup has nowhere to go',
      message: 'Set an email address for backups in Settings, or set Cloudinary up on the '
        + 'server — otherwise nothing is being kept.',
      link: '/settings',
      tag: 'backup-no-address',
    }).catch(() => {});
    return 'Nowhere to put a backup.';
  }

  const backup = await createBackup();
  const raw = Buffer.from(backup.json, 'utf8');
  const packed = await gzip(raw);
  const name = `${backup.filename.replace(/\.json$/, '')}.json.gz`;
  const shop = settings?.company_name || 'ITTEK Solution';
  const when = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });

  const summary = `${backup.meta.document_count} records across ${backup.meta.collection_count} collections`;

  /**
   * Two places, tried independently.
   *
   * Cloudinary first, because it is the one that works where email does not:
   * on Render's free plan the SMTP ports are shut, so for months the job
   * could make a perfect backup every night and post it nowhere. Email stays
   * because a file in the owner's inbox needs nobody's password to read.
   *
   * Neither failure stops the other being tried, and the night only counts
   * as failed when both have failed — one surviving copy is a backup.
   */
  let cloud = null;
  let cloudWhy = '';
  if (cloudConfigured()) {
    try {
      cloud = await uploadBackup(packed, name);
      // Bounded storage, done after a success so a prune failure can never
      // be mistaken for a backup failure.
      await pruneBackups();
    } catch (err) {
      cloudWhy = String(err?.message || err);
      console.error('[Backup] Cloudinary copy failed:', cloudWhy);
    }
  } else {
    cloudWhy = 'Cloudinary is not set up on this server.';
  }

  let emailed = false;
  let emailWhy = '';
  if (!to) {
    // Nobody asked for an emailed copy. Said for the job log, not raised.
    emailWhy = 'No address is set for backups, so none was emailed.';
  } else if (packed.length > MAX_ATTACHMENT_BYTES) {
    // Too big to post. Better to say so tonight than to discover it on the
    // morning somebody needs the backup.
    emailWhy = `${human(packed.length)} is too large to attach.`;
    await sendEmail({
      to,
      subject: `${shop} — backup too large to attach (${human(packed.length)})`,
      html: `<p>Tonight's backup holds ${summary} and compresses to ${human(packed.length)}, which is too large to email.</p>
             ${cloud
    ? '<p>It is safe either way — the full copy is on the Backup screen, under the off-site copies.</p>'
    : '<p>Please download it by hand from the Backup screen, and consider clearing records you no longer need.</p>'}`,
    }).catch(() => {});
    if (!cloud) {
      await notifyOwners({
        type: 'system',
        title: 'Backup too large to email',
        message: `Tonight's backup is ${human(packed.length)} — too big to send. Download one by hand from Settings.`,
        link: '/backup',
        tag: 'backup-too-large',
      }).catch(() => {});
    }
  } else {
    try {
      await sendEmail({
        to,
        subject: `${shop} — backup ${backup.filename.replace(/^ittek-backup-/, '').replace(/\.json$/, '')}`,
        html: `<p>Automatic backup of <strong>${shop}</strong>, taken ${when}.</p>
               <p>${summary}. Attached, compressed, as <code>${name}</code> (${human(packed.length)}).</p>
               ${cloud ? '<p>A second copy is kept off-site; the Backup screen lists it.</p>' : ''}
               <p style="color:#666;font-size:13px">Keep these. Restoring one is done from the Backup screen —
               unzip it first, then upload the .json inside.</p>`,
        attachments: [{ filename: name, content: packed }],
      });
      emailed = true;
    } catch (err) {
      emailWhy = String(err?.message || err);
      console.error('[Backup] Could not email the backup:', emailWhy);
    }
  }

  if (!cloud && !emailed) {
    /**
     * The backup was made and then went nowhere.
     *
     * This is the quietest way to end up with no backups at all: the job
     * runs every night, fails every night, and the only sign is a screen
     * nobody opens until the morning it matters. So it is said out loud,
     * with both reasons, and then thrown so the run is recorded as failed
     * and tried again later.
     */
    await notifyOwners({
      type: 'system',
      title: 'Backup could not be saved anywhere',
      message: `Tonight's backup was made (${summary}) but could not be kept. `
        + `Off-site: ${cloudWhy} Email: ${emailWhy} `
        + 'Until this is fixed nothing is being kept off the server.',
      link: '/system-health',
      tag: 'backup-send-failed',
    }).catch(() => {});
    throw new Error(`Made the backup but could not save it anywhere. `
      + `Off-site: ${cloudWhy} Email: ${emailWhy}`);
  }

  /**
   * A copy that should have been made and was not is worth saying, quietly.
   *
   * Not a failure — the data is safe — but a shop that thinks it has two
   * copies and has one should be told, rather than finding out on the night
   * the remaining one also fails.
   *
   * Deliberately not setting an address is not that. Email is the second
   * copy, not the backup, and somebody who left it blank does not need
   * telling again every night for the rest of the year.
   */
  if (!cloud || (!emailed && to)) {
    await notifyOwners({
      type: 'system',
      title: 'Backup saved, but only one copy',
      message: cloud
        ? `Tonight's backup is off-site and safe, but it could not be emailed. ${emailWhy}`
        : `Tonight's backup was emailed to ${to}, but the off-site copy failed. ${cloudWhy}`,
      link: '/backup',
      tag: 'backup-one-copy',
    }).catch(() => {});
  }

  const where = [
    cloud ? 'off-site' : null,
    emailed ? `emailed to ${to}` : null,
  ].filter(Boolean).join(' and ');

  return `${human(packed.length)} ${where} — ${summary}.`;
};

module.exports = { runNightlyBackup, backupAddress, MAX_ATTACHMENT_BYTES, human };
