/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { parseArgs, openDb, resolvePaths } = require('./sqlite-utils');
const { createLogger } = require('../src/helpers/logger');

const logger = createLogger({ channel: 'api-support' });

function readSinglePragma(db, name, field) {
  const row = db.prepare(`PRAGMA ${name}`).get();
  if (!row) return null;
  if (field && Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  const first = Object.keys(row)[0];
  return row[first];
}

function runIntegrityCheckReport(options = {}) {
  const { dbFile: dbFileOpt } = options;
  const { dbFile: resolved } = resolvePaths({ dbFile: dbFileOpt });
  const dbFile = resolved;
  logger.info('db_check_start', 'Iniciando integrity check SQLite', { dbFile });

  if (!fs.existsSync(dbFile)) {
    throw new Error(`Base de datos no encontrada: ${dbFile}`);
  }

  const db = openDb(dbFile, { fileMustExist: true });
  try {
    const pragmas = {
      foreign_keys: Number(readSinglePragma(db, 'foreign_keys')),
      journal_mode: String(readSinglePragma(db, 'journal_mode')),
      busy_timeout: Number(readSinglePragma(db, 'busy_timeout')),
      synchronous: Number(readSinglePragma(db, 'synchronous')),
      wal_autocheckpoint: Number(readSinglePragma(db, 'wal_autocheckpoint'))
    };
    const integrity = db.prepare('PRAGMA integrity_check').all();
    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();

    return {
      dbFile: path.resolve(dbFile),
      pragmas,
      integrity,
      foreignKeyViolations: fkViolations,
      ok:
        integrity.length === 1 &&
        String(integrity[0].integrity_check || '').toLowerCase() === 'ok' &&
        fkViolations.length === 0
    };
  } finally {
    db.close();
  }
}

function cli() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = runIntegrityCheckReport({ dbFile: args.dbFile });
    logger.info('db_check_complete', 'Integrity check SQLite completado', {
      dbFile: report.dbFile,
      ok: report.ok,
      foreignKeyViolations: report.foreignKeyViolations.length
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    logger.error('db_check_fail', 'Fallo en integrity check SQLite', { error: error.message });
    console.error('Fallo en sqlite-integrity-check:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = {
  runIntegrityCheckReport
};
