const { createBackup, getBackupHistory, restoreFromBackup } = require('../utils/backup');

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

module.exports = { createManualBackup, getSummary, getHistory, restoreBackup };
