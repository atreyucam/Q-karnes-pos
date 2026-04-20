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
  Select,
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
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';
import useFormErrors from '../../shared/hooks/useFormErrors';

const PAGE_SIZE = 8;
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

export default function ProveedorDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const configuracion = useConfiguracionStore((state) => state.configuracion);
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
    actualizar,
    cargarFacturaDetalle
  } = useProveedoresStore();

  const [pagina, setPagina] = useState(1);
  const [modalPago, setModalPago] = useState(null);
  const [montoPago, setMontoPago] = useState('0');
  const [referencia, setReferencia] = useState('');
  const [modalFactura, setModalFactura] = useState(false);
  const [facturaDetalle, setFacturaDetalle] = useState(null);
  const [proveedorModal, setProveedorModal] = useState({ open: false, mode: 'edit' });
  const [proveedorForm, setProveedorForm] = useState(emptyProveedorForm);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [blockedDeactivateOpen, setBlockedDeactivateOpen] = useState(false);
  const [statusToast, setStatusToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const proveedorFormErrors = useFormErrors();
  const pagoFormErrors = useFormErrors();

  const proveedorId = Number(id);

  const loadData = async () => {
    await Promise.all([getById(proveedorId), cargarFacturas(proveedorId), cargarResumenCxp(proveedorId)]);
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
  const facturaResumenSeleccionada = useMemo(
    () => facturas.find((factura) => Number(factura.id) === Number(facturaDetalle?.factura?.id)) || null,
    [facturaDetalle?.factura?.id, facturas]
  );
  const facturaPendiente = useMemo(() => {
    if (facturaResumenSeleccionada) return Number(facturaResumenSeleccionada.pendiente || 0);

    const movimientos = facturaDetalle?.movimientos || [];
    const cargos = movimientos
      .filter((movimiento) => movimiento.tipo === 'CARGO')
      .reduce((acc, movimiento) => acc + Number(movimiento.monto || 0), 0);
    const abonos = movimientos
      .filter((movimiento) => movimiento.tipo === 'ABONO')
      .reduce((acc, movimiento) => acc + Number(movimiento.monto || 0), 0);
    const base = cargos > 0 ? cargos : Number(facturaDetalle?.factura?.total || 0);
    return Math.max(0, base - abonos);
  }, [facturaDetalle?.factura?.total, facturaDetalle?.movimientos, facturaResumenSeleccionada]);

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

  const onPagar = async () => {
    if (!modalPago) return;
    const nextErrors = {};
    const monto = Number(montoPago || 0);
    if (!String(montoPago || '').trim()) nextErrors.monto = 'Este campo es obligatorio.';
    else if (!(monto > 0)) nextErrors.monto = 'Ingresa un valor válido.';
    if (!pagoFormErrors.setErrors(nextErrors)) return;

    await pagarCredito(proveedorId, {
      factura_id: modalPago.id,
      monto,
      referencia: referencia || null
    });
    setModalPago(null);
    setMontoPago('0');
    setReferencia('');
    pagoFormErrors.resetErrors();
    loadData();
  };

  const onVerFactura = async (facturaId) => {
    const data = await cargarFacturaDetalle(proveedorId, facturaId);
    setFacturaDetalle(data);
    setModalFactura(true);
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

    const saldoPendiente = Number(resumenCxp?.saldo || 0);
    const estabaActivo = Boolean(proveedorDetalle?.activo);
    const quiereDesactivar = estabaActivo && !proveedorForm.activo;

    if (quiereDesactivar && saldoPendiente > 0) {
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
      if (Number(resumenCxp?.saldo || 0) > 0) {
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
    } catch (error) {
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
            {proveedorDetalle && (
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
            )}
          </div>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {proveedorDetalle && (
        <Card className="p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
            <div className="space-y-3 p-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Proveedor</span>
                <span className="font-semibold text-[var(--color-text)]">{proveedorDetalle.nombre}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Teléfono</span>
                <span className="font-semibold text-[var(--color-text)]">{proveedorDetalle.telefono || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Dirección</span>
                <span className="text-[var(--color-text)]">{proveedorDetalle.direccion || '-'}</span>
              </div>
            </div>

            <div className="space-y-3 p-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</span>
                <StatusBadge status={proveedorDetalle.activo ? 'ACTIVO' : 'INACTIVO'} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Crédito / días</span>
                <StatusBadge tone={proveedorDetalle.tiene_credito ? 'warning' : 'neutral'}>
                  {proveedorDetalle.tiene_credito ? `${Number(proveedorDetalle.dias_pago || 0)} días` : 'Sin crédito'}
                </StatusBadge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación</span>
                <span className="text-[var(--color-text)]">{proveedorDetalle.observacion || '-'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Saldo pendiente</p>
              <p className={`mt-3 text-3xl font-extrabold ${Number(resumenCxp?.saldo || 0) > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                {formatMoney(resumenCxp?.saldo)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Balance actual de cuentas por pagar del proveedor.
              </p>
            </div>
          </div>
        </Card>
      )}

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
              <TablaCelda as="th">Método</TablaCelda>
              <TablaCelda as="th" className="text-right">Total</TablaCelda>
              <TablaCelda as="th" className="text-right">Pendiente</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {facturasPaginadas.map((factura) => {
              const pendiente = Number(factura.pendiente || 0);
              const sinPendiente = pendiente <= 0;
              return (
                <TablaFila key={factura.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{factura.numero_factura}</TablaCelda>
                  <TablaCelda>{formatDateQuito(factura.fecha)}</TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={factura.metodo_pago} />
                  </TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(factura.total)}</TablaCelda>
                  <TablaCelda className={`text-right font-semibold ${pendiente > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                    {formatMoney(pendiente)}
                  </TablaCelda>
                  <TablaCelda>
                    <TableActions>
                      <TableActionButton
                        variant="neutral"
                        icon={<PiEye />}
                        aria-label="Ver factura"
                        title="Ver factura"
                        onClick={() => onVerFactura(factura.id)}
                      >
                        Ver
                      </TableActionButton>
                      <TableActionButton
                        variant="secondary"
                        icon={<PiCurrencyDollar />}
                        aria-label="Pagar credito"
                        title={sinPendiente ? 'Sin saldo pendiente' : 'Pagar crédito'}
                        disabled={factura.metodo_pago !== 'CREDITO' || sinPendiente}
                        onClick={() => {
                          setModalPago(factura);
                          setMontoPago(String(Number(factura.pendiente || 0).toFixed(2)));
                          setReferencia('');
                        }}
                      >
                        Pagar
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
            totalRegistros={facturasOrdenadas.length}
            mostrarSiempre
            onPageChange={setPagina}
          />
        </div>
      </Card>

      {loading && <LoadingState label="Cargando proveedor..." />}

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

      <Modal open={Boolean(modalPago)} onClose={() => setModalPago(null)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Pagar crédito</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Factura {modalPago?.numero_factura}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setModalPago(null)}>
            X
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <p className="text-[var(--color-text-muted)]">Pendiente: <span className="font-semibold text-[var(--color-text)]">{formatMoney(modalPago?.pendiente)}</span></p>
          <p className="text-[var(--color-text-muted)]">
            {configuracion?.exigir_caja_abierta_para_pagos
              ? 'Este pago impacta caja y requiere turno abierto.'
              : 'Este pago puede registrarse sin turno abierto; si existe turno abierto tambien queda en caja.'}
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Monto" required error={pagoFormErrors.errors.monto}>
            <Input
              className="mt-2"
              value={montoPago}
              onChange={(e) => {
                pagoFormErrors.clearFieldError('monto');
                setMontoPago(e.target.value);
              }}
              placeholder="Monto a pagar"
            />
          </Field>
          <Field label="Referencia">
            <Input className="mt-2" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia (opcional)" />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalPago(null)}>
            Cancelar
          </Button>
          <Button disabled={loading} onClick={onPagar}>
            Confirmar pago
          </Button>
        </div>
      </Modal>

      <Modal open={modalFactura && Boolean(facturaDetalle)} onClose={() => setModalFactura(false)} maxWidthClass="max-w-5xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Detalle factura proveedor</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Resumen de compra, pagos y trazabilidad de la factura.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setModalFactura(false)}>
            X
          </Button>
        </div>

        {facturaDetalle?.factura && (
          <Card className="mt-4 grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Proveedor</p>
                <p className="text-[1.12rem] font-bold text-[var(--color-text)]">{proveedorDetalle?.nombre || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Telefono</p>
                <p className="font-semibold text-[var(--color-text)]">{proveedorDetalle?.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Credito / dias</p>
                <p className="font-semibold text-[var(--color-text)]">
                  {proveedorDetalle?.tiene_credito ? 'Sí' : 'No'} / {Number(proveedorDetalle?.dias_pago || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Factura</p>
                <p className="font-semibold text-[var(--color-text)]">{facturaDetalle.factura.numero_factura}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Fecha de emisión</p>
                <p className="font-semibold text-[var(--color-text)]">{formatDateQuito(facturaDetalle.factura.fecha)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Observación</p>
                <p className="font-semibold text-[var(--color-text)]">{facturaDetalle.factura.observacion || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Método de pago</p>
                <div className="pt-1">
                  <StatusBadge status={facturaDetalle.factura.metodo_pago} />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Pendiente residual</p>
                <p className={`font-semibold ${facturaPendiente > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                  {formatMoney(facturaPendiente)}
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="mt-4 space-y-4">
          {(facturaResumenSeleccionada?.orden_id || facturaResumenSeleccionada?.recepcion_id || facturaResumenSeleccionada?.fecha_vencimiento) && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Orden asociada</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                  {facturaResumenSeleccionada?.orden_id ? `#${facturaResumenSeleccionada.orden_id}` : '-'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Recepción asociada</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                  {facturaResumenSeleccionada?.recepcion_id ? `#${facturaResumenSeleccionada.recepcion_id}` : '-'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Vencimiento</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                  {facturaResumenSeleccionada?.fecha_vencimiento ? formatDateQuito(facturaResumenSeleccionada.fecha_vencimiento) : '-'}
                </p>
              </div>
            </div>
          )}

          <Card className="space-y-3 p-4">
            <p className="font-semibold text-[var(--color-text)]">Items factura</p>
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Cantidad</TablaCelda>
                  <TablaCelda as="th" className="text-right">C.Unit</TablaCelda>
                  <TablaCelda as="th" className="text-right">Subtotal</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {(facturaDetalle?.items || []).map((item) => (
                  <TablaFila key={item.id}>
                    <TablaCelda>{item.producto_codigo} - {item.producto_nombre}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(item.cantidad, item.unidad_medida || item.unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(item.costo_unit_real)}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(item.subtotal)}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </Card>

          {(facturaDetalle?.movimientos || []).length > 0 && (
            <Card className="space-y-3 p-4">
              <p className="font-semibold text-[var(--color-text)]">Movimientos de pago</p>
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Fecha</TablaCelda>
                    <TablaCelda as="th">Tipo</TablaCelda>
                    <TablaCelda as="th" className="text-right">Monto</TablaCelda>
                    <TablaCelda as="th">Observación</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {(facturaDetalle.movimientos || []).map((movimiento) => (
                    <TablaFila key={movimiento.id}>
                      <TablaCelda>{formatDateQuito(movimiento.fecha || movimiento.fecha_emision)}</TablaCelda>
                      <TablaCelda>
                        <StatusBadge status={movimiento.tipo === 'ABONO' ? 'PARCIAL' : 'CREDITO'}>
                          {movimiento.tipo}
                        </StatusBadge>
                      </TablaCelda>
                      <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(movimiento.monto)}</TablaCelda>
                      <TablaCelda>{movimiento.observacion || movimiento.referencia || '-'}</TablaCelda>
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>
            </Card>
          )}
        </div>
      </Modal>

      <Modal open={blockedDeactivateOpen} onClose={() => setBlockedDeactivateOpen(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">No se puede desactivar</h3>
              <p className="ui-panel-description">
                {proveedorDetalle ? `No puedes desactivar a ${proveedorDetalle.nombre} porque tiene saldo pendiente.` : ''}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-danger-soft)] bg-[color-mix(in_oklab,var(--color-danger-soft)_82%,white_18%)] p-3 text-sm text-[var(--color-text)]">
            Saldo pendiente actual:{' '}
            <strong className="text-[var(--color-danger)]">{formatMoney(resumenCxp?.saldo || 0)}</strong>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="danger" onClick={() => setBlockedDeactivateOpen(false)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmDeactivateOpen} onClose={() => setConfirmDeactivateOpen(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">Confirmar desactivacion</h3>
            </div>
            <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setConfirmDeactivateOpen(false)}>
              X
            </Button>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {proveedorDetalle ? `Vas a desactivar al proveedor ${proveedorDetalle.nombre}.` : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmDeactivateOpen(false)} disabled={deactivateLoading}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={onConfirmDeactivate} disabled={deactivateLoading}>
              {deactivateLoading ? 'Desactivando...' : 'Sí, desactivar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
