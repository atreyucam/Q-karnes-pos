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
const sqliteMaintenanceSchema = z.object({
  accion: z.enum(['INTEGRITY_CHECK', 'FOREIGN_KEY_CHECK', 'WAL_CHECKPOINT', 'ANALYZE', 'VACUUM']),
  confirmacion: z.string().trim().optional()
});
const backupAutoConfigSchema = z.object({
  enabled: z.boolean(),
  frecuencia: z.enum(['DIARIO', 'SEMANAL']),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  retencion: z.number().int().min(1).max(120)
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

function dirSizeSafe(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);
    return files.reduce((acc, name) => {
      try {
        const absolute = path.join(dirPath, name);
        const stats = fs.statSync(absolute);
        return acc + (stats.isFile() ? stats.size : 0);
      } catch (_) {
        return acc;
      }
    }, 0);
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
  const backups = listBackupFiles();
  const latestBackup = backups[0] || null;
  const logsDir = path.join(paths.supportDir, '..', 'logs');
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
        host: process.env.HOST || '127.0.0.1',
        port: Number(process.env.PORT || 3000),
        db_file: paths.dbFile,
        db_size_bytes: fileSizeSafe(paths.dbFile),
        backup_dir: paths.backupDir,
        logs_dir: logsDir,
        logs_size_bytes: dirSizeSafe(logsDir)
      },
      backup: {
        ultimo_backup: latestBackup ? {
          filename: latestBackup.filename,
          fecha: latestBackup.mtime,
          sizeBytes: latestBackup.sizeBytes
        } : null
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

async function ejecutarMantenimientoSQLite(body, actorUser) {
  assertAdminUser(actorUser);
  const parsed = sqliteMaintenanceSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const { accion, confirmacion } = parsed.data;
  if (accion === 'VACUUM' && String(confirmacion || '').toUpperCase() !== 'VACUUM') {
    throw new AppError(400, 'Confirmación requerida para VACUUM');
  }

  const startedAt = Date.now();
  let result = null;
  if (accion === 'INTEGRITY_CHECK') {
    result = await db.raw('PRAGMA integrity_check');
  } else if (accion === 'FOREIGN_KEY_CHECK') {
    result = await db.raw('PRAGMA foreign_key_check');
  } else if (accion === 'WAL_CHECKPOINT') {
    result = await db.raw('PRAGMA wal_checkpoint(TRUNCATE)');
  } else if (accion === 'ANALYZE') {
    result = await db.raw('ANALYZE');
  } else if (accion === 'VACUUM') {
    result = await db.raw('VACUUM');
  }

  const durationMs = Date.now() - startedAt;
  await auditoriaService.logEvent({
    entidad: 'SISTEMA_SQLITE',
    entidad_id: accion,
    accion: 'MANTENIMIENTO_SQLITE',
    descripcion: `Mantenimiento SQLite ejecutado: ${accion}`,
    detalle: {
      modulo: 'SISTEMA',
      actor: actorUser,
      accion_sqlite: accion,
      duracion_ms: durationMs
    }
  });

  return {
    ok: true,
    data: {
      accion,
      duracion_ms: durationMs,
      resultado: result
    }
  };
}

async function getBackupAutomatico(actorUser) {
  assertAdminUser(actorUser);
  const row = await db('configuracion_sistema').where({ id: 1 }).first();
  return {
    ok: true,
    data: {
      enabled: Boolean(row?.backup_auto_enabled),
      frecuencia: String(row?.backup_auto_frecuencia || 'DIARIO').toUpperCase(),
      hora: String(row?.backup_auto_hora || '03:00'),
      retencion: Number(row?.backup_auto_retencion || 15),
      ultimo_run_at: row?.backup_auto_ultimo_run_at || null,
      ultimo_status: row?.backup_auto_ultimo_status || null,
      ultimo_error: row?.backup_auto_ultimo_error || null
    }
  };
}

async function setBackupAutomatico(body, actorUser) {
  assertAdminUser(actorUser);
  const parsed = backupAutoConfigSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const payload = {
    backup_auto_enabled: parsed.data.enabled,
    backup_auto_frecuencia: parsed.data.frecuencia,
    backup_auto_hora: parsed.data.hora,
    backup_auto_retencion: parsed.data.retencion,
    updated_at: db.fn.now()
  };

  await db('configuracion_sistema').where({ id: 1 }).update(payload);
  await auditoriaService.logEvent({
    entidad: 'SISTEMA_BACKUP_AUTO',
    entidad_id: 'CONFIG',
    accion: 'CONFIGURAR',
    descripcion: 'Configuración de backup automático actualizada',
    detalle: {
      modulo: 'SISTEMA',
      actor: actorUser,
      config: parsed.data
    }
  });

  return getBackupAutomatico(actorUser);
}

async function ejecutarBackupAutomaticoAhora(actorUser) {
  assertAdminUser(actorUser);
  const config = (await getBackupAutomatico(actorUser)).data;
  const startedAt = Date.now();
  let status = 'OK';
  let error = null;
  let backup = null;
  try {
    backup = createBackup({ label: 'auto' });
  } catch (runtimeError) {
    status = 'ERROR';
    error = String(runtimeError.message || 'Error desconocido');
  }

  await db('configuracion_sistema').where({ id: 1 }).update({
    backup_auto_ultimo_run_at: db.fn.now(),
    backup_auto_ultimo_status: status,
    backup_auto_ultimo_error: error
  });

  if (status === 'OK') {
    const backups = listBackupFiles();
    const overflow = backups.slice(config.retencion);
    for (const item of overflow) {
      try { deleteBackupFile(item.filename); } catch (_) {}
    }
  }

  await auditoriaService.logEvent({
    entidad: 'SISTEMA_BACKUP_AUTO',
    entidad_id: backup ? path.basename(backup.backupFile) : 'ERROR',
    accion: 'EJECUTAR',
    descripcion: status === 'OK' ? 'Backup automático ejecutado' : 'Backup automático falló',
    detalle: {
      modulo: 'SISTEMA',
      actor: actorUser,
      status,
      error,
      duracion_ms: Date.now() - startedAt
    }
  });

  if (status !== 'OK') throw new AppError(500, `No se pudo ejecutar backup automático: ${error}`);
  return {
    ok: true,
    data: {
      status,
      backup: {
        filename: path.basename(backup.backupFile),
        sizeBytes: backup.sizeBytes
      }
    }
  };
}

module.exports = {
  getHealth,
  getIntegridad,
  getBackups,
  crearBackup,
  programarRestauracion,
  eliminarBackup,
  ejecutarMantenimientoSQLite,
  getBackupAutomatico,
  setBackupAutomatico,
  ejecutarBackupAutomaticoAhora
};
