const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const db = require('../../db/knex');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { createBackup } = require('../../../scripts/sqlite-backup');
const { runIntegrityCheckReport } = require('../../../scripts/sqlite-integrity-check');
const configuracionService = require('../configuracion/configuracion.service');
const auditoriaService = require('../auditoria/auditoria.service');
const {
  getSystemPaths,
  listBackupFiles,
  readPendingRestoreManifest,
  formatRestoreManifest,
  stageRestoreFromBackup,
  deleteBackupFile
} = require('./sistema.runtime');

const backupSchema = z.object({
  label: z.string().trim().min(1).max(40).optional()
});

const restoreSchema = z.object({
  filename: z.string().trim().min(1),
  confirmacion: z.literal('RESTAURAR')
});

function assertAdminUser(actorUser) {
  if (actorUser?.rol?.nombre !== 'ADMIN') {
    throw new AppError(403, 'Solo ADMIN puede ejecutar herramientas del sistema');
  }
}

function fileSizeSafe(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (_) {
    return 0;
  }
}

async function getHealth(actorUser) {
  assertAdminUser(actorUser);
  const paths = getSystemPaths();
  let dbOk = false;
  let configOk = false;
  let pragmaSnapshot = null;

  try {
    await db.raw('SELECT 1 as ok');
    pragmaSnapshot = await db.sqlitePragmasSnapshot();
    dbOk = true;
  } catch (_) {
    dbOk = false;
  }

  try {
    await configuracionService.getRuntimeConfig();
    configOk = true;
  } catch (_) {
    configOk = false;
  }

  const pendingRestore = formatRestoreManifest(readPendingRestoreManifest());
  const status = dbOk && configOk ? 'ok' : 'degraded';

  return {
    ok: true,
    data: {
      status,
      db_ok: dbOk,
      config_ok: configOk,
      timestamp: new Date().toISOString(),
      version: require('../../../package.json').version,
      runtime: {
        node_env: process.env.NODE_ENV || 'development',
        db_file: paths.dbFile,
        db_size_bytes: fileSizeSafe(paths.dbFile),
        backup_dir: paths.backupDir
      },
      sqlite: pragmaSnapshot,
      pending_restore: pendingRestore
    }
  };
}

async function getIntegridad(actorUser) {
  assertAdminUser(actorUser);
  const report = runIntegrityCheckReport();
  return {
    ok: true,
    data: {
      status: report.ok ? 'ok' : 'warning',
      db_file: report.dbFile,
      pragmas: report.pragmas,
      integrity: report.integrity,
      foreign_key_violations: report.foreignKeyViolations,
      resumen: {
        integrity_ok: report.ok,
        foreign_key_violations: report.foreignKeyViolations.length
      }
    }
  };
}

async function getBackups(actorUser) {
  assertAdminUser(actorUser);
  const paths = getSystemPaths();
  const backups = listBackupFiles();
  const pendingRestore = formatRestoreManifest(readPendingRestoreManifest());

  return {
    ok: true,
    data: {
      items: backups,
      resumen: {
        db_file: paths.dbFile,
        db_size_bytes: fileSizeSafe(paths.dbFile),
        backup_dir: paths.backupDir,
        support_dir: paths.supportDir,
        total_backups: backups.length
      },
      pending_restore: pendingRestore
    }
  };
}

async function crearBackup(body, actorUser) {
  assertAdminUser(actorUser);
  const parsed = backupSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const backup = createBackup({
    label: parsed.data.label || 'manual'
  });

  await auditoriaService.logEvent({
    entidad: 'SISTEMA_BACKUP',
    entidad_id: path.basename(backup.backupFile),
    accion: 'CREAR',
    descripcion: `Backup manual generado: ${path.basename(backup.backupFile)}`,
    detalle: {
      modulo: 'SISTEMA',
      actor: actorUser,
      backup: {
        file: backup.backupFile,
        sizeBytes: backup.sizeBytes
      }
    }
  });

  return {
    ok: true,
    data: {
      backup: {
        filename: path.basename(backup.backupFile),
        file: backup.backupFile,
        sizeBytes: backup.sizeBytes
      }
    }
  };
}

async function programarRestauracion(body, actorUser) {
  assertAdminUser(actorUser);
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  let restorePlan;
  try {
    restorePlan = stageRestoreFromBackup({
      filename: parsed.data.filename,
      requestedBy: actorUser
        ? {
            id: actorUser.id,
            nombre: actorUser.nombre || null,
            usuario: actorUser.usuario || null
          }
        : null
    });
  } catch (error) {
    throw new AppError(400, error.message);
  }

  await auditoriaService.logEvent({
    entidad: 'SISTEMA_RESTORE',
    entidad_id: restorePlan.source_backup?.filename || parsed.data.filename,
    accion: 'PROGRAMAR',
    descripcion: `Restauración programada desde backup ${parsed.data.filename}`,
    detalle: {
      modulo: 'SISTEMA',
      actor: actorUser,
      restore_plan: restorePlan
    }
  });

  return {
    ok: true,
    data: {
      restore: restorePlan,
      requiere_reinicio: true,
      mensaje: 'La restauración quedó programada. Reinicie la API/aplicación local para aplicarla.'
    }
  };
}

async function eliminarBackup(filename, actorUser) {
  assertAdminUser(actorUser);
  let removed;
  try {
    removed = deleteBackupFile(filename);
  } catch (error) {
    if (String(error.message || '').includes('no encontrado')) {
      throw new AppError(404, error.message);
    }
    throw new AppError(400, error.message);
  }

  await auditoriaService.logEvent({
    entidad: 'SISTEMA_BACKUP',
    entidad_id: removed.filename,
    accion: 'ELIMINAR',
    descripcion: `Backup eliminado: ${removed.filename}`,
    detalle: {
      modulo: 'SISTEMA',
      actor: actorUser,
      filename: removed.filename
    }
  });

  return {
    ok: true,
    data: removed
  };
}

module.exports = {
  getHealth,
  getIntegridad,
  getBackups,
  crearBackup,
  programarRestauracion,
  eliminarBackup
};
