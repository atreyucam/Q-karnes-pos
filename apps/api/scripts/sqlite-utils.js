const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { resolveDbFilePath, ensureDbDirectory, resolveDefaultBackupDir } = require('../src/config/dbFile');

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function openDb(filePath, options = {}) {
  ensureDbDirectory(filePath);
  return new Database(filePath, {
    readonly: Boolean(options.readonly),
    fileMustExist: Boolean(options.fileMustExist)
  });
}

function runIntegrityCheck(filePath) {
  const db = openDb(filePath, { fileMustExist: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    const fk = db.prepare('PRAGMA foreign_key_check').all();
    const ok = integrity.length === 1 && String(integrity[0].integrity_check || '').toLowerCase() === 'ok';
    return {
      ok,
      integrity,
      foreignKeyViolations: fk
    };
  } finally {
    db.close();
  }
}

function assertFileExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(message || `Archivo no encontrado: ${filePath}`);
  }
}

function resolvePaths(args = {}) {
  const resolveOptions = { nodeEnv: process.env.NODE_ENV };
  if (Object.prototype.hasOwnProperty.call(args, 'dbFile') && args.dbFile !== undefined && args.dbFile !== null) {
    resolveOptions.dbFileEnv = args.dbFile;
  }
  const dbFile = resolveDbFilePath(resolveOptions);
  const backupDir = args.outDir
    ? path.resolve(process.cwd(), args.outDir)
    : resolveDefaultBackupDir(dbFile);
  return { dbFile, backupDir };
}

module.exports = {
  nowStamp,
  parseArgs,
  openDb,
  runIntegrityCheck,
  assertFileExists,
  resolvePaths
};
