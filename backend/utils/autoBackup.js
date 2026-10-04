const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

/**
 * A backup that happens without anybody remembering to make one.
 *
 * Backing up was a button. A button gets pressed when somebody thinks of it,
 * which is not a schedule — and the shop's entire books live in one database
 * with a "Clear All Data" button three screens away. The failure this guards
 * against is the one that cannot be undone.
 *
 * It is emailed, because a copy written to the container's disk is not a
 * backup: Render wipes that disk on every deploy, so the copy dies with the
 * thing it was meant to survive. Email puts it on a different computer owned
 * by a different company, which is the whole point.
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
 * Make tonight's backup and send it somewhere safe.
 *
 * Returns a sentence describing what happened, which the job log keeps — so
 * "the backups are working" is a question with an answer rather than a hope.
 */
const runNightlyBackup = async () => {
  const { createBackup } = require('./backup');
  const { sendEmail } = require('./email');
  const Settings = require('../models/Settings');
  const { notifyOwners } = require('./notify');

  const settings = await Settings.findOne().select('company_name company_email').lean();
  const to = process.env.BACKUP_EMAIL
    || process.env.ADMIN_EMAIL
    || settings?.company_email
    || process.env.EMAIL_USER;

  if (!to) {
    // Said out loud rather than failing quietly, because a backup nobody is
    // told about is indistinguishable from no backup.
    await notifyOwners({
      type: 'system',
      title: 'Backup has nowhere to go',
      message: 'Set an email address for backups in Settings, or nothing is being kept.',
      link: '/settings',
      tag: 'backup-no-address',
    }).catch(() => {});
    return 'No address to send a backup to.';
  }

  const backup = await createBackup();
  const raw = Buffer.from(backup.json, 'utf8');
  const packed = await gzip(raw);
  const name = `${backup.filename.replace(/\.json$/, '')}.json.gz`;
  const shop = settings?.company_name || 'ITTEK Solution';
  const when = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });

  const summary = `${backup.meta.document_count} records across ${backup.meta.collection_count} collections`;

  if (packed.length > MAX_ATTACHMENT_BYTES) {
    // Too big to post. Better to say so tonight than to discover it on the
    // morning somebody needs the backup.
    await notifyOwners({
      type: 'system',
      title: 'Backup too large to email',
      message: `Tonight's backup is ${human(packed.length)} — too big to send. Download one by hand from Settings.`,
      link: '/backup',
      tag: 'backup-too-large',
    }).catch(() => {});
    await sendEmail({
      to,
      subject: `${shop} — backup too large to attach (${human(packed.length)})`,
      html: `<p>Tonight's backup holds ${summary} and compresses to ${human(packed.length)}, which is too large to email.</p>
             <p>Please download it by hand from the Backup screen, and consider clearing records you no longer need.</p>`,
    }).catch(() => {});
    return `Backup ${human(packed.length)} — too large to email.`;
  }

  await sendEmail({
    to,
    subject: `${shop} — backup ${backup.filename.replace(/^ittek-backup-/, '').replace(/\.json$/, '')}`,
    html: `<p>Automatic backup of <strong>${shop}</strong>, taken ${when}.</p>
           <p>${summary}. Attached, compressed, as <code>${name}</code> (${human(packed.length)}).</p>
           <p style="color:#666;font-size:13px">Keep these. Restoring one is done from the Backup screen —
           unzip it first, then upload the .json inside.</p>`,
    attachments: [{ filename: name, content: packed }],
  });

  return `Emailed ${human(packed.length)} to ${to} — ${summary}.`;
};

module.exports = { runNightlyBackup, MAX_ATTACHMENT_BYTES, human };
