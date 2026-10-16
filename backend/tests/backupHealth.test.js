const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

// ── The remedy the health screen shows ────────────────────────────────────
let lastBackupRun = null;

/**
 * The health controller requires its models inside the function, not at the
 * top, so a stub installed at load time never reaches it. The stand-ins are
 * therefore kept in place for the duration of the call.
 */
const withStubs = async (fn) => {
  const orig = Module._load;
  Module._load = function (req) {
    if (req.includes('models/JobRun')) return {
      find: () => ({ lean: async () => [] }),
      aggregate: async () => (lastBackupRun ? [{ _id: 'nightly_backup', last: lastBackupRun }] : []),
      countDocuments: async () => 0,
    };
    if (req.includes('models/Settings')) return {
      findOne: () => ({ select: () => ({ lean: async () => ({}) }) }),
    };
    if (req.includes('models/PushSubscription')) return { countDocuments: async () => 0 };
    if (req.includes('utils/scheduler')) return { DAILY_JOBS: [], dayKey: () => '2026-10-16' };
    if (req.includes('utils/push')) return { isConfigured: () => true };
    if (req.includes('utils/arkesel')) return { smsBalance: async () => ({ ok: true, balance: 61 }) };
    return orig.apply(this, arguments);
  };
  try { return await fn(); } finally { Module._load = orig; }
};

const health = require(path.join(B, 'controllers/healthController.js'));

const backupsCheck = (run) => withStubs(async () => {
  lastBackupRun = run;
  const res = { code: 200 };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  await health.systemHealth({ user: { role: 'Super Admin' } }, res);
  assert.ok(res.body?.data?.checks?.backups, `health check failed: ${res.body?.message}`);
  return res.body.data.checks.backups;
});

const hoursAgo = (n) => new Date(Date.now() - n * 3600 * 1000);

test('what the screen tells the shop to do about a failed backup', async (t) => {
  await t.test('a mail server that timed out is not reported as a missing address', async () => {
    // Word for word what the shop saw: the advice must point at the mail
    // server, not send them hunting for BACKUP_EMAIL.
    const c = await backupsCheck({
      ok: false, createdAt: hoursAgo(16), attempts: 1,
      message: 'Made the backup but could not email it to shop@x.com: Connection timeout',
    });
    assert.strictEqual(c.state, 'bad');
    assert.match(c.remedy, /mail server could not be reached/);
    assert.doesNotMatch(c.remedy, /BACKUP_EMAIL/);
  });

  await t.test('a genuinely missing address still says so', async () => {
    const c = await backupsCheck({
      ok: false, createdAt: hoursAgo(2), attempts: 1,
      message: 'No address to send a backup to.',
    });
    assert.match(c.remedy, /BACKUP_EMAIL or ADMIN_EMAIL/);
  });

  await t.test('a refused login points at the password, not the address', async () => {
    const c = await backupsCheck({
      ok: false, createdAt: hoursAgo(2), attempts: 2,
      message: 'Made the backup but could not email it: Invalid login: 535 auth failed',
    });
    assert.match(c.remedy, /app password/);
  });

  await t.test('one too big to send says to fetch it by hand', async () => {
    const c = await backupsCheck({
      ok: false, createdAt: hoursAgo(2), attempts: 1,
      message: 'Backup 31.4 MB — too large to email.',
    });
    assert.match(c.remedy, /Download one by hand/);
  });

  await t.test('a working backup offers no remedy at all', async () => {
    const c = await backupsCheck({
      ok: true, createdAt: hoursAgo(3), attempts: 1,
      message: 'Emailed 1.2 MB to shop@x.com — 4,100 records across 31 collections.',
    });
    assert.strictEqual(c.state, 'ok');
    assert.strictEqual(c.remedy, null);
  });

  await t.test('never having run is its own case', async () => {
    const c = await backupsCheck(null);
    assert.strictEqual(c.state, 'bad');
    assert.match(c.message, /No backup has ever been taken/);
    assert.match(c.remedy, /Run what is due/);
  });

  await t.test('the number of tries is reported, so a loop is visible', async () => {
    const c = await backupsCheck({
      ok: false, createdAt: hoursAgo(1), attempts: 4,
      message: 'Connection timeout',
    });
    assert.strictEqual(c.attempts, 4);
  });
});

// ── Retrying a failed backup ──────────────────────────────────────────────
test('a failed backup is tried again the same day', async (t) => {
  let rows = [];
  let backupAttempts = 0;
  let backupBehaviour = () => { throw new Error('Connection timeout'); };

  const orig = Module._load;
  Module._load = function (req) {
    if (req.includes('models/JobRun')) return {
      create: async (d) => {
        if (rows.some((r) => r.job === d.job && r.run_for === d.run_for)) {
          const e = new Error('dup'); e.code = 11000; throw e;
        }
        const row = { attempts: 1, ...d, save: async () => {} };
        rows.push(row);
        return row;
      },
      findOneAndUpdate: async (filter) => {
        const row = rows.find((r) => r.job === filter.job
          && r.run_for === filter.run_for
          && r.ok === false
          && r.finished_at && r.finished_at < filter.finished_at.$lt
          && r.attempts < filter.attempts.$lt);
        if (!row) return null;
        row.attempts += 1;
        row.finished_at = null;
        return row;
      },
      find: () => ({ lean: async () => rows }),
    };
    if (req.includes('models/Settings')) return { findOne: () => ({ select: () => ({ lean: async () => ({}) }) }) };
    if (req === 'node-cron') return { schedule: () => {} };
    return orig.apply(this, arguments);
  };
  const sched = require(path.join(B, 'utils/scheduler.js'));
  Module._load = orig;

  // Only the backup. The other daily jobs reach for collections this test
  // has no database for, and would sit there buffering.
  const real = sched.DAILY_JOBS.find((j) => j.name === 'nightly_backup');
  assert.ok(real, 'the backup job must still be in the table');
  assert.strictEqual(real.retryOnFail, true, 'and must still be marked worth retrying');
  sched.DAILY_JOBS.length = 0;
  // The job's own work is stood in for. It is required lazily inside the
  // scheduler, so loading-time stubs never reach it.
  sched.DAILY_JOBS.push({
    ...real,
    run: async () => { backupAttempts += 1; return backupBehaviour(); },
  });

  const LONG_AGO = new Date(Date.now() - 60 * 60 * 1000);

  // The backup is due from 02:00 UTC. Before then there is nothing to run,
  // so a test run at 00:30 would otherwise pass by doing nothing at all.
  const realHours = Date.prototype.getUTCHours;
  t.before(() => { Date.prototype.getUTCHours = () => 23; });
  t.after(() => { Date.prototype.getUTCHours = realHours; });

  await t.test('the first failure is recorded, not swallowed', async () => {
    rows = []; backupAttempts = 0;
    await sched.runDueJobs({ reason: 'test' });
    const run = rows.find((r) => r.job === 'nightly_backup');
    assert.ok(run, 'the backup claimed its row');
    assert.strictEqual(run.ok, false);
    assert.match(run.message, /Connection timeout/);
    assert.strictEqual(backupAttempts, 1);
  });

  await t.test('a second sweep straight afterwards does NOT retry', async () => {
    // Retrying a timeout immediately just produces another timeout.
    await sched.runDueJobs({ reason: 'test' });
    assert.strictEqual(backupAttempts, 1, 'too soon to try again');
  });

  await t.test('once enough time has passed it tries again', async () => {
    const run = rows.find((r) => r.job === 'nightly_backup');
    run.finished_at = LONG_AGO;
    await sched.runDueJobs({ reason: 'test' });
    assert.strictEqual(backupAttempts, 2);
    assert.strictEqual(run.attempts, 2);
  });

  await t.test('a retry that works is recorded as done', async () => {
    const run = rows.find((r) => r.job === 'nightly_backup');
    run.finished_at = LONG_AGO;
    backupBehaviour = () => 'Emailed 1.2 MB to shop@x.com — 4,100 records across 31 collections.';
    await sched.runDueJobs({ reason: 'test' });
    assert.strictEqual(run.ok, true);
    assert.match(run.message, /Emailed/);
  });

  await t.test('and it is not run again once it has worked', async () => {
    const before = backupAttempts;
    const run = rows.find((r) => r.job === 'nightly_backup');
    run.finished_at = LONG_AGO;
    await sched.runDueJobs({ reason: 'test' });
    assert.strictEqual(backupAttempts, before, 'a good backup is not repeated');
  });

  await t.test('it gives up after a few goes rather than hammering all day', async () => {
    rows = []; backupAttempts = 0;
    backupBehaviour = () => { throw new Error('Connection timeout'); };
    for (let i = 0; i < 10; i += 1) {
      const run = rows.find((r) => r.job === 'nightly_backup');
      if (run) run.finished_at = LONG_AGO;
      await sched.runDueJobs({ reason: 'test' });
    }
    assert.ok(backupAttempts <= 4, `tried ${backupAttempts} times`);
    assert.ok(backupAttempts >= 2, 'but it did try more than once');
  });
});
