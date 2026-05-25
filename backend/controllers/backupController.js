const { createBackup, getBackupHistory, restoreFromBackup } = require('../utils/backup');

/**
 * POST /api/backup/create
 */
const createManualBackup = async (req, res) => {
  try {
    const backup = await createBackup();

    // Send as downloadable JSON file
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    return res.end(JSON.stringify(backup.data, null, 2));
  } catch (err) {
    console.error('Create backup error:', err.message);
    return res.status(500).json({ success: false, message: 'Backup failed.' });
  }
};

/**
 * GET /api/backup/history
 */
const getHistory = async (req, res) => {
  try {
    const history = getBackupHistory();
    return res.status(200).json({ success: true, data: history });
  } catch (err) {
    console.error('Get backup history error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/backup/restore (Super Admin only)
 */
const restoreBackup = async (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid backup data.' });
    }

    const results = await restoreFromBackup(backupData);
    return res.status(200).json({
      success: true,
      message: 'Restore complete.',
      data: results,
    });
  } catch (err) {
    console.error('Restore backup error:', err.message);
    return res.status(500).json({ success: false, message: 'Restore failed.' });
  }
};

module.exports = { createManualBackup, getHistory, restoreBackup };
