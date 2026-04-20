import { useEffect, useMemo, useState } from 'react';
import { PiEye, PiPencilSimple } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  FiltersBar,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  Switch,
  Toast,
  TableActions,
  TableActionButton,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../shared/ui';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { formatMoney } from '../../lib/formatMoney';
import useBooleanSwitch from '../../shared/hooks/useBooleanSwitch';
import useFormErrors from '../../shared/hooks/useFormErrors';

const PAGE_SIZE = 10;

const emptyProveedorForm = {
  id: null,
  nombre: '',
  telefono: '',
  direccion: '',
  observacion: '',
  tiene_credito: true,
  dias_pago: '15',
  activo: true
};

export default function ProveedoresPage() {
  const { proveedores, error, loading, listar, crear, actualizar } = useProveedoresStore();
  const navigate = useNavigate();

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS', credito: 'TODOS' });
  const [proveedorModal, setProveedorModal] = useState({ open: false, mode: 'create' });
  const [proveedorForm, setProveedorForm] = useState(emptyProveedorForm);
  const [feedback, setFeedback] = useState('');
  const [statusError, setStatusError] = useState('');
  const [blockedDeactivateProveedor, setBlockedDeactivateProveedor] = useState(null);
  const [statusToast, setStatusToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const proveedorFormErrors = useFormErrors();

  const refreshList = () => {
    listar({
      include_cxp: 1,
      search: filtros.search || undefined,
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado,
      tiene_credito: filtros.credito === 'TODOS' ? undefined : filtros.credito
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(refreshList, 250);
    return () => window.clearTimeout(timer);
  }, [listar, filtros]);

  const proveedoresOrdenados = useMemo(() => {
    return [...proveedores].sort((a, b) => {
      const saldoA = Number(a.saldo_pendiente || 0);
      const saldoB = Number(b.saldo_pendiente || 0);
      if (saldoB !== saldoA) return saldoB - saldoA;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    });
  }, [proveedores]);

  const totalPaginas = Math.max(1, Math.ceil(proveedoresOrdenados.length / PAGE_SIZE));
  const proveedoresPaginados = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return proveedoresOrdenados.slice(start, start + PAGE_SIZE);
  }, [pagina, proveedoresOrdenados]);

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  useEffect(() => {
    if (!statusToast) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 2400);
    const clearTimer = window.setTimeout(() => setStatusToast(''), 2580);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToast]);

  const onChangeFiltro = (key, value) => {
    setPagina(1);
    setFiltros((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateModal = () => {
    setProveedorModal({ open: true, mode: 'create' });
    setProveedorForm({ ...emptyProveedorForm });
    proveedorFormErrors.resetErrors();
  };

  const openEditModal = (proveedor) => {
    setProveedorModal({ open: true, mode: 'edit' });
    proveedorFormErrors.resetErrors();
    setProveedorForm({
      id: proveedor.id,
      nombre: proveedor.nombre || '',
      telefono: proveedor.telefono || '',
      direccion: proveedor.direccion || '',
      observacion: proveedor.observacion || '',
      tiene_credito: Boolean(proveedor.tiene_credito),
      dias_pago: String(Number(proveedor.dias_pago || 0)),
      activo: Boolean(proveedor.activo)
    });
  };

  const closeProveedorModal = () => {
    setProveedorModal({ open: false, mode: 'create' });
    setProveedorForm({ ...emptyProveedorForm });
    proveedorFormErrors.resetErrors();
  };

  const onSaveProveedor = async () => {
    const nextErrors = {};
    if (!proveedorForm.nombre.trim()) nextErrors.nombre = 'Este campo es obligatorio.';
    if (proveedorForm.tiene_credito) {
      const diasPago = Number(proveedorForm.dias_pago || 0);
      if (!String(proveedorForm.dias_pago || '').trim()) nextErrors.dias_pago = 'Este campo es obligatorio.';
      else if (!Number.isFinite(diasPago) || diasPago < 0) nextErrors.dias_pago = 'Ingresa un valor válido.';
    }
    if (!proveedorFormErrors.setErrors(nextErrors)) return;

    if (proveedorModal.mode === 'edit' && proveedorForm.id) {
      const proveedorActual = proveedores.find((item) => Number(item.id) === Number(proveedorForm.id));
      const saldoPendiente = Number(proveedorActual?.saldo_pendiente || 0);
      const estabaActivo = Boolean(proveedorActual?.activo);
      const quiereDesactivar = estabaActivo && !proveedorForm.activo;

      if (quiereDesactivar && saldoPendiente > 0) {
        setBlockedDeactivateProveedor(proveedorActual || { ...proveedorForm, saldo_pendiente: saldoPendiente });
        return;
      }
    }

    const payload = {
      nombre: proveedorForm.nombre.trim(),
      telefono: proveedorForm.telefono.trim() || null,
      direccion: proveedorForm.direccion.trim() || null,
      observacion: proveedorForm.observacion.trim() || null,
      tiene_credito: proveedorForm.tiene_credito,
      dias_pago: proveedorForm.tiene_credito ? Number(proveedorForm.dias_pago || 0) : 0,
      activo: proveedorForm.activo
    };

    try {
      if (proveedorModal.mode === 'edit' && proveedorForm.id) {
        await actualizar(proveedorForm.id, payload);
      } else {
        await crear(payload);
      }

      closeProveedorModal();
      refreshList();
    } catch (_) {
      // store error already exposed in page alert
    }
  };

  const proveedorStatusSwitch = useBooleanSwitch({
    getValue: (proveedor) => Boolean(proveedor.activo),
    isSensitive: (proveedor, nextValue) => Boolean(proveedor.activo) && !nextValue && Number(proveedor.saldo_pendiente || 0) <= 0,
    onCommit: async (proveedor, nextValue) => {
      setStatusError('');
      setFeedback('');
      await actualizar(proveedor.id, { activo: nextValue });
      await refreshList();
      setStatusToast(`Proveedor ha sido ${nextValue ? 'activado' : 'desactivado'}.`);
    },
    onError: (nextError, proveedor, nextValue) => {
      setStatusToast('');
      setFeedback('');
      setStatusError(nextError.message || `No se pudo ${nextValue ? 'activar' : 'desactivar'} el proveedor ${proveedor.nombre}.`);
    }
  });

  return (
    <div className="space-y-5">
      {statusToast ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast tone="success" className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToast}</Toast>
        </div>
      ) : null}

      <PageHeader
        title="Proveedores"
        description="Catálogo, estado y créditos por proveedor."
        actions={(
          <Button onClick={openCreateModal}>
            Nuevo proveedor
          </Button>
        )}
      />

      {(statusError || error || feedback) && (
        <Alert tone={statusError || error ? 'error' : 'success'}>
          {statusError || error || feedback}
        </Alert>
      )}

      <FiltersBar
        search={(
          <Field label="Buscar">
            <Input
              value={filtros.search}
              onChange={(e) => onChangeFiltro('search', e.target.value)}
              placeholder="Nombre, teléfono o dirección"
            />
          </Field>
        )}
        actions={(
          <Button
            variant="secondary"
            className="w-full xl:w-auto"
            onClick={() => {
              setPagina(1);
              setFiltros({ search: '', estado: 'TODOS', credito: 'TODOS' });
            }}
          >
            Limpiar filtros
          </Button>
        )}
      >
        <Field label="Estado">
          <Select
            value={filtros.estado}
            onChange={(e) => onChangeFiltro('estado', e.target.value)}
          >
            <option value="TODOS">Todos</option>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </Select>
        </Field>

        <Field label="Crédito">
          <Select
            value={filtros.credito}
            onChange={(e) => onChangeFiltro('credito', e.target.value)}
          >
            <option value="TODOS">Todos</option>
            <option value="1">Con crédito</option>
            <option value="0">Sin crédito</option>
          </Select>
        </Field>
      </FiltersBar>

      <Card className="overflow-hidden p-0">
        {proveedoresOrdenados.length === 0 && !loading ? (
          <div className="p-5">
            <EmptyState
              title="Sin proveedores"
              description="No hay proveedores para los filtros actuales."
            />
          </div>
        ) : (
          <>
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Proveedor</TablaCelda>
                  <TablaCelda as="th">Teléfono</TablaCelda>
                  <TablaCelda as="th">Crédito</TablaCelda>
                  <TablaCelda as="th">Pago cada (días)</TablaCelda>
                  <TablaCelda as="th" className="text-right">Crédito pendiente</TablaCelda>
                  <TablaCelda as="th">Estado</TablaCelda>
                  <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {proveedoresPaginados.map((proveedor) => {
                  const saldoPendiente = Number(proveedor.saldo_pendiente || 0);
                  const currentChecked = proveedorStatusSwitch.resolveChecked(proveedor);
                  return (
                    <TablaFila key={proveedor.id}>
                      <TablaCelda>
                        <p className="font-semibold text-[var(--color-text)]">{proveedor.nombre}</p>
                      </TablaCelda>
                      <TablaCelda>{proveedor.telefono || '-'}</TablaCelda>
                      <TablaCelda>
                        <StatusBadge tone={proveedor.tiene_credito ? 'warning' : 'neutral'}>
                          {proveedor.tiene_credito ? 'Crédito' : 'Sin crédito'}
                        </StatusBadge>
                      </TablaCelda>
                      <TablaCelda>{Number(proveedor.dias_pago || 0)}</TablaCelda>
                      <TablaCelda className={`text-right font-semibold ${saldoPendiente > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                        {formatMoney(saldoPendiente)}
                      </TablaCelda>
                      <TablaCelda>
                        <Switch
                          checked={currentChecked}
                          onChange={(checked) => {
                            setFeedback('');
                            setStatusError('');
                            if (currentChecked && !checked && saldoPendiente > 0) {
                              setBlockedDeactivateProveedor(proveedor);
                              return;
                            }
                            proveedorStatusSwitch.requestChange(proveedor, checked);
                          }}
                          label={currentChecked ? 'Activo' : 'Inactivo'}
                          busy={proveedorStatusSwitch.isPending(proveedor)}
                          disabled={proveedorStatusSwitch.isPending(proveedor)}
                        />
                      </TablaCelda>
                      <TablaCelda>
                        <TableActions>
                          <TableActionButton
                            variant="neutral"
                            icon={<PiEye />}
                            aria-label="Ver proveedor"
                            title="Ver proveedor"
                            onClick={() => navigate(`/proveedores/${proveedor.id}`)}
                          >
                            Ver
                          </TableActionButton>
                          <TableActionButton
                            variant="warning"
                            icon={<PiPencilSimple />}
                            aria-label="Editar proveedor"
                            title="Editar proveedor"
                            onClick={() => openEditModal(proveedor)}
                          >
                            Editar
                          </TableActionButton>
                        </TableActions>
                      </TablaCelda>
                    </TablaFila>
                  );
                })}
              </TablaCuerpo>
            </Tabla>

            <div className="px-5 pb-5">
              <Paginador
                paginaActual={pagina}
                totalPaginas={totalPaginas}
                totalRegistros={proveedoresOrdenados.length}
                mostrarSiempre
                onPageChange={setPagina}
              />
            </div>
          </>
        )}
      </Card>

      {loading && <LoadingState label="Cargando proveedores..." />}

      <Modal open={proveedorModal.open} onClose={closeProveedorModal} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{proveedorModal.mode === 'edit' ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Configura datos comerciales, crédito y estado.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={closeProveedorModal}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Nombre" required error={proveedorFormErrors.errors.nombre}>
            <Input
              className="bg-[var(--color-surface)]"
              value={proveedorForm.nombre}
              onChange={(e) => {
                proveedorFormErrors.clearFieldError('nombre');
                setProveedorForm((prev) => ({ ...prev, nombre: e.target.value }));
              }}
              placeholder="Pronaca"
            />
          </Field>

          <Field label="Teléfono">
            <Input
              className="bg-[var(--color-surface)]"
              value={proveedorForm.telefono}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, telefono: e.target.value }))}
              placeholder="0990000000"
            />
          </Field>

          <Field label="Dirección" className="md:col-span-2">
            <Input
              className="bg-[var(--color-surface)]"
              value={proveedorForm.direccion}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, direccion: e.target.value }))}
              placeholder="Sector / calle"
            />
          </Field>

          <Field
            label="Días de pago"
            hint="Solo aplica cuando el proveedor trabaja a crédito."
            error={proveedorFormErrors.errors.dias_pago}
            className="md:col-span-2"
          >
            <Input
              className={
                !proveedorForm.tiene_credito
                  ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)]'
                  : 'bg-[var(--color-surface)]'
              }
              value={proveedorForm.dias_pago}
              onChange={(e) => {
                proveedorFormErrors.clearFieldError('dias_pago');
                setProveedorForm((prev) => ({ ...prev, dias_pago: e.target.value }));
              }}
              disabled={!proveedorForm.tiene_credito}
              placeholder="15"
            />
          </Field>

          <Field label="Observación" className="md:col-span-2">
            <Textarea
              className="bg-[var(--color-surface)]"
              value={proveedorForm.observacion}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, observacion: e.target.value }))}
              placeholder="Notas internas"
            />
          </Field>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
            <Switch
              checked={proveedorForm.tiene_credito}
              onChange={(checked) => setProveedorForm((prev) => ({ ...prev, tiene_credito: checked }))}
              label="Tiene crédito"
              description="Habilita compras a crédito y saldo pendiente."
            />
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
            <Switch
              checked={proveedorForm.activo}
              onChange={(checked) => setProveedorForm((prev) => ({ ...prev, activo: checked }))}
              label="Proveedor activo"
              description="Si está inactivo no aparece para nuevas órdenes."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={closeProveedorModal}>
            Cancelar
          </Button>
          <Button onClick={onSaveProveedor}>
            {proveedorModal.mode === 'edit' ? 'Guardar cambios' : 'Guardar proveedor'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(proveedorStatusSwitch.confirmState)}
        onClose={proveedorStatusSwitch.cancelConfirm}
        onConfirm={proveedorStatusSwitch.confirmChange}
        title="Desactivar proveedor"
        description={proveedorStatusSwitch.confirmState ? `Vas a desactivar al proveedor ${proveedorStatusSwitch.confirmState.item.nombre}.` : ''}
        confirmLabel={proveedorStatusSwitch.confirmState && proveedorStatusSwitch.isPending(proveedorStatusSwitch.confirmState.item) ? 'Desactivando...' : 'Sí, desactivar'}
        confirmVariant="danger"
        confirmLoading={Boolean(proveedorStatusSwitch.confirmState && proveedorStatusSwitch.isPending(proveedorStatusSwitch.confirmState.item))}
      />

      <Modal
        open={Boolean(blockedDeactivateProveedor)}
        onClose={() => setBlockedDeactivateProveedor(null)}
        maxWidthClass="max-w-lg"
        panelClassName="p-5"
      >
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">No se puede desactivar</h3>
              <p className="ui-panel-description">
                {blockedDeactivateProveedor
                  ? `No puedes desactivar a ${blockedDeactivateProveedor.nombre} porque tiene saldo pendiente.`
                  : ''}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-danger-soft)] bg-[color-mix(in_oklab,var(--color-danger-soft)_82%,white_18%)] p-3 text-sm text-[var(--color-text)]">
            Saldo pendiente actual:{' '}
            <strong className="text-[var(--color-danger)]">{formatMoney(blockedDeactivateProveedor?.saldo_pendiente || 0)}</strong>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="danger" onClick={() => setBlockedDeactivateProveedor(null)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
