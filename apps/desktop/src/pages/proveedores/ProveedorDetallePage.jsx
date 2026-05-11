import { useEffect, useMemo, useState } from 'react';
import { PiCurrencyDollar, PiEye, PiPencilSimple } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  BackButton,
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Paginador,
  DeactivateEntityDialogs,
  StatusBadge,
  Switch,
  TableActions,
  TableActionButton,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea,
  Toast
} from '../../ui';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { useCajaStore } from '../../stores/cajaStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import useFormErrors from '../../shared/hooks/useFormErrors';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';
import ProveedorPagoModal from './ProveedorPagoModal';

const PAGE_SIZE = GLOBAL_PAGE_SIZE;

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

function formatCondicionFactura(factura) {
  const normalized = String(factura?.condicion || factura?.metodo_pago || '').trim().toUpperCase();
  return normalized === 'CREDITO' || normalized === 'CRÉDITO' ? 'Crédito' : 'Contado';
}

function formatEstadoFactura(factura) {
  if (factura?.estado) {
    const estado = String(factura.estado).toUpperCase();
    if (estado === 'PAGADA') return 'Pagada';
    if (estado === 'PENDIENTE') return 'Pendiente';
  }
  return Number(factura?.pendiente || 0) > 0 ? 'Pendiente' : 'Pagada';
}

function isInvalidFacturaReference(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return true;
  const normalized = raw.replace(/[\s\-_.:/]/g, '');
  if (!normalized) return true;
  return /^0+$/.test(normalized);
}

function formatFacturaReference(factura) {
  const candidates = [
    factura?.numero_factura,
    factura?.referencia,
    factura?.numero_documento,
    factura?.documento_origen
  ];
  const validReference = candidates.find((value) => !isInvalidFacturaReference(value));
  return validReference ? String(validReference).trim() : 'Sin referencia';
}

export default function ProveedorDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const configuracion = useConfiguracionStore((state) => state.configuracion);
  const turnoActual = useCajaStore((state) => state.turnoActual);
  const fetchTurnoActual = useCajaStore((state) => state.fetchTurnoActual);
  const {
    proveedorDetalle,
    facturas,
    resumenCxp,
    loading,
    error,
    getById,
    cargarFacturas,
    cargarResumenCxp,
    pagarCredito,
    actualizar
  } = useProveedoresStore();

  const [pagina, setPagina] = useState(1);
  const [modalPago, setModalPago] = useState(null);
  const [proveedorModal, setProveedorModal] = useState({ open: false, mode: 'edit' });
  const [proveedorForm, setProveedorForm] = useState(emptyProveedorForm);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [blockedDeactivateOpen, setBlockedDeactivateOpen] = useState(false);
  const [statusToast, setStatusToast] = useState('');
  const [statusToastError, setStatusToastError] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [errorToastVisible, setErrorToastVisible] = useState(false);
  const proveedorFormErrors = useFormErrors();

  const proveedorId = Number(id);
  const saldoProveedor = Number(resumenCxp?.saldo || 0);

  const loadData = async () => {
    await Promise.all([
      getById(proveedorId),
      cargarFacturas(proveedorId),
      cargarResumenCxp(proveedorId),
      fetchTurnoActual({ silent: true }).catch(() => {})
    ]);
  };

  useEffect(() => {
    if (!Number.isFinite(proveedorId) || proveedorId <= 0) return;
    loadData();
  }, [proveedorId]);

  const facturasOrdenadas = useMemo(() => {
    return [...facturas].sort((a, b) => {
      const pendienteA = Number(a.pendiente || 0) > 0 ? 0 : 1;
      const pendienteB = Number(b.pendiente || 0) > 0 ? 0 : 1;
      if (pendienteA !== pendienteB) return pendienteA - pendienteB;
      return Number(b.id) - Number(a.id);
    });
  }, [facturas]);

  const totalPaginas = Math.max(1, Math.ceil(facturasOrdenadas.length / PAGE_SIZE));
  const facturasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return facturasOrdenadas.slice(start, start + PAGE_SIZE);
  }, [facturasOrdenadas, pagina]);
  const totalFacturasPendientes = useMemo(
    () => facturasOrdenadas.filter((factura) => Number(factura.pendiente || 0) > 0).length,
    [facturasOrdenadas]
  );

  useEffect(() => {
    setPagina(1);
  }, [facturas.length]);

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

  useEffect(() => {
    if (!statusToastError) return undefined;
    setErrorToastVisible(true);
    const hideTimer = window.setTimeout(() => setErrorToastVisible(false), 2400);
    const clearTimer = window.setTimeout(() => setStatusToastError(''), 2580);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToastError]);

  const onRegistrarPago = async (payload) => {
    await pagarCredito(proveedorId, payload);
    setModalPago(null);
    await loadData();
    setStatusToast('Pago registrado correctamente');
  };

  const openEditModal = () => {
    if (!proveedorDetalle) return;
    setProveedorModal({ open: true, mode: 'edit' });
    proveedorFormErrors.resetErrors();
    setProveedorForm({
      id: proveedorDetalle.id,
      nombre: proveedorDetalle.nombre || '',
      telefono: proveedorDetalle.telefono || '',
      direccion: proveedorDetalle.direccion || '',
      observacion: proveedorDetalle.observacion || '',
      tiene_credito: Boolean(proveedorDetalle.tiene_credito),
      dias_pago: String(Number(proveedorDetalle.dias_pago || 0)),
      activo: Boolean(proveedorDetalle.activo)
    });
  };

  const closeProveedorModal = () => {
    setProveedorModal({ open: false, mode: 'edit' });
    setProveedorForm(emptyProveedorForm);
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

    const estabaActivo = Boolean(proveedorDetalle?.activo);
    const quiereDesactivar = estabaActivo && !proveedorForm.activo;
    if (quiereDesactivar && saldoProveedor > 0) {
      setBlockedDeactivateOpen(true);
      setStatusToastError('No se puede desactivar este proveedor porque mantiene deuda pendiente.');
      return;
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

    await actualizar(proveedorId, payload);
    setStatusToast('Proveedor actualizado correctamente.');
    if (proveedorForm.tiene_credito !== Boolean(proveedorDetalle?.tiene_credito)) {
      setStatusToast('Crédito del proveedor actualizado correctamente.');
    }
    closeProveedorModal();
    await loadData();
  };

  const onToggleProveedor = async () => {
    if (!proveedorDetalle) return;

    if (proveedorDetalle.activo) {
      if (saldoProveedor > 0) {
        setBlockedDeactivateOpen(true);
        setStatusToastError('No se puede desactivar este proveedor porque mantiene deuda pendiente.');
        return;
      }
      setConfirmDeactivateOpen(true);
      return;
    }

    try {
      await actualizar(proveedorId, { activo: true });
      await loadData();
      setStatusToast('Proveedor ha sido activado.');
    } catch (_) {
      setStatusToastError('Error al actualizar proveedor.');
    }
  };

  const onConfirmDeactivate = async () => {
    setDeactivateLoading(true);
    try {
      await actualizar(proveedorId, { activo: false });
      setConfirmDeactivateOpen(false);
      await loadData();
      setStatusToast('Proveedor ha sido desactivado.');
    } catch (_) {
      setStatusToastError('Error al actualizar proveedor.');
      setConfirmDeactivateOpen(false);
    } finally {
      setDeactivateLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {statusToast ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast tone="success" className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToast}</Toast>
        </div>
      ) : null}
      {statusToastError ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast tone="danger" className={errorToastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToastError}</Toast>
        </div>
      ) : null}

      <BackButton to="/proveedores">Volver</BackButton>

      <PageHeader
        title="Detalle del proveedor"
        description="Facturas, saldo pendiente y pagos."
        actions={(
          <div className="flex flex-wrap gap-2">
            {proveedorDetalle ? (
              <>
                <Button variant="secondary" onClick={openEditModal}>
                  <PiPencilSimple className="text-base" />
                  Editar
                </Button>
                <Button
                  variant={proveedorDetalle.activo ? 'danger' : 'primary'}
                  onClick={onToggleProveedor}
                >
                  {proveedorDetalle.activo ? 'Desactivar proveedor' : 'Activar proveedor'}
                </Button>
              </>
            ) : null}
          </div>
        )}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      {proveedorDetalle ? (
        <Card className="p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Proveedor</p>
                <p className="text-lg font-semibold text-[var(--color-text)]">{proveedorDetalle.nombre}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Teléfono</p>
                <p className="font-semibold text-[var(--color-text)]">{proveedorDetalle.telefono || '-'}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Dirección</p>
                <p className="text-sm text-[var(--color-text)]">{proveedorDetalle.direccion || '-'}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Estado</p>
                {proveedorDetalle.activo ? (
                  <StatusBadge status="ACTIVO" />
                ) : (
                  <StatusBadge status="INACTIVO" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Crédito / días</p>
                {proveedorDetalle.tiene_credito ? (
                  <StatusBadge tone="warning">Crédito • {Number(proveedorDetalle.dias_pago || 0)} días</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">Sin crédito</StatusBadge>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Observación</p>
                <p className="text-sm text-[var(--color-text)]">{proveedorDetalle.observacion || '-'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#F5D08A] bg-[#FFFBF2] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Deuda total</p>
              <p className="mt-2 text-3xl font-black leading-none text-[var(--color-text)]">
                {formatMoney(saldoProveedor)}
              </p>
              <div className="mt-2">
                {saldoProveedor > 0 ? (
                  <StatusBadge tone="warning">Pendiente</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">Sin deuda</StatusBadge>
                )}
              </div>
              <p className="mt-2 text-xs font-medium text-[var(--color-text)]">
                Facturas pendientes: {totalFacturasPendientes}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Balance actual de cuentas por pagar.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-3 p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="font-semibold text-[var(--color-text)]">Facturas / compras del proveedor</p>
          <span className="ui-chip ui-chip-info">{facturasOrdenadas.length} registros</span>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">N.º factura</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Condición</TablaCelda>
              <TablaCelda as="th" className="text-right">Total</TablaCelda>
              <TablaCelda as="th" className="text-right">Pendiente</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {facturasPaginadas.map((factura) => {
              const pendiente = Number(factura.pendiente || 0);
              const sinPendiente = pendiente <= 0;
              const condicion = formatCondicionFactura(factura);
              const estado = formatEstadoFactura(factura);
              return (
                <TablaFila key={factura.id} className="transition-colors hover:bg-[var(--color-surface-muted)]">
                  <TablaCelda className="py-3 font-semibold text-[var(--color-text)]">{formatFacturaReference(factura)}</TablaCelda>
                  <TablaCelda className="py-3">{formatDateQuito(factura.fecha)}</TablaCelda>
                  <TablaCelda className="py-3">
                    {condicion === 'Crédito' ? (
                      <StatusBadge tone="warning">Crédito</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Contado</StatusBadge>
                    )}
                  </TablaCelda>
                  <TablaCelda className="py-3 text-right font-semibold text-[var(--color-text)]">{formatMoney(factura.total)}</TablaCelda>
                  <TablaCelda className="py-3 text-right">
                    {pendiente > 0 ? (
                      <StatusBadge tone="warning">Pendiente {formatMoney(pendiente)}</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Sin deuda</StatusBadge>
                    )}
                  </TablaCelda>
                  <TablaCelda className="py-3">
                    {estado === 'Pendiente' ? (
                      <StatusBadge tone="warning">Pendiente</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Pagada</StatusBadge>
                    )}
                  </TablaCelda>
                  <TablaCelda className="py-3">
                    <div className="flex justify-end">
                      <TableActions>
                        <TableActionButton
                          variant="view"
                          icon={<PiEye />}
                          aria-label="Ver factura"
                          title="Ver factura"
                          onClick={() => navigate(`/proveedores/${proveedorId}/facturas/${factura.id}`)}
                        >
                          Ver
                        </TableActionButton>
                        {sinPendiente ? null : (
                          <TableActionButton
                            variant="primary"
                            icon={<PiCurrencyDollar />}
                            aria-label="Pagar factura"
                            title="Pagar factura"

                            onClick={() => setModalPago(factura)}
                          >
                            Pagar
                          </TableActionButton>
                        )}
                      </TableActions>
                    </div>
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
            totalRegistros={facturasOrdenadas.length}
            mostrarSiempre
            onPageChange={setPagina}
          />
        </div>
      </Card>

      {loading ? <LoadingState label="Cargando proveedor..." /> : null}

      <Modal open={proveedorModal.open} onClose={closeProveedorModal} maxWidthClass="max-w-4xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Editar proveedor</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Configura datos comerciales, crédito y estado del proveedor.</p>
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

          <Field label="Días de pago" hint="Solo aplica cuando compras a crédito está activo." error={proveedorFormErrors.errors.dias_pago}>
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

          <div className="md:col-span-2 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Configuración comercial</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                <Switch
                  checked={proveedorForm.activo}
                  onChange={(checked) => setProveedorForm((prev) => ({ ...prev, activo: checked }))}
                  label="Proveedor activo"
                  description="Si está inactivo no aparece como opción para nuevas compras."
                />
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                <Switch
                  checked={proveedorForm.tiene_credito}
                  onChange={(checked) => setProveedorForm((prev) => ({ ...prev, tiene_credito: checked }))}
                  label="Compras a crédito"
                  description="Permite registrar nuevas compras con saldo pendiente."
                />
              </div>
            </div>
            {(saldoProveedor > 0 || totalFacturasPendientes > 0) ? (
              <div className="rounded-xl border border-[#F5D08A] bg-[#FFF7E6] p-3 text-sm text-[#9A6700]">
                <p>Deuda pendiente actual: ${Number(saldoProveedor || 0).toFixed(2)}</p>
                <p>Facturas pendientes: {Number(totalFacturasPendientes || 0)}</p>
                <p>Desactivar esta opción solo impedirá nuevas compras a crédito. Las cuentas pendientes seguirán activas.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={closeProveedorModal}>
            Cancelar
          </Button>
          <Button onClick={onSaveProveedor}>
            Guardar proveedor
          </Button>
        </div>
      </Modal>

      <ProveedorPagoModal
        open={Boolean(modalPago)}
        onClose={() => setModalPago(null)}
        onSubmit={onRegistrarPago}
        proveedor={proveedorDetalle}
        factura={modalPago}
        configuracion={configuracion}
        turnoActual={turnoActual}
        loading={loading}
      />

      <DeactivateEntityDialogs
        confirmOpen={confirmDeactivateOpen}
        blockedOpen={blockedDeactivateOpen}
        entityType="proveedor"
        entityName={proveedorDetalle?.nombre || '-'}
        pendingAmountLabel={formatMoney(saldoProveedor)}
        blockedMessage="No se puede desactivar este proveedor porque mantiene deuda pendiente."
        confirmLoading={deactivateLoading}
        onCloseConfirm={() => setConfirmDeactivateOpen(false)}
        onConfirm={onConfirmDeactivate}
        onCloseBlocked={() => setBlockedDeactivateOpen(false)}
      />
    </div>
  );
}
