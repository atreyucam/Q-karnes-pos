import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Paginador,
  PageHeader,
  Toast,
  TableActions,
  TableActionButton,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../shared/ui';
import { useSistemaStore } from '../../stores/sistemaStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

const PAGE_SIZE = GLOBAL_PAGE_SIZE;

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function toneClass(ok) {
  return ok
    ? 'border-[color-mix(in_oklab,var(--color-success)_35%,white_65%)] bg-[color-mix(in_oklab,var(--color-success)_12%,white_88%)]'
    : 'border-[color-mix(in_oklab,var(--color-warning)_35%,white_65%)] bg-[color-mix(in_oklab,var(--color-warning)_14%,white_86%)]';
}

function toneTextClass(ok) {
  return ok ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]';
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
  const [pagina, setPagina] = useState(1);
  const [toastVisible, setToastVisible] = useState(false);
  const [restoreDialog, setRestoreDialog] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    cargarTodo().catch(() => {});
  }, [cargarTodo]);

  const latestBackup = useMemo(
    () => backups?.items?.[0] || null,
    [backups]
  );
  const totalBackups = Number(backups?.items?.length || 0);
  const totalPaginas = Math.max(1, Math.ceil(totalBackups / PAGE_SIZE));
  const backupsPaginados = useMemo(() => {
    const items = backups?.items || [];
    const start = (pagina - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [backups?.items, pagina]);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  useEffect(() => {
    if (!success) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 3800);
    const clearTimer = window.setTimeout(() => setSuccess(''), 4000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [success]);

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

  const onConfirmRestore = async () => {
    if (!restoreDialog) return;
    setSuccess('');
    const result = await programarRestauracion(restoreDialog);
    setRestoreDialog(null);
    setRestoreConfirmation('');
    setSuccess(result.mensaje || 'Restauración programada');
  };

  const onConfirmDeleteBackup = async () => {
    if (!deleteTarget) return;
    setSuccess('');
    const result = await eliminarBackup(deleteTarget);
    setDeleteTarget(null);
    setSuccess(`Backup eliminado: ${result.filename}`);
  };

  return (
    <div className="space-y-5">
      {success ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast
            tone="success"
            title="Operacion completada"
            description={success}
            onClose={() => {
              setToastVisible(false);
              setSuccess('');
            }}
            className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}
          />
        </div>
      ) : null}

      <PageHeader
        title="Sistema y mantenimiento"
        description="Salud local, integridad SQLite, backups y restauración controlada"
      />

      {error && <Alert tone="error">{error}</Alert>}

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
              <div className={`rounded-xl border p-3 ${toneClass(String(health?.status || '').toUpperCase() === 'OK')}`}>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Estado</p>
                <p className={`mt-1 text-lg font-semibold ${toneTextClass(String(health?.status || '').toUpperCase() === 'OK')}`}>{health?.status || '-'}</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Verificación</p>
                <p className="mt-1 text-lg font-semibold">{health?.timestamp ? formatDateQuito(health.timestamp) : '-'}</p>
              </div>
              <div className={`rounded-xl border p-3 ${toneClass(Boolean(health?.db_ok))}`}>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Base de datos</p>
                <p className={`mt-1 text-sm font-semibold ${toneTextClass(Boolean(health?.db_ok))}`}>{health?.db_ok ? 'Conectada' : 'Sin acceso'}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(health?.runtime?.db_size_bytes)}</p>
              </div>
              <div className={`rounded-xl border p-3 ${toneClass(Boolean(health?.config_ok))}`}>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Configuración</p>
                <p className={`mt-1 text-sm font-semibold ${toneTextClass(Boolean(health?.config_ok))}`}>{health?.config_ok ? 'Legible' : 'Con error'}</p>
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
                <div className={`rounded-xl border p-3 ${toneClass(Boolean(integridad?.resumen?.integrity_ok))}`}>
                  <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Estado</p>
                  <p className={`mt-1 text-lg font-semibold ${toneTextClass(Boolean(integridad?.resumen?.integrity_ok))}`}>{integridad?.status || '-'}</p>
                </div>
                <div className={`rounded-xl border p-3 ${toneClass(Number(integridad?.resumen?.foreign_key_violations ?? 0) === 0)}`}>
                  <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Violaciones FK</p>
                  <p className={`mt-1 text-lg font-semibold ${toneTextClass(Number(integridad?.resumen?.foreign_key_violations ?? 0) === 0)}`}>{integridad?.resumen?.foreign_key_violations ?? 0}</p>
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
            <Field label="Etiqueta" className="min-w-[200px]">
              <Input
                value={backupLabel}
                onChange={(event) => setBackupLabel(event.target.value)}
                placeholder="manual"
              />
            </Field>
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
          <>
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
                {backupsPaginados.map((backup) => (
                  <TablaFila key={backup.filename}>
                    <TablaCelda>{backup.filename}</TablaCelda>
                    <TablaCelda>{backup.tipo}</TablaCelda>
                    <TablaCelda>{formatDateQuito(backup.mtime)}</TablaCelda>
                    <TablaCelda>{formatBytes(backup.sizeBytes)}</TablaCelda>
                    <TablaCelda>
                      <TableActions align="start">
                        <TableActionButton
                          variant="primary"
                          onClick={() => {
                            setRestoreDialog(backup.filename);
                            setRestoreConfirmation('');
                          }}
                          disabled={working}
                        >
                          Restaurar
                        </TableActionButton>
                        <TableActionButton
                          variant="danger"
                          onClick={() => setDeleteTarget(backup.filename)}
                          disabled={working || backup.filename === backups?.pending_restore?.source_backup?.filename}
                        >
                          Eliminar
                        </TableActionButton>
                      </TableActions>
                    </TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
            <div className="px-5 pb-5">
              <Paginador
                paginaActual={pagina}
                totalPaginas={totalPaginas}
                totalRegistros={totalBackups}
                mostrarSiempre
                onPageChange={setPagina}
              />
            </div>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(restoreDialog)}
        onClose={() => {
          setRestoreDialog(null);
          setRestoreConfirmation('');
        }}
        onConfirm={onConfirmRestore}
        title="Programar restauración"
        description={restoreDialog ? `Para restaurar desde ${restoreDialog}, escriba RESTAURAR.` : ''}
        confirmLabel={working ? 'Programando...' : 'Programar restauración'}
        confirmVariant="primary"
        confirmDisabled={restoreConfirmation !== 'RESTAURAR'}
        confirmLoading={working}
      >
        <Field
          label="Confirmación requerida"
          hint="Esta acción deja una restauración pendiente para el siguiente reinicio de la aplicación."
        >
          <Input
            value={restoreConfirmation}
            onChange={(event) => setRestoreConfirmation(event.target.value.toUpperCase())}
            placeholder="RESTAURAR"
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onConfirmDeleteBackup}
        title="Eliminar backup"
        description={deleteTarget ? `¿Eliminar el backup ${deleteTarget}? Esta acción no se puede deshacer.` : ''}
        confirmLabel={working ? 'Eliminando...' : 'Eliminar'}
        confirmVariant="danger"
        confirmLoading={working}
      />
    </div>
  );
}
