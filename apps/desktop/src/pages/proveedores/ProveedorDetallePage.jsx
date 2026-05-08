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
  const [toastVisible, setToastVisible] = useState(false);
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
    closeProveedorModal();
    await loadData();
    setStatusToast('Proveedor actualizado.');
  };

  const onToggleProveedor = async () => {
    if (!proveedorDetalle) return;

    if (proveedorDetalle.activo) {
      if (saldoProveedor > 0) {
        setBlockedDeactivateOpen(true);
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
      // store error already exposed in page alert
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
                  <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    Activo
                  </span>
                ) : (
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                    Inactivo
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Crédito / días</p>
                {proveedorDetalle.tiene_credito ? (
                  <span className="rounded-full border border-[#F5D08A] bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#9A6700]">
                    Crédito • {Number(proveedorDetalle.dias_pago || 0)} días
                  </span>
                ) : (
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                    Sin crédito
                  </span>
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
                  <span className="inline-flex rounded-full border border-[#F5D08A] bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#9A6700]">
                    Pendiente
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                    Sin deuda
                  </span>
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
                      <span className="rounded-full border border-[#F5D08A] bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#9A6700]">
                        Crédito
                      </span>
                    ) : (
                      <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                        Contado
                      </span>
                    )}
                  </TablaCelda>
                  <TablaCelda className="py-3 text-right font-semibold text-[var(--color-text)]">{formatMoney(factura.total)}</TablaCelda>
                  <TablaCelda className="py-3 text-right">
                    {pendiente > 0 ? (
                      <span className="rounded-full border border-[#F5D08A] bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#9A6700]">
                        Pendiente {formatMoney(pendiente)}
                      </span>
                    ) : (
                      <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                        Sin deuda
                      </span>
                    )}
                  </TablaCelda>
                  <TablaCelda className="py-3">
                    {estado === 'Pendiente' ? (
                      <span className="rounded-full border border-[#F5D08A] bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#9A6700]">
                        Pendiente
                      </span>
                    ) : (
                      <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                        Pagada
                      </span>
                    )}
                  </TablaCelda>
                  <TablaCelda className="py-3">
                    <div className="flex justify-end">
                      <TableActions>
                        <TableActionButton
                          variant="neutral"
                          icon={<PiEye />}
                          aria-label="Ver factura"
                          title="Ver factura"
                          className="border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                          onClick={() => navigate(`/proveedores/${proveedorId}/facturas/${factura.id}`)}
                        >
                          Ver
                        </TableActionButton>
                        {sinPendiente ? null : (
                          <TableActionButton
                            variant="secondary"
                            icon={<PiCurrencyDollar />}
                            aria-label="Pagar factura"
                            title="Pagar factura"
                            className="h-8 border border-[var(--color-text)] bg-[var(--color-text)] px-3 text-white hover:border-black hover:bg-black"
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

      <Modal open={proveedorModal.open} onClose={closeProveedorModal} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Editar proveedor</h3>
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
        blockedMessage="El proveedor mantiene cuentas pendientes por pagar."
        confirmLoading={deactivateLoading}
        onCloseConfirm={() => setConfirmDeactivateOpen(false)}
        onConfirm={onConfirmDeactivate}
        onCloseBlocked={() => setBlockedDeactivateOpen(false)}
      />
    </div>
  );
}
