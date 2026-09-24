const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { EJSON } = require('bson');

const FORMAT = 'ittek-backup';
const VERSION = 2;

/** Collections MongoDB keeps for itself — never ours to copy or overwrite. */
const isSystem = (name) => name.startsWith('system.') || name.startsWith('__');

const backupDir = () => path.resolve(process.env.BACKUP_PATH || './backups');

/**
 * Every collection in the database, not merely the ones with a model loaded.
 *
 * This used to read mongoose.connection.collections, which only knows about
 * models that happen to be registered in the running process. Anything else —
 * a collection from an older version, one written by a script, a model not
 * imported on that code path — was silently absent from a backup that claimed
 * to hold everything.
 */
const listCollections = async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Not connected to the database.');
  const infos = await db.listCollections({}, { nameOnly: true }).toArray();
  return infos.map((i) => i.name).filter((n) => !isSystem(n)).sort();
};

/**
 * Take a full copy of the database.
 *
 * Written as MongoDB Extended JSON, NOT plain JSON. Plain JSON.stringify turns
 * an ObjectId into a bare string and a Date into a quoted timestamp, so a
 * restore from such a file produced a database that looked full but was
 * broken: every _id a string, so nothing joined to anything, and every date
 * text, so no report by date found a thing. Extended JSON round-trips both
 * exactly.
 *
 * @returns {Promise<{ filename, json, meta }>}
 */
const createBackup = async () => {
  const names = await listCollections();
  const db = mongoose.connection.db;

  const collections = {};
  const counts = {};
  let documents = 0;

  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    collections[name] = docs;
    counts[name] = docs.length;
    documents += docs.length;
  }

  const now = new Date();
  const meta = {
    format: FORMAT,
    version: VERSION,
    created_at: now.toISOString(),
    database: db.databaseName,
    collection_count: names.length,
    document_count: documents,
    counts,
  };

  // Canonical mode: types are written out in full rather than guessed at on
  // the way back in.
  const json = EJSON.stringify({ meta, collections }, { relaxed: false });

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `ittek-backup-${timestamp}.json`;

  // A copy on disk is a convenience, not the deliverable — the download is.
  // On a hosted container the disk is wiped on every deploy, so a failure to
  // write here must never fail the backup the owner is standing there waiting
  // for.
  let savedTo = null;
  try {
    const dir = backupDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, json);
    savedTo = filePath;

    const historyFile = path.join(dir, 'history.json');
    let history = [];
    if (fs.existsSync(historyFile)) {
      try { history = JSON.parse(fs.readFileSync(historyFile, 'utf8')); } catch { history = []; }
    }
    history.unshift({
      filename,
      created_at: meta.created_at,
      size_bytes: Buffer.byteLength(json),
      collections: meta.collection_count,
      documents: meta.document_count,
    });
    fs.writeFileSync(historyFile, JSON.stringify(history.slice(0, 20), null, 2));
  } catch (err) {
    console.warn('Backup written but not saved to disk:', err.message);
  }

  console.log(`Backup created: ${filename} — ${names.length} collections, ${documents} documents`);
  return { filename, json, meta, path: savedTo };
};

const getBackupHistory = () => {
  const historyFile = path.join(backupDir(), 'history.json');
  if (!fs.existsSync(historyFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  } catch {
    return [];
  }
};

/**
 * Read a backup file into { meta, collections }, whatever shape it arrived in.
 *
 * Accepts the current format, the older bare map of collection to documents,
 * and either a raw string or an already-parsed body.
 */
const parseBackup = (input) => {
  let root;
  if (typeof input === 'string') {
    if (!input.trim()) throw new Error('The backup file is empty.');
    try {
      root = EJSON.parse(input, { relaxed: false });
    } catch {
      // The parser's own message names a character position, which tells the
      // person holding the file nothing they can act on.
      throw new Error('That file could not be read. Choose the .json file a backup produced.');
    }
  } else if (input && typeof input === 'object') {
    // Express has already turned the body into plain objects; this puts the
    // $oid and $date wrappers back into real types.
    root = EJSON.deserialize(EJSON.serialize(input), { relaxed: false });
  } else {
    throw new Error('No backup data was sent.');
  }

  if (root && root.collections && typeof root.collections === 'object') {
    return { meta: root.meta || {}, collections: root.collections };
  }

  // The old format: the whole object was the collections.
  if (root && typeof root === 'object' && !Array.isArray(root)) {
    const collections = {};
    for (const [name, docs] of Object.entries(root)) {
      if (Array.isArray(docs)) collections[name] = docs;
    }
    if (Object.keys(collections).length > 0) {
      return { meta: { version: 1, legacy: true }, collections };
    }
  }

  throw new Error('That file is not an ITTEK backup.');
};

/**
 * Put a backup back.
 *
 * Every collection in the file is emptied and rewritten — INCLUDING the ones
 * that are empty in the backup. Skipping those, as this used to, left today's
 * rows sitting in a collection the backup says is empty, so the restored
 * system was never actually the system that was backed up.
 *
 * A snapshot of what is there now is taken first. Restoring is the one action
 * that destroys everything at once, and doing it from the wrong file should
 * not be the end of the business.
 */
const restoreFromBackup = async (input, { safetyCopy = true } = {}) => {
  const { meta, collections } = parseBackup(input);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Not connected to the database.');

  const names = Object.keys(collections).filter((n) => !isSystem(n));
  if (names.length === 0) throw new Error('That backup holds no collections.');

  let safety = null;
  if (safetyCopy) {
    try {
      const before = await createBackup();
      safety = before.filename;
    } catch (err) {
      console.warn('Could not take a safety copy before restoring:', err.message);
    }
  }

  const results = {};
  let restored = 0;
  let failed = 0;

  for (const name of names) {
    const docs = collections[name];
    if (!Array.isArray(docs)) continue;
    try {
      const collection = db.collection(name);
      await collection.deleteMany({});
      if (docs.length > 0) {
        // In batches: one enormous insert can exceed the wire limit, and
        // unordered lets a single bad document through without taking the
        // rest of the collection down with it.
        const BATCH = 500;
        for (let i = 0; i < docs.length; i += BATCH) {
          await collection.insertMany(docs.slice(i, i + BATCH), { ordered: false });
        }
      }
      results[name] = { restored: docs.length };
      restored += docs.length;
    } catch (err) {
      results[name] = { error: err.message };
      failed += 1;
    }
  }

  // Anything in the database the backup says nothing about is left alone, but
  // it is named: after a restore those rows are not part of the picture the
  // backup describes, and someone should know they are there.
  let untouched = [];
  try {
    const present = await listCollections();
    untouched = present.filter((n) => !names.includes(n));
  } catch { /* reporting only */ }

  return {
    from: {
      created_at: meta.created_at || null,
      version: meta.version || 1,
      legacy: !!meta.legacy,
    },
    collections_restored: names.length - failed,
    collections_failed: failed,
    documents_restored: restored,
    untouched_collections: untouched,
    safety_backup: safety,
    detail: results,
  };
};

module.exports = {
  createBackup,
  getBackupHistory,
  restoreFromBackup,
  parseBackup,
  listCollections,
  FORMAT,
  VERSION,
};
