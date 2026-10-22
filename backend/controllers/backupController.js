const zlib = require('zlib');
const { promisify } = require('util');
const { createBackup, getBackupHistory, restoreFromBackup } = require('../utils/backup');
const { listBackups, cloudConfigured, uploadBackup, pruneBackups } = require('../utils/cloudBackup');
/**
 * Required at the top, not inside the handler.
 *
 * A require that resolves when the request runs is a require that misses
 * every stand-in a test put in place beforehand — so the test quietly got
 * the real models and sat waiting ten seconds for a database that is not
 * there. This is the third time that trap has been walked into in this
 * codebase; the fix is always the same.
 */
const Settings = require('../models/Settings');
const { sendEmail, mailAccount } = require('../utils/email');
const { backupAddress, MAX_ATTACHMENT_BYTES, human } = require('../utils/autoBackup');

const gzip = promisify(zlib.gzip);

/**
 * POST /api/backup/create — the whole database, as a file to download.
 */
const createManualBackup = async (req, res) => {
  try {
    const backup = await createBackup();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    // What is in it, without having to open the file.
    res.setHeader('X-Backup-Collections', String(backup.meta.collection_count));
    res.setHeader('X-Backup-Documents', String(backup.meta.document_count));
    return res.end(backup.json);
  } catch (err) {
    console.error('Create backup error:', err.stack || err.message);
    return res.status(500).json({
      success: false,
      message: `Backup failed: ${err.message}`,
    });
  }
};

/** GET /api/backup/summary — what a backup would contain, before taking one. */
const getSummary = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { listCollections } = require('../utils/backup');
    const db = mongoose.connection.db;
    const names = await listCollections();

    const counts = {};
    let documents = 0;
    for (const name of names) {
      const n = await db.collection(name).countDocuments();
      counts[name] = n;
      documents += n;
    }

    return res.status(200).json({
      success: true,
      data: {
        database: db.databaseName,
        collection_count: names.length,
        document_count: documents,
        counts,
      },
    });
  } catch (err) {
    console.error('Backup summary error:', err.stack || err.message);
    return res.status(500).json({ success: false, message: `Could not read the database: ${err.message}` });
  }
};

/** GET /api/backup/history */
const getHistory = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: getBackupHistory() });
  } catch (err) {
    console.error('Get backup history error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/backup/restore — Super Admin only.
 *
 * Takes the backup file's contents as the request body, whether that arrives
 * as text or as an already-parsed object.
 */
const restoreBackup = async (req, res) => {
  try {
    const body = req.body;
    const empty = body == null
      || (typeof body === 'string' && body.trim() === '')
      || (typeof body === 'object' && Object.keys(body).length === 0);
    if (empty) {
      return res.status(400).json({
        success: false,
        message: 'No backup file was received. Choose a backup file and try again.',
      });
    }

    const results = await restoreFromBackup(body);
    return res.status(200).json({
      success: true,
      message: `Restored ${results.documents_restored} records across `
        + `${results.collections_restored} collections.`,
      data: results,
    });
  } catch (err) {
    console.error('Restore backup error:', err.stack || err.message);
    return res.status(400).json({
      success: false,
      message: `Restore failed: ${err.message}`,
    });
  }
};

/**
 * GET /api/backup/cloud — the copies that are actually off this server.
 *
 * The history list below is written to the container's disk, which Render
 * wipes on every deploy, so on a fresh boot it says "No backup history"
 * whether or not backups have been running for months. This reads the copies
 * themselves, from Cloudinary, which is the only honest answer to "are the
 * backups working".
 *
 * Each link is signed here and now with the API secret. The files are stored
 * `authenticated`, so there is no public URL to leak — a shop's whole
 * database at a guessable address would be worse than no backup at all.
 */
const getCloudBackups = async (req, res) => {
  try {
    if (!cloudConfigured()) {
      return res.status(200).json({
        success: true,
        data: {
          configured: false,
          backups: [],
          message: 'Off-site backups are not set up on this server.',
        },
      });
    }

    const backups = await listBackups();
    return res.status(200).json({
      success: true,
      data: { configured: true, backups },
    });
  } catch (err) {
    console.error('Cloud backup list error:', err.stack || err.message);
    return res.status(502).json({
      success: false,
      message: `Could not read the off-site copies: ${err.message}`,
    });
  }
};

/**
 * POST /api/backup/email — send one now, to find out whether it works.
 *
 * The nightly job runs at an hour nobody is awake for, and "did last night's
 * backup arrive?" was a question answered by waiting until tomorrow and
 * looking. Worse, a run already claimed for today will not run again, so
 * there was no honest way to test a change to the mail settings at all.
 *
 * This does the same work the job does — take a backup, compress it, attach
 * it — without touching the job's record of the night, and reports in words
 * what happened. An address can be given, so an owner can send one to
 * themselves without changing where tonight's goes.
 */
const emailBackupNow = async (req, res) => {
  try {
    const settings = await Settings.findOne().select('company_name company_email').lean();
    const to = String(req.body?.to || '').trim() || backupAddress(settings);
    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'There is no address to send it to. Put one in Settings → Company → Email, '
          + 'or type one here.',
      });
    }

    const backup = await createBackup();
    const packed = await gzip(Buffer.from(backup.json, 'utf8'));
    const name = `${backup.filename.replace(/\.json$/, '')}.json.gz`;
    const shop = settings?.company_name || 'ITTEK Solution';
    const summary = `${backup.meta.document_count} records across ${backup.meta.collection_count} collections`;

    if (packed.length > MAX_ATTACHMENT_BYTES) {
      return res.status(400).json({
        success: false,
        message: `The backup is ${human(packed.length)}, too large to email. Use the off-site `
          + 'copy on this screen instead.',
      });
    }

    const account = await mailAccount();
    await sendEmail({
      to,
      subject: `${shop} — backup ${backup.filename.replace(/^ittek-backup-/, '').replace(/\.json$/, '')}`,
      html: `<p>Backup of <strong>${shop}</strong>, sent by hand from the Backup screen.</p>
             <p>${summary}. Attached, compressed, as <code>${name}</code> (${human(packed.length)}).</p>
             <p style="color:#666;font-size:13px">Keep these. To restore one, unzip it first and
             upload the .json inside on the Backup screen.</p>`,
      attachments: [{ filename: name, content: packed }],
    });

    return res.status(200).json({
      success: true,
      message: `Sent ${human(packed.length)} to ${to}.`,
      data: {
        to,
        size: human(packed.length),
        summary,
        // Which route carried it, so a setting that did not take is visible
        // rather than guessed at.
        via: account.provider === 'brevo' ? 'Brevo (HTTPS)' : `${account.host}:${account.port}`,
      },
    });
  } catch (err) {
    console.error('Email backup error:', err.stack || err.message);
    // The mail server's own words. "Failed" would leave somebody guessing at
    // exactly the moment they are trying to fix this.
    return res.status(400).json({
      success: false,
      message: `Could not email it: ${err.message}`,
    });
  }
};

/**
 * POST /api/backup/offsite — put a copy off this server now.
 *
 * The off-site copy is the one that does not depend on mail working, which
 * makes it the one worth being sure about. Waiting for the small hours to
 * find out whether it uploads is the same bad loop as waiting to find out
 * whether an email sends, and the answer when it fails has to be the
 * reason, not a red square.
 *
 * It does what the nightly job does and leaves the job's record of the
 * night alone.
 */
const backupOffsiteNow = async (req, res) => {
  try {
    if (!cloudConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Cloudinary is not set up on this server. It needs CLOUDINARY_CLOUD_NAME, '
          + 'CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET — or the single CLOUDINARY_URL.',
      });
    }

    const backup = await createBackup();
    const packed = await gzip(Buffer.from(backup.json, 'utf8'));
    const name = `${backup.filename.replace(/\.json$/, '')}.json.gz`;

    const up = await uploadBackup(packed, name);
    // Only after a success, so a prune fault can never read as a failed
    // backup.
    await pruneBackups().catch(() => {});

    return res.status(200).json({
      success: true,
      message: `${human(packed.length)} is off this server.`,
      data: {
        filename: name,
        size: human(packed.length),
        url: up.url,
        summary: `${backup.meta.document_count} records across ${backup.meta.collection_count} collections`,
      },
    });
  } catch (err) {
    console.error('Off-site backup error:', err.stack || err.message);
    // Cloudinary's own words. A shop told only that it "failed" cannot act.
    return res.status(400).json({
      success: false,
      message: `Could not put it off-site: ${err.message}`,
    });
  }
};

module.exports = {
  createManualBackup, getSummary, getHistory, restoreBackup, getCloudBackups,
  emailBackupNow, backupOffsiteNow,
};
