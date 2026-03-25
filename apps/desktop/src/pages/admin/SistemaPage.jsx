import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../ui';
import { useSistemaStore } from '../../stores/sistemaStore';
import { formatDateQuito } from '../../lib/formatDateQuito';

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SistemaPage() {
  const {
    health,
    integridad,
    backups,
    loadingHealth,
    loadingBackups,
    runningIntegrity,
    working,
    error,
    cargarTodo,
    ejecutarIntegridad,
    crearBackup,
    programarRestauracion,
    eliminarBackup
  } = useSistemaStore();

  const [backupLabel, setBackupLabel] = useState('manual');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    cargarTodo().catch(() => {});
  }, [cargarTodo]);

  const latestBackup = useMemo(
    () => backups?.items?.[0] || null,
    [backups]
  );

  const onCreateBackup = async () => {
    setSuccess('');
    const result = await crearBackup(backupLabel || 'manual');
    setSuccess(`Backup creado: ${result.backup?.filename || 'ok'}`);
  };

  const onRunIntegrity = async () => {
    setSuccess('');
    const result = await ejecutarIntegridad();
    if (result?.resumen?.integrity_ok) {
      setSuccess('Integridad SQLite verificada correctamente');
    }
  };

  const onScheduleRestore = async (filename) => {
    const typed = window.prompt(
      `Para programar la restauración desde ${filename}, escriba RESTAURAR`
    );
    if (typed !== 'RESTAURAR') return;

    setSuccess('');
    const result = await programarRestauracion(filename);
    setSuccess(result.mensaje || 'Restauración programada');
  };

  const onDeleteBackup = async (filename) => {
    const confirmed = window.confirm(`¿Eliminar el backup ${filename}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    setSuccess('');
    const result = await eliminarBackup(filename);
    setSuccess(`Backup eliminado: ${result.filename}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sistema y mantenimiento"
        description="Salud local, integridad SQLite, backups y restauración controlada"
      />

      {(error || success) && (
        <Alert tone={error ? 'error' : 'success'}>
          {error || success}
        </Alert>
      )}

      {backups?.pending_restore && (
        <Alert tone="warning">
          Restauración pendiente desde {backups.pending_restore.source_backup?.filename}. Reinicie la API/aplicación local para aplicarla.
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-[var(--color-text)]">Salud del sistema</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Estado general y acceso a la base local.</p>
            </div>
            <Button variant="secondary" onClick={() => cargarTodo()} disabled={loadingHealth || loadingBackups}>
              Actualizar
            </Button>
          </div>

          {loadingHealth ? (
            <LoadingState title="Consultando salud" description="Leyendo runtime local y base de datos" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Estado</p>
                <p className="mt-1 text-lg font-semibold">{health?.status || '-'}</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Verificación</p>
                <p className="mt-1 text-lg font-semibold">{health?.timestamp ? formatDateQuito(health.timestamp) : '-'}</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Base de datos</p>
                <p className="mt-1 text-sm font-semibold">{health?.db_ok ? 'Conectada' : 'Sin acceso'}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(health?.runtime?.db_size_bytes)}</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Configuración</p>
                <p className="mt-1 text-sm font-semibold">{health?.config_ok ? 'Legible' : 'Con error'}</p>
                <p className="text-xs text-[var(--color-text-muted)]">Versión API {health?.version || '-'}</p>
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-[var(--color-text)]">Integridad SQLite</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Ejecuta `integrity_check` y `foreign_key_check` sobre la base local.</p>
            </div>
            <Button onClick={onRunIntegrity} disabled={runningIntegrity}>
              {runningIntegrity ? 'Ejecutando...' : 'Ejecutar diagnóstico'}
            </Button>
          </div>

          {!integridad ? (
            <EmptyState title="Sin diagnóstico ejecutado" description="Ejecute la verificación para revisar integridad y claves foráneas." />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Estado</p>
                  <p className="mt-1 text-lg font-semibold">{integridad?.status || '-'}</p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Violaciones FK</p>
                  <p className="mt-1 text-lg font-semibold">{integridad?.resumen?.foreign_key_violations ?? 0}</p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text)]">
                <p><span className="font-semibold">integrity_check:</span> {integridad?.integrity?.map((row) => row.integrity_check).join(', ') || '-'}</p>
                <p><span className="font-semibold">journal_mode:</span> {integridad?.pragmas?.journal_mode || '-'}</p>
                <p><span className="font-semibold">foreign_keys:</span> {integridad?.pragmas?.foreign_keys ?? '-'}</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">Backups y restauración</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              Backups disponibles: {backups?.resumen?.total_backups ?? 0}
              {latestBackup ? ` · Último: ${latestBackup.filename}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-[var(--color-text)]">
              Etiqueta
              <Input
                className="mt-1"
                value={backupLabel}
                onChange={(event) => setBackupLabel(event.target.value)}
                placeholder="manual"
              />
            </label>
            <Button onClick={onCreateBackup} disabled={working}>
              {working ? 'Procesando...' : 'Crear backup'}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text)]">
          <p><span className="font-semibold">BD actual:</span> {backups?.resumen?.db_file || '-'}</p>
          <p><span className="font-semibold">Carpeta backups:</span> {backups?.resumen?.backup_dir || '-'}</p>
          <p><span className="font-semibold">Tamaño BD:</span> {formatBytes(backups?.resumen?.db_size_bytes)}</p>
        </div>

        {loadingBackups ? (
          <LoadingState title="Cargando backups" description="Leyendo respaldos y estado de restauración" />
        ) : !backups?.items?.length ? (
          <EmptyState title="Sin backups disponibles" description="Cree un backup manual antes de ejecutar mantenimiento sensible." />
        ) : (
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Archivo</TablaCelda>
                <TablaCelda as="th">Tipo</TablaCelda>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Tamaño</TablaCelda>
                <TablaCelda as="th">Acciones</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {backups.items.map((backup) => (
                <TablaFila key={backup.filename}>
                  <TablaCelda>{backup.filename}</TablaCelda>
                  <TablaCelda>{backup.tipo}</TablaCelda>
                  <TablaCelda>{formatDateQuito(backup.mtime)}</TablaCelda>
                  <TablaCelda>{formatBytes(backup.sizeBytes)}</TablaCelda>
                  <TablaCelda>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => onScheduleRestore(backup.filename)}
                        disabled={working}
                      >
                        Restaurar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onDeleteBackup(backup.filename)}
                        disabled={working || backup.filename === backups?.pending_restore?.source_backup?.filename}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        )}
      </Card>
    </div>
  );
}
