const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let runtimeCache = null;
const apiRoot = path.resolve(__dirname, '..', '..');

function sanitizeSuiteName(name) {
  return String(name || 'suite')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'suite';
}

function buildRunId(suiteName) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `${sanitizeSuiteName(suiteName)}-${process.pid}-${stamp}`;
}

function fileArtifacts(dbFile) {
  return [dbFile, `${dbFile}-wal`, `${dbFile}-shm`];
}

function configureTestRuntime(options = {}) {
  if (runtimeCache) return runtimeCache;

  if (process.cwd() !== apiRoot) {
    process.chdir(apiRoot);
  }

  const suiteName = sanitizeSuiteName(options.suiteName || process.env.TEST_SUITE || 'api-tests');
  const runId = options.runId || process.env.TEST_RUN_ID || buildRunId(suiteName);
  const dataDir = path.resolve(process.cwd(), 'data', 'test-runs');
  const dbFile = options.dbFile
    ? path.resolve(process.cwd(), options.dbFile)
    : path.join(dataDir, `${runId}.sqlite`);

  fs.mkdirSync(path.dirname(dbFile), { recursive: true });

  process.env.NODE_ENV = 'test';
  process.env.TEST_RUN_ID = runId;
  process.env.DB_FILE = dbFile;

  runtimeCache = {
    suiteName,
    runId,
    dbFile,
    artifacts: fileArtifacts(dbFile)
  };

  return runtimeCache;
}

function getRuntime() {
  return runtimeCache || configureTestRuntime();
}

function removeRuntimeArtifacts(dbFile) {
  for (const filePath of fileArtifacts(dbFile)) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

async function destroyKnexSafe(db) {
  if (db && typeof db.destroy === 'function') {
    await db.destroy();
  }
}

async function cleanupRuntime(options = {}) {
  const runtime = getRuntime();
  await destroyKnexSafe(options.db);
  removeRuntimeArtifacts(options.dbFile || runtime.dbFile);
}

function snapshotFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  return {
    filePath,
    exists: true,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    sha1: crypto.createHash('sha1').update(buffer).digest('hex')
  };
}

module.exports = {
  configureTestRuntime,
  getRuntime,
  cleanupRuntime,
  destroyKnexSafe,
  removeRuntimeArtifacts,
  snapshotFile
};
