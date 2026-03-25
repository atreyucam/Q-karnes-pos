/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { nowStamp, parseArgs, resolvePaths, openDb, runIntegrityCheck, assertFileExists } = require('./sqlite-utils');
const { createLogger } = require('../src/helpers/logger');

const logger = createLogger({ channel: 'api-support' });

function escapeSqlString(input) {
  return String(input).replace(/'/g, "''");
}

function createBackup(options = {}) {
  const { dbFile: dbFileOpt, outDir, label } = options;
  const { dbFile, backupDir } = resolvePaths({ dbFile: dbFileOpt, outDir });
  logger.info('backup_start', 'Iniciando backup SQLite', { dbFile, backupDir, label: label || 'manual' });

  assertFileExists(dbFile, `No existe base de datos para backup: ${dbFile}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const safeLabel = label ? String(label).replace(/[^a-zA-Z0-9-_]/g, '-') : 'manual';
  const backupFile = path.join(backupDir, `qkarnes-backup-${safeLabel}-${nowStamp()}.sqlite`);

  const db = openDb(dbFile, { fileMustExist: true });
  try {
    db.pragma('wal_checkpoint(FULL)');
    db.exec(`VACUUM INTO '${escapeSqlString(backupFile)}'`);
  } finally {
    db.close();
  }

  const integrity = runIntegrityCheck(backupFile);
  if (!integrity.ok) {
    throw new Error(`Backup generado pero inválido. Revise: ${backupFile}`);
  }

  const stats = fs.statSync(backupFile);
  logger.info('backup_success', 'Backup SQLite completado', {
    dbFile: path.resolve(dbFile),
    backupFile: path.resolve(backupFile),
    sizeBytes: stats.size
  });

  return {
    ok: true,
    dbFile: path.resolve(dbFile),
    backupFile: path.resolve(backupFile),
    sizeBytes: stats.size
  };
}

function cli() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = createBackup({
      dbFile: args.dbFile,
      outDir: args.outDir,
      label: args.label
    });
    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    logger.error('backup_fail', 'Fallo creando backup SQLite', { error: error.message });
    console.error('Fallo en sqlite-backup:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = {
  createBackup
};
