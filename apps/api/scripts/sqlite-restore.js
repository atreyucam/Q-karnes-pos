/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const {
  nowStamp,
  parseArgs,
  resolvePaths,
  runIntegrityCheck,
  assertFileExists
} = require('./sqlite-utils');
const { createLogger } = require('../src/helpers/logger');

const logger = createLogger({ channel: 'api-support' });

function copyFileAtomic(source, target) {
  const temp = `${target}.restore.tmp`;
  fs.copyFileSync(source, temp);
  fs.renameSync(temp, target);
}

function restoreBackup(options = {}) {
  const {
    file,
    dbFile: dbFileOpt,
    outDir,
    confirm = false,
    force = false
  } = options;

  const { dbFile, backupDir } = resolvePaths({ dbFile: dbFileOpt, outDir });
  const restoreFile = file ? path.resolve(process.cwd(), file) : null;
  logger.warn('restore_start', 'Intento de restore SQLite', {
    restoreFile,
    dbFile,
    backupDir,
    force: Boolean(force),
    confirm: Boolean(confirm)
  });

  if (!restoreFile) {
    throw new Error('Debe indicar --file <ruta_backup.sqlite>');
  }
  if (!confirm) {
    throw new Error('Restore bloqueado: confirme explícitamente con --yes');
  }

  assertFileExists(restoreFile, `No existe backup origen: ${restoreFile}`);
  const restoreIntegrity = runIntegrityCheck(restoreFile);
  if (!restoreIntegrity.ok) {
    throw new Error('El backup seleccionado no pasó integrity_check / foreign_key_check');
  }

  const walFile = `${dbFile}-wal`;
  const shmFile = `${dbFile}-shm`;
  const hasActiveWal = fs.existsSync(walFile) && fs.statSync(walFile).size > 0;
  if (hasActiveWal && !force) {
    logger.warn('restore_blocked_wal', 'Restore bloqueado por WAL activo', { dbFile, walFile });
    throw new Error('Restore bloqueado: se detectó WAL activo. Detenga API/app o use --force bajo su responsabilidad.');
  }

  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  let safeguard = null;
  if (fs.existsSync(dbFile)) {
    safeguard = path.join(backupDir, `qkarnes-restore-safeguard-${nowStamp()}.sqlite`);
    fs.copyFileSync(dbFile, safeguard);
  }

  copyFileAtomic(restoreFile, dbFile);
  if (fs.existsSync(walFile)) fs.rmSync(walFile, { force: true });
  if (fs.existsSync(shmFile)) fs.rmSync(shmFile, { force: true });

  const postIntegrity = runIntegrityCheck(dbFile);
  if (!postIntegrity.ok) {
    logger.error('restore_fail_integrity', 'Restore aplicado pero sin integridad válida', { dbFile });
    throw new Error('Restore aplicado pero integrity_check falló en base destino');
  }

  logger.critical('restore_success', 'Restore SQLite completado', {
    restoredFrom: restoreFile,
    dbFile: path.resolve(dbFile),
    safeguardBackup: safeguard ? path.resolve(safeguard) : null
  });

  return {
    ok: true,
    restoredFrom: restoreFile,
    dbFile: path.resolve(dbFile),
    safeguardBackup: safeguard ? path.resolve(safeguard) : null
  };
}

function cli() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = restoreBackup({
      file: args.file,
      dbFile: args.dbFile,
      outDir: args.outDir,
      confirm: args.yes === true,
      force: args.force === true
    });
    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    logger.error('restore_fail', 'Fallo ejecutando restore SQLite', { error: error.message });
    console.error('Fallo en sqlite-restore:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = {
  restoreBackup
};
