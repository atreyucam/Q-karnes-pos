const fs = require('fs');
const path = require('path');
const { ensureSupportDirectories } = require('../../config/supportPaths');
const { createLogger } = require('../../helpers/logger');
const { nowStamp } = require('../../../scripts/sqlite-utils');
const { runIntegrityCheckReport } = require('../../../scripts/sqlite-integrity-check');
const { createBackup } = require('../../../scripts/sqlite-backup');

const logger = createLogger({ channel: 'api-support' });
const RESTORE_MANIFEST_NAME = 'restore-pending.json';
const RESTORE_STAGED_NAME = 'restore-pending.sqlite';

function formatRestoreManifest(manifest) {
  if (!manifest) return null;
  return {
    status: manifest.status || 'PENDING_RESTART',
    requested_at: manifest.requested_at,
    requested_by: manifest.requested_by || null,
    source_backup: manifest.source_backup || null,
    safeguard_backup: manifest.safeguard_backup || null,
    requiere_reinicio: true
  };
}

function getSystemPaths(options = {}) {
  const dirs = ensureSupportDirectories(options);
  return {
    ...dirs,
    restoreManifestFile: path.join(dirs.supportDir, RESTORE_MANIFEST_NAME),
    restoreStagedFile: path.join(dirs.supportDir, RESTORE_STAGED_NAME)
  };
}

function safeFileStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (_) {
    return null;
  }
}

function fileSizeSafe(filePath) {
  const stat = safeFileStat(filePath);
  return stat ? stat.size : 0;
}

function ensureBackupFilename(filename) {
  const raw = String(filename || '').trim();
  if (!raw) {
    throw new Error('Debe indicar un nombre de backup válido');
  }

  if (raw !== path.basename(raw) || !raw.toLowerCase().endsWith('.sqlite')) {
    throw new Error('Nombre de backup inválido');
  }

  return raw;
}

function resolveBackupFile(filename, options = {}) {
  const safeName = ensureBackupFilename(filename);
  const paths = getSystemPaths(options);
  const backupFile = path.join(paths.backupDir, safeName);
  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup no encontrado: ${safeName}`);
  }
  return {
    filename: safeName,
    fullPath: backupFile,
    sizeBytes: fileSizeSafe(backupFile)
  };
}

function classifyBackup(filename) {
  const name = String(filename || '').toLowerCase();
  if (name.includes('restore-safeguard') || name.includes('pre-restore')) return 'SAFEGUARD';
  if (name.includes('soporte')) return 'SOPORTE';
  return 'MANUAL';
}

function listBackupFiles(options = {}) {
  const paths = getSystemPaths(options);
  if (!fs.existsSync(paths.backupDir)) return [];

  return fs.readdirSync(paths.backupDir)
    .filter((name) => name.toLowerCase().endsWith('.sqlite'))
    .map((filename) => {
      const fullPath = path.join(paths.backupDir, filename);
      const stat = fs.statSync(fullPath);
      return {
        filename,
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString(),
        tipo: classifyBackup(filename)
      };
    })
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
}

function readPendingRestoreManifest(options = {}) {
  const paths = getSystemPaths(options);
  if (!fs.existsSync(paths.restoreManifestFile)) return null;

  try {
    const raw = fs.readFileSync(paths.restoreManifestFile, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    logger.warn('restore_manifest_invalid', 'No se pudo leer restore pendiente', {
      file: paths.restoreManifestFile,
      error: error.message
    });
    return null;
  }
}

function writePendingRestoreManifest(manifest, options = {}) {
  const paths = getSystemPaths(options);
  fs.mkdirSync(paths.supportDir, { recursive: true });
  fs.writeFileSync(paths.restoreManifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return paths.restoreManifestFile;
}

function removeRestoreArtifacts(paths) {
  for (const filePath of [paths.restoreManifestFile, paths.restoreStagedFile]) {
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  }
}

function archiveRestoreManifest(prefix, manifest, paths) {
  const archiveFile = path.join(paths.supportDir, `${prefix}-${nowStamp()}.json`);
  fs.writeFileSync(archiveFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return archiveFile;
}

function copyFileAtomic(source, target) {
  const tempFile = `${target}.restore.tmp`;
  fs.copyFileSync(source, tempFile);
  fs.renameSync(tempFile, target);
}

function stageRestoreFromBackup(payload, options = {}) {
  const backup = resolveBackupFile(payload.filename, options);
  const paths = getSystemPaths(options);
  const integrity = runIntegrityCheckReport({ dbFile: backup.fullPath });
  if (!integrity.ok) {
    throw new Error('El backup seleccionado no pasó la verificación de integridad');
  }

  const safeguard = createBackup({
    dbFile: paths.dbFile,
    outDir: paths.backupDir,
    label: 'pre-restore'
  });

  if (fs.existsSync(paths.restoreStagedFile)) {
    fs.rmSync(paths.restoreStagedFile, { force: true });
  }

  fs.copyFileSync(backup.fullPath, paths.restoreStagedFile);

  const manifest = {
    version: 1,
    status: 'PENDING_RESTART',
    requested_at: new Date().toISOString(),
    requested_by: payload.requestedBy || null,
    source_backup: {
      filename: backup.filename,
      path: backup.fullPath,
      sizeBytes: backup.sizeBytes
    },
    staged_file: paths.restoreStagedFile,
    safeguard_backup: safeguard.backupFile,
    db_file: paths.dbFile
  };

  writePendingRestoreManifest(manifest, options);
  logger.warn('restore_staged', 'Restauración SQLite programada para próximo arranque', {
    dbFile: paths.dbFile,
    sourceBackup: backup.fullPath,
    safeguardBackup: safeguard.backupFile
  });

  return formatRestoreManifest(manifest);
}

function applyPendingRestoreIfNeeded(options = {}) {
  const paths = getSystemPaths(options);
  const manifest = readPendingRestoreManifest(options);
  if (!manifest) {
    return {
      applied: false,
      pending: null
    };
  }

  const stagedFile = manifest.staged_file || paths.restoreStagedFile;
  if (!fs.existsSync(stagedFile)) {
    const failedArchive = archiveRestoreManifest(
      'restore-missing-staged',
      {
        ...manifest,
        failed_at: new Date().toISOString(),
        error: 'Archivo staged no encontrado'
      },
      paths
    );
    removeRestoreArtifacts(paths);
    return {
      applied: false,
      pending: null,
      failedArchive
    };
  }

  const stagedIntegrity = runIntegrityCheckReport({ dbFile: stagedFile });
  if (!stagedIntegrity.ok) {
    const failedArchive = archiveRestoreManifest(
      'restore-invalid-staged',
      {
        ...manifest,
        failed_at: new Date().toISOString(),
        error: 'Archivo staged sin integridad válida'
      },
      paths
    );
    removeRestoreArtifacts(paths);
    throw new Error(`Restore pendiente inválido. Revise ${failedArchive}`);
  }

  const walFile = `${paths.dbFile}-wal`;
  const shmFile = `${paths.dbFile}-shm`;

  try {
    copyFileAtomic(stagedFile, paths.dbFile);
    if (fs.existsSync(walFile)) fs.rmSync(walFile, { force: true });
    if (fs.existsSync(shmFile)) fs.rmSync(shmFile, { force: true });

    const postIntegrity = runIntegrityCheckReport({ dbFile: paths.dbFile });
    if (!postIntegrity.ok) {
      if (manifest.safeguard_backup && fs.existsSync(manifest.safeguard_backup)) {
        copyFileAtomic(manifest.safeguard_backup, paths.dbFile);
        if (fs.existsSync(walFile)) fs.rmSync(walFile, { force: true });
        if (fs.existsSync(shmFile)) fs.rmSync(shmFile, { force: true });
      }
      throw new Error('La base restaurada no pasó integridad; se revirtió al safeguard');
    }

    const archivedFile = archiveRestoreManifest(
      'restore-applied',
      {
        ...manifest,
        applied_at: new Date().toISOString(),
        status: 'APPLIED'
      },
      paths
    );
    removeRestoreArtifacts(paths);
    logger.critical('restore_applied', 'Restore SQLite aplicado al iniciar API', {
      dbFile: paths.dbFile,
      sourceBackup: manifest.source_backup?.path || null,
      safeguardBackup: manifest.safeguard_backup || null,
      archiveFile: archivedFile
    });

    return {
      applied: true,
      archiveFile: archivedFile,
      pending: null
    };
  } catch (error) {
    const failedArchive = archiveRestoreManifest(
      'restore-failed',
      {
        ...manifest,
        failed_at: new Date().toISOString(),
        status: 'FAILED',
        error: error.message
      },
      paths
    );
    removeRestoreArtifacts(paths);
    logger.error('restore_apply_fail', 'Fallo aplicando restore pendiente', {
      dbFile: paths.dbFile,
      error: error.message,
      failedArchive
    });
    throw error;
  }
}

function deleteBackupFile(filename, options = {}) {
  const backup = resolveBackupFile(filename, options);
  const manifest = readPendingRestoreManifest(options);

  if (manifest?.source_backup?.filename === backup.filename) {
    throw new Error('No se puede eliminar un backup con restauración pendiente');
  }

  fs.rmSync(backup.fullPath, { force: true });
  return {
    filename: backup.filename
  };
}

module.exports = {
  getSystemPaths,
  listBackupFiles,
  readPendingRestoreManifest,
  formatRestoreManifest,
  stageRestoreFromBackup,
  applyPendingRestoreIfNeeded,
  deleteBackupFile
};
