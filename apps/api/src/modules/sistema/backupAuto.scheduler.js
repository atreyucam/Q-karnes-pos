const { createBackup } = require('../../../scripts/sqlite-backup');
const db = require('../../db/knex');
const { listBackupFiles, deleteBackupFile } = require('./sistema.runtime');
const { createLogger } = require('../../helpers/logger');

const logger = createLogger({ channel: 'backup-auto' });
let timer = null;
let running = false;

function currentHHmm() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function sameDay(a, b) {
  return String(a).slice(0, 10) === String(b).slice(0, 10);
}

async function runBackupIfDue() {
  if (running) return;
  running = true;
  try {
    const cfg = await db('configuracion_sistema').where({ id: 1 }).first();
    if (!cfg || !cfg.backup_auto_enabled) return;

    const now = new Date();
    const dueHour = String(cfg.backup_auto_hora || '03:00');
    if (currentHHmm() !== dueHour) return;

    if (cfg.backup_auto_ultimo_run_at && sameDay(cfg.backup_auto_ultimo_run_at, now.toISOString())) {
      return;
    }

    const backup = createBackup({ label: 'auto' });
    const retention = Math.max(1, Number(cfg.backup_auto_retencion || 15));
    const backups = listBackupFiles();
    for (const item of backups.slice(retention)) {
      try { deleteBackupFile(item.filename); } catch (_) {}
    }

    await db('configuracion_sistema').where({ id: 1 }).update({
      backup_auto_ultimo_run_at: db.fn.now(),
      backup_auto_ultimo_status: 'OK',
      backup_auto_ultimo_error: null
    });

    logger.info('backup_auto_ok', 'Backup automático ejecutado', {
      filename: backup.backupFile,
      sizeBytes: backup.sizeBytes
    });
  } catch (error) {
    await db('configuracion_sistema').where({ id: 1 }).update({
      backup_auto_ultimo_run_at: db.fn.now(),
      backup_auto_ultimo_status: 'ERROR',
      backup_auto_ultimo_error: String(error.message || 'Error')
    }).catch(() => {});
    logger.error('backup_auto_error', 'Fallo backup automático', { error });
  } finally {
    running = false;
  }
}

function startBackupAutoScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    runBackupIfDue().catch(() => {});
  }, 60_000);
}

module.exports = { startBackupAutoScheduler };

