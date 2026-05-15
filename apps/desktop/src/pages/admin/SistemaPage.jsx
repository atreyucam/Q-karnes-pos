import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Paginador,
  Select,
  TableActions,
  TableActionButton,
  Tabs,
  Toast,
  Modal,
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
const SISTEMA_TABS = [
  { key: 'mantenimiento', label: 'Mantenimiento' },
  { key: 'usuarios', label: 'Usuarios del sistema' }
];

const INITIAL_USER_FORM = {
  nombre: '',
  usuario: '',
  rol: 'CAJERO',
  activo: true,
  password: '',
  confirmPassword: ''
};

const INITIAL_PASSWORD_FORM = {
  currentPassword: '',
  password: '',
  confirmPassword: ''
};

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

function validateUserForm(form, isEdit = false) {
  const errors = {};
  if (!form.nombre.trim()) errors.nombre = 'Nombre requerido';
  if (!form.usuario.trim()) errors.usuario = 'Usuario requerido';
  else if (form.usuario.trim().length < 3) errors.usuario = 'Usuario mínimo 3 caracteres';
  if (!form.rol) errors.rol = 'Rol requerido';

  if (!isEdit) {
    if (!form.password) errors.password = 'Password requerido';
    else if (form.password.length < 8) errors.password = 'Mínimo 8 caracteres';
    if (!form.confirmPassword) errors.confirmPassword = 'Confirme el password';
    if (form.password && form.confirmPassword && form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden';
    }
  }

  return errors;
}

function validatePasswordForm(form) {
  const errors = {};
  if (!form.currentPassword) errors.currentPassword = 'Contraseña actual requerida';
  if (!form.password) errors.password = 'Nueva contraseña requerida';
  else if (form.password.length < 8) errors.password = 'Mínimo 8 caracteres';
  if (!form.confirmPassword) errors.confirmPassword = 'Confirme la contraseña';
  if (form.password && form.confirmPassword && form.password !== form.confirmPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden';
  }
  return errors;
}

function SistemaMantenimientoTab({ success, setSuccess }) {
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
  const [pagina, setPagina] = useState(1);
  const [restoreDialog, setRestoreDialog] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    cargarTodo().catch(() => {});
  }, [cargarTodo]);

  const latestBackup = useMemo(() => backups?.items?.[0] || null, [backups]);
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

  const onCreateBackup = async () => {
    const result = await crearBackup(backupLabel || 'manual');
    setSuccess(`Backup creado: ${result.backup?.filename || 'ok'}`);
  };

  const onRunIntegrity = async () => {
    const result = await ejecutarIntegridad();
    if (result?.resumen?.integrity_ok) setSuccess('Integridad SQLite verificada correctamente');
  };

  const onConfirmRestore = async () => {
    if (!restoreDialog) return;
    const result = await programarRestauracion(restoreDialog);
    setRestoreDialog(null);
    setRestoreConfirmation('');
    setSuccess(result.mensaje || 'Restauración programada');
  };

  const onConfirmDeleteBackup = async () => {
    if (!deleteTarget) return;
    const result = await eliminarBackup(deleteTarget);
    setDeleteTarget(null);
    setSuccess(`Backup eliminado: ${result.filename}`);
  };

  return (
    <>
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
            <Button variant="secondary" onClick={() => cargarTodo()} disabled={loadingHealth || loadingBackups}>Actualizar</Button>
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
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-[var(--color-text)]">Integridad SQLite</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Ejecuta `integrity_check` y `foreign_key_check`.</p>
            </div>
            <Button onClick={onRunIntegrity} disabled={runningIntegrity}>{runningIntegrity ? 'Ejecutando...' : 'Ejecutar diagnóstico'}</Button>
          </div>
          {!integridad ? (
            <EmptyState title="Sin diagnóstico ejecutado" description="Ejecute la verificación para revisar integridad y claves foráneas." />
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text)]">
              <p><span className="font-semibold">Estado:</span> {integridad?.status || '-'}</p>
              <p><span className="font-semibold">Violaciones FK:</span> {integridad?.resumen?.foreign_key_violations ?? 0}</p>
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
            <Field label="Etiqueta" className="min-w-[200px]"><Input value={backupLabel} onChange={(event) => setBackupLabel(event.target.value)} /></Field>
            <Button onClick={onCreateBackup} disabled={working}>{working ? 'Procesando...' : 'Crear backup'}</Button>
          </div>
        </div>

        {loadingBackups ? (
          <LoadingState title="Cargando backups" description="Leyendo respaldos y estado de restauración" />
        ) : !backups?.items?.length ? (
          <EmptyState title="Sin backups disponibles" description="Cree un backup manual antes de mantenimiento sensible." />
        ) : (
          <>
            <Tabla>
              <TablaCabecera><tr><TablaCelda as="th">Archivo</TablaCelda><TablaCelda as="th">Tipo</TablaCelda><TablaCelda as="th">Fecha</TablaCelda><TablaCelda as="th">Tamaño</TablaCelda><TablaCelda as="th">Acciones</TablaCelda></tr></TablaCabecera>
              <TablaCuerpo>
                {backupsPaginados.map((backup) => (
                  <TablaFila key={backup.filename}>
                    <TablaCelda>{backup.filename}</TablaCelda>
                    <TablaCelda>{backup.tipo}</TablaCelda>
                    <TablaCelda>{formatDateQuito(backup.mtime)}</TablaCelda>
                    <TablaCelda>{formatBytes(backup.sizeBytes)}</TablaCelda>
                    <TablaCelda>
                      <TableActions align="start">
                        <TableActionButton variant="primary" onClick={() => { setRestoreDialog(backup.filename); setRestoreConfirmation(''); }} disabled={working}>Restaurar</TableActionButton>
                        <TableActionButton variant="danger" onClick={() => setDeleteTarget(backup.filename)} disabled={working}>Eliminar</TableActionButton>
                      </TableActions>
                    </TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
            <div className="px-5 pb-5"><Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={totalBackups} mostrarSiempre onPageChange={setPagina} /></div>
          </>
        )}
      </Card>

      <ConfirmDialog open={Boolean(restoreDialog)} onClose={() => { setRestoreDialog(null); setRestoreConfirmation(''); }} onConfirm={onConfirmRestore} title="Programar restauración" description={restoreDialog ? `Para restaurar desde ${restoreDialog}, escriba RESTAURAR.` : ''} confirmLabel={working ? 'Programando...' : 'Programar restauración'} confirmVariant="primary" confirmDisabled={restoreConfirmation !== 'RESTAURAR'} confirmLoading={working}>
        <Field label="Confirmación requerida"><Input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value.toUpperCase())} placeholder="RESTAURAR" /></Field>
      </ConfirmDialog>
      <ConfirmDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={onConfirmDeleteBackup} title="Eliminar backup" description={deleteTarget ? `¿Eliminar el backup ${deleteTarget}?` : ''} confirmLabel={working ? 'Eliminando...' : 'Eliminar'} confirmVariant="danger" confirmLoading={working} />
    </>
  );
}

function SistemaUsuariosTab({ setSuccess }) {
  const {
    usuariosSistema,
    loadingUsuarios,
    working,
    error,
    cargarUsuariosSistema,
    crearUsuarioSistema,
    actualizarUsuarioSistema,
    cambiarPasswordUsuarioSistema,
    actualizarEstadoUsuarioSistema
  } = useSistemaStore();

  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [form, setForm] = useState(INITIAL_USER_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [passwordForm, setPasswordForm] = useState(INITIAL_PASSWORD_FORM);
  const [passwordErrors, setPasswordErrors] = useState({});

  const roles = usuariosSistema?.roles?.length ? usuariosSistema.roles : ['ADMIN', 'CAJERO'];

  const filters = useMemo(() => ({
    search: search.trim() || undefined,
    activo: estadoFiltro || undefined
  }), [search, estadoFiltro]);

  useEffect(() => {
    cargarUsuariosSistema(filters).catch(() => {});
  }, [cargarUsuariosSistema, filters]);

  const startCreate = () => {
    setEditing(null);
    setForm(INITIAL_USER_FORM);
    setFormErrors({});
    setShowForm(true);
  };

  const startEdit = (row) => {
    setEditing(row);
    setForm({ nombre: row.nombre, usuario: row.usuario || '', rol: row.rol, activo: row.activo, password: '', confirmPassword: '' });
    setFormErrors({});
    setShowForm(true);
  };

  const submitForm = async (event) => {
    event.preventDefault();
    const errors = validateUserForm(form, Boolean(editing));
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    if (editing) {
      await actualizarUsuarioSistema(editing.id, {
        nombre: form.nombre.trim(),
        usuario: form.usuario.trim().toLowerCase(),
        rol: form.rol,
        activo: Boolean(form.activo)
      }, filters);
      setSuccess('Usuario actualizado correctamente');
    } else {
      await crearUsuarioSistema({
        nombre: form.nombre.trim(),
        usuario: form.usuario.trim().toLowerCase(),
        rol: form.rol,
        activo: Boolean(form.activo),
        password: form.password,
        confirmPassword: form.confirmPassword
      }, filters);
      setSuccess('Usuario creado correctamente');
    }

    setShowForm(false);
    setEditing(null);
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    if (!passwordTarget) return;
    const errors = validatePasswordForm(passwordForm);
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;

    await cambiarPasswordUsuarioSistema(passwordTarget.id, passwordForm);
    setPasswordTarget(null);
    setPasswordForm(INITIAL_PASSWORD_FORM);
    setSuccess('Contraseña actualizada correctamente');
  };

  const onConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const nextState = !deactivateTarget.activo;
    await actualizarEstadoUsuarioSistema(deactivateTarget.id, nextState, filters);
    setSuccess(nextState ? 'Usuario activado correctamente' : 'Usuario desactivado correctamente');
    setDeactivateTarget(null);
  };

  const rows = usuariosSistema?.items || [];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Field label="Buscar"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, usuario o rol" /></Field>
            <Field label="Estado">
              <Select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
                <option value="">Todos</option>
                <option value="true">Activos</option>
                <option value="false">Inactivos</option>
              </Select>
            </Field>
          </div>
          <Button onClick={startCreate}>Nuevo usuario</Button>
        </div>
      </Card>

      <Card className="p-0">
        {loadingUsuarios ? (
          <div className="p-4"><LoadingState title="Cargando usuarios" description="Leyendo usuarios del sistema" /></div>
        ) : rows.length === 0 ? (
          <div className="p-4"><EmptyState title="No hay usuarios" description="Cree el primer usuario administrativo o de caja." /></div>
        ) : (
          <Tabla>
            <TablaCabecera><tr><TablaCelda as="th">Nombre</TablaCelda><TablaCelda as="th">Usuario</TablaCelda><TablaCelda as="th">Rol</TablaCelda><TablaCelda as="th">Estado</TablaCelda><TablaCelda as="th">Creación</TablaCelda><TablaCelda as="th">Acciones</TablaCelda></tr></TablaCabecera>
            <TablaCuerpo>
              {rows.map((row) => (
                <TablaFila key={row.id}>
                  <TablaCelda>{row.nombre}</TablaCelda>
                  <TablaCelda>{row.usuario}</TablaCelda>
                  <TablaCelda>{row.rol}</TablaCelda>
                  <TablaCelda>{row.activo ? 'Activo' : 'Inactivo'}</TablaCelda>
                  <TablaCelda>{row.created_at ? formatDateQuito(row.created_at) : '-'}</TablaCelda>
                  <TablaCelda>
                    <TableActions align="start">
                      <TableActionButton onClick={() => startEdit(row)}>Editar</TableActionButton>
                      <TableActionButton onClick={() => { setPasswordTarget(row); setPasswordForm(INITIAL_PASSWORD_FORM); setPasswordErrors({}); }}>Cambiar contraseña</TableActionButton>
                      <TableActionButton variant={row.activo ? 'danger' : 'secondary'} onClick={() => setDeactivateTarget(row)}>
                        {row.activo ? 'Desactivar' : 'Activar'}
                      </TableActionButton>
                    </TableActions>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={onConfirmDeactivate}
        title={deactivateTarget?.activo ? 'Desactivar usuario' : 'Activar usuario'}
        description={deactivateTarget ? `Confirme ${deactivateTarget.activo ? 'desactivar' : 'activar'} a ${deactivateTarget.nombre}.` : ''}
        confirmLabel={working ? 'Guardando...' : (deactivateTarget?.activo ? 'Desactivar' : 'Activar')}
        confirmVariant={deactivateTarget?.activo ? 'danger' : 'primary'}
        confirmLoading={working}
      />

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        maxWidthClass="max-w-lg"
        panelClassName="p-5"
      >
        <form className="space-y-3" onSubmit={submitForm}>
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">{editing ? 'Editar usuario' : 'Crear usuario'}</h3>
            </div>
          </div>
          <Field label="Nombre" required error={formErrors.nombre}><Input value={form.nombre} onChange={(e) => setForm((v) => ({ ...v, nombre: e.target.value }))} /></Field>
          <Field label="Usuario" required error={formErrors.usuario}><Input value={form.usuario} onChange={(e) => setForm((v) => ({ ...v, usuario: e.target.value }))} /></Field>
          <Field label="Rol" required error={formErrors.rol}>
            <Select value={form.rol} onChange={(e) => setForm((v) => ({ ...v, rol: e.target.value }))}>{roles.map((rol) => <option key={rol} value={rol}>{rol}</option>)}</Select>
          </Field>
          <Field label="Estado"><Select value={form.activo ? 'true' : 'false'} onChange={(e) => setForm((v) => ({ ...v, activo: e.target.value === 'true' }))}><option value="true">Activo</option><option value="false">Inactivo</option></Select></Field>
          {!editing && (
            <>
              <Field label="Password" required error={formErrors.password}><Input type="password" value={form.password} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} /></Field>
              <Field label="Confirmar password" required error={formErrors.confirmPassword}><Input type="password" value={form.confirmPassword} onChange={(e) => setForm((v) => ({ ...v, confirmPassword: e.target.value }))} /></Field>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
            <Button type="submit" disabled={working}>{working ? 'Guardando...' : 'Guardar'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => setPasswordTarget(null)}
        maxWidthClass="max-w-lg"
        panelClassName="p-5"
      >
        <form className="space-y-3" onSubmit={submitPassword}>
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">Cambiar contraseña</h3>
              <p className="ui-panel-description">Debe ingresar la contraseña actual del usuario.</p>
            </div>
          </div>
          <Field label="Contraseña actual" required error={passwordErrors.currentPassword}><Input type="password" value={passwordForm.currentPassword || ''} onChange={(e) => setPasswordForm((v) => ({ ...v, currentPassword: e.target.value }))} /></Field>
          <Field label="Nueva contraseña" required error={passwordErrors.password}><Input type="password" value={passwordForm.password} onChange={(e) => setPasswordForm((v) => ({ ...v, password: e.target.value }))} /></Field>
          <Field label="Confirmar nueva contraseña" required error={passwordErrors.confirmPassword}><Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((v) => ({ ...v, confirmPassword: e.target.value }))} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setPasswordTarget(null)}>Cancelar</Button>
            <Button type="submit" disabled={working}>{working ? 'Actualizando...' : 'Actualizar contraseña'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function SistemaPage() {
  const [params, setParams] = useSearchParams();
  const [success, setSuccess] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const currentTab = useMemo(() => {
    const tab = params.get('tab');
    return SISTEMA_TABS.some((item) => item.key === tab) ? tab : 'mantenimiento';
  }, [params]);

  useEffect(() => {
    if (!params.get('tab')) setParams({ tab: 'mantenimiento' }, { replace: true });
  }, [params, setParams]);

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

  return (
    <div className="space-y-5">
      {success ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast tone="success" title="Operacion completada" description={success} onClose={() => { setToastVisible(false); setSuccess(''); }} className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'} />
        </div>
      ) : null}

      <PageHeader title="Sistema y mantenimiento" description="Herramientas administrativas y gestión de acceso al POS" />

      <Tabs ariaLabel="Pestañas del módulo sistema" items={SISTEMA_TABS} value={currentTab} onChange={(tabKey) => setParams({ tab: tabKey })} />

      {currentTab === 'usuarios' ? <SistemaUsuariosTab setSuccess={setSuccess} /> : <SistemaMantenimientoTab success={success} setSuccess={setSuccess} />}
    </div>
  );
}
