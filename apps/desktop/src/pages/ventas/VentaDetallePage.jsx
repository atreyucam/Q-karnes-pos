import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useVentasStore } from '../../stores/ventasStore';
import { useCajaStore } from '../../stores/cajaStore';
import { useAuthStore } from '../../stores/authStore';
import {
  Alert,
  BackButton,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../ui';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, getUnidad } from '../../lib/formatQty';
import { printSaleTicketDocument } from './printTicket';
import DevolucionModal from './DevolucionModal';
import { SALE_STATUS } from './ventaUtils';
import useFormErrors from '../../shared/hooks/useFormErrors';

function resolvePaymentTypeLabel(row) {
  const tipo = String(row?.tipo || '').trim().toUpperCase();
  if (tipo === 'TRANSFERENCIA') return 'Transferencia';
  if (tipo === 'CREDITO') return 'Crédito';
  return 'Efectivo';
}

function resolveCashImpact(row) {
  return row?.afecta_caja ? 'Sí' : 'No';
}

function resolveMetodoLabel(value) {
  return String(value || '-').replace(/_/g, ' ');
}

function EmptyRow({ colSpan, text }) {
  return (
    <TablaFila>
      <TablaCelda colSpan={colSpan} className="py-8 text-center text-[var(--color-text-muted)]">
        {text}
      </TablaCelda>
    </TablaFila>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="text-sm font-medium text-[var(--color-text)]">{value || '-'}</p>
    </div>
  );
}

function TotalsRow({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span
        className={`text-sm ${strong ? 'font-semibold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}
      >
        {label}
      </span>
      <span
        className={`text-right ${strong ? 'text-xl font-bold text-[var(--color-text)]' : 'text-base font-semibold text-[var(--color-text)]'}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function VentaDetallePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const ventaId = Number(id);
  const detalleVenta = useVentasStore((s) => s.detalle);
  const cargarDevoluciones = useVentasStore((s) => s.cargarDevoluciones);
  const cargarTicket = useVentasStore((s) => s.cargarTicket);
  const crearDevolucion = useVentasStore((s) => s.crearDevolucion);
  const anularVenta = useVentasStore((s) => s.anularVenta);
  const ventaDetalle = useVentasStore((s) => s.ventaDetalle);
  const devoluciones = useVentasStore((s) => s.devoluciones);
  const loading = useVentasStore((s) => s.loading);
  const error = useVentasStore((s) => s.error);

  const turnoActual = useCajaStore((s) => s.turnoActual);
  const fetchTurnoActual = useCajaStore((s) => s.fetchTurnoActual);

  const user = useAuthStore((s) => s.user);

  const [devolucionOpen, setDevolucionOpen] = useState(false);
  const [anulacionOpen, setAnulacionOpen] = useState(false);
  const [submittingDevolucion, setSubmittingDevolucion] = useState(false);
  const [submittingAnulacion, setSubmittingAnulacion] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [anulacionForm, setAnulacionForm] = useState({
    motivo: '',
    novedad: '',
    usuario: '',
    password: ''
  });
  const anulacionFormErrors = useFormErrors();

  const loadContext = async () => {
    await Promise.all([
      detalleVenta(ventaId),
      cargarDevoluciones(ventaId),
      fetchTurnoActual({ silent: true }).catch(() => {})
    ]);
  };

  useEffect(() => {
    if (!Number.isFinite(ventaId) || ventaId <= 0) return;
    loadContext().catch(() => {});
  }, [ventaId]);

  const venta = ventaDetalle?.venta || null;

  const pagos = useMemo(
    () => (Array.isArray(ventaDetalle?.pagos) ? ventaDetalle.pagos : []),
    [ventaDetalle?.pagos]
  );

  const detalleRows = useMemo(
    () => (Array.isArray(ventaDetalle?.detalle) ? ventaDetalle.detalle : []),
    [ventaDetalle?.detalle]
  );

  const resumenPago = ventaDetalle?.resumen_pago || null;

  const devolucionesRows = useMemo(
    () => (Array.isArray(devoluciones?.devoluciones) ? devoluciones.devoluciones : []),
    [devoluciones?.devoluciones]
  );

  const devolucionDetalleRows = useMemo(
    () => (Array.isArray(devoluciones?.detalle) ? devoluciones.detalle : []),
    [devoluciones?.detalle]
  );

  const ventaAbonos = useMemo(
    () => (Array.isArray(ventaDetalle?.abonos) ? ventaDetalle.abonos : []),
    [ventaDetalle?.abonos]
  );

  const movimientosPagoRows = useMemo(() => {
    const pagosBase = pagos.map((row) => ({
      id: `pago-${row.id}`,
      fecha: row.fecha || row.fecha_emision || venta?.fecha || null,
      movimiento: row.tipo ? `Cobro ${resolvePaymentTypeLabel(row).toLowerCase()}` : 'Cobro',
      metodo: resolveMetodoLabel(row.metodo_codigo || row.tipo || '-'),
      caja: resolveCashImpact(row),
      monto: Number(row.monto || 0),
      referencia: row.referencia || row.observacion || `Venta #${venta?.id || ventaId}`
    }));

    const abonosCredito = ventaAbonos.map((abono) => ({
      id: `abono-${abono.id}`,
      fecha: abono.fecha || abono.fecha_emision || venta?.fecha || null,
      movimiento: 'Abono de crédito',
      metodo: resolveMetodoLabel(abono.metodo_pago || abono.metodo || 'CRÉDITO'),
      caja:
        String(abono.metodo_pago || abono.metodo || '').toUpperCase() === 'EFECTIVO' ? 'Sí' : 'No',
      monto: Number(abono.monto || 0),
      referencia: abono.observacion || abono.referencia || '-'
    }));

    return [...pagosBase, ...abonosCredito].sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
      return fechaB - fechaA;
    });
  }, [pagos, ventaAbonos, venta, ventaId]);

  const canReturn =
    Boolean(venta) && ![SALE_STATUS.ANULADA, SALE_STATUS.DEVUELTA_TOTAL].includes(venta.estado);

  const canAnular =
    Boolean(venta) && venta.estado === SALE_STATUS.EMITIDA && devolucionesRows.length === 0;

  const needsCashShiftForAnular =
    Number(resumenPago?.contado_centavos || 0) > 0 && !turnoActual?.id;

  const isAdmin = user?.rol?.nombre === 'ADMIN';

  useEffect(() => {
    if (!venta) return;

    const action = searchParams.get('action');

    if (action === 'devolucion' && canReturn) {
      setDevolucionOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      setSearchParams(nextParams, { replace: true });
      return;
    }

    if (action === 'anular' && canAnular) {
      setAnulacionOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      setSearchParams(nextParams, { replace: true });
    }
  }, [canAnular, canReturn, searchParams, setSearchParams, venta]);

  const handlePrint = async () => {
    try {
      setPrinting(true);
      const ticketData = await cargarTicket(ventaId);
      printSaleTicketDocument(ticketData);
    } catch (_) {
      // store handles message
    } finally {
      setPrinting(false);
    }
  };

  const handleSubmitDevolucion = async (payload) => {
    setLocalError('');
    setSubmittingDevolucion(true);
    try {
      await crearDevolucion(ventaId, payload);
      await loadContext();
      setDevolucionOpen(false);
    } catch (_) {
      // store handles message
    } finally {
      setSubmittingDevolucion(false);
    }
  };

  const handleSubmitAnulacion = async () => {
    setLocalError('');
    const nextErrors = {};

    if (!anulacionForm.motivo.trim()) {
      nextErrors.motivo = 'Este campo es obligatorio.';
    }

    if (!anulacionForm.novedad.trim()) {
      nextErrors.novedad = 'Este campo es obligatorio.';
    }

    if (!isAdmin) {
      if (!anulacionForm.usuario.trim()) nextErrors.usuario = 'Este campo es obligatorio.';
      if (!anulacionForm.password.trim()) nextErrors.password = 'Este campo es obligatorio.';
    }

    if (!anulacionFormErrors.setErrors(nextErrors)) {
      if (!isAdmin && (nextErrors.usuario || nextErrors.password)) {
        setLocalError('Como cajero debes ingresar credenciales de administrador para anular.');
      }
      return;
    }

    if (needsCashShiftForAnular) {
      setLocalError('La venta tiene componente en efectivo y requiere caja abierta para anular.');
      return;
    }

    setSubmittingAnulacion(true);
    try {
      await anularVenta(ventaId, {
        motivo: anulacionForm.motivo.trim(),
        novedad: anulacionForm.novedad.trim(),
        autorizacion:
          !isAdmin && anulacionForm.usuario.trim() && anulacionForm.password
            ? {
                usuario: anulacionForm.usuario.trim(),
                password: anulacionForm.password
              }
            : undefined
      });
      await loadContext();
      setAnulacionOpen(false);
      setAnulacionForm({
        motivo: '',
        novedad: '',
        usuario: '',
        password: ''
      });
    } catch (_) {
      // store handles message
    } finally {
      setSubmittingAnulacion(false);
    }
  };

  return (
    <div className="space-y-5">
      <BackButton onClick={() => navigate('/ventas')}>Volver a ventas</BackButton>

      <PageHeader
        title={venta ? `Venta #${venta.id}` : `Venta #${ventaId}`}
        description="Detalle operativo completo de la venta, sus pagos, devoluciones y acciones reversibles."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handlePrint}
              disabled={printing || !venta}
            >
              {printing ? 'Generando ticket...' : 'Ver ticket'}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => setDevolucionOpen(true)}
              disabled={!canReturn}
            >
              Devolver
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => setAnulacionOpen(true)}
              disabled={!canAnular}
            >
              Anular
            </Button>
          </div>
        }
      />

      {(localError || error) && <Alert tone="error">{localError || error}</Alert>}

      {loading && !venta && <Alert tone="info">Cargando detalle de la venta...</Alert>}

      {venta && needsCashShiftForAnular ? (
        <Alert tone="warning">
          Esta venta incluye efectivo y la anulación requiere un turno de caja abierto para
          revertir el saldo.
        </Alert>
      ) : null}

      {venta && !canReturn ? (
        <Alert tone="info">
          {venta.estado === SALE_STATUS.ANULADA
            ? 'La venta ya fue anulada y no admite devoluciones.'
            : 'La venta ya fue devuelta totalmente.'}
        </Alert>
      ) : null}

      {venta && !canAnular ? (
        <Alert tone="info">
          {venta.estado !== SALE_STATUS.EMITIDA
            ? `La anulación no está disponible para el estado ${venta.estado}.`
            : 'La anulación ya no está disponible porque la venta tiene devoluciones registradas.'}
        </Alert>
      ) : null}

      {venta ? (
        <Card className="p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={venta.estado || 'PENDIENTE'} />
            </div>
          </div>

          <div className="px-5 py-5">
            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <InfoItem label="Cliente" value={venta.cliente_nombre || 'Comprobante final'} />
                <InfoItem label="Fecha" value={venta.fecha ? formatDateQuito(venta.fecha) : '-'} />
                <InfoItem label="Vendedor" value={venta.usuario_nombre || '-'} />
                <InfoItem label="Método principal" value={ventaDetalle?.resumen_pago?.label || '-'} />
                <InfoItem label="Referencia" value={venta.referencia || '-'} />
              </div>

              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
                  <div className="border-b border-[var(--color-border)] px-4 py-3">
                    <p className="font-semibold text-[var(--color-text)]">Productos vendidos</p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Incluye costo unitario al momento de la venta y margen por línea.
                    </p>
                  </div>

                  <Tabla>
                    <TablaCabecera>
                      <tr>
                        <TablaCelda as="th">Producto</TablaCelda>
                        <TablaCelda as="th">Cantidad / unidad</TablaCelda>
                        <TablaCelda as="th" className="text-right">
                          P. unit
                        </TablaCelda>
                        <TablaCelda as="th" className="text-right">
                          Total
                        </TablaCelda>
                        <TablaCelda as="th" className="text-right">
                          Costo unit.
                        </TablaCelda>
                        <TablaCelda as="th" className="text-right">
                          Subtotal costo
                        </TablaCelda>
                        <TablaCelda as="th" className="text-right">
                          Margen
                        </TablaCelda>
                      </tr>
                    </TablaCabecera>

                    <TablaCuerpo>
                      {detalleRows.length === 0 ? (
                        <EmptyRow colSpan={7} text="No hay líneas registradas en esta venta." />
                      ) : (
                        detalleRows.map((line) => (
                          <TablaFila key={line.id}>
                            <TablaCelda>
                              <div>
                                <p className="font-medium text-[var(--color-text)]">
                                  {line.producto_codigo} - {line.producto_nombre}
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)]">
                                  {getUnidad(line.unidad_medida || line.unidad)}
                                </p>
                              </div>
                            </TablaCelda>
                            <TablaCelda>
                              <span className="whitespace-nowrap">
                                {formatQtyByUnit(line.cantidad, line.unidad_medida || line.unidad)}
                              </span>
                            </TablaCelda>
                            <TablaCelda className="text-right">
                              {formatMoney(line.precio_unit || 0)}
                            </TablaCelda>
                            <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                              {formatMoney(line.total_linea || 0)}
                            </TablaCelda>
                            <TablaCelda className="text-right">
                              {formatMoney(line.costo_unit_snapshot || 0)}
                            </TablaCelda>
                            <TablaCelda className="text-right">
                              {formatMoney(line.subtotal_costo || 0)}
                            </TablaCelda>
                            <TablaCelda className="text-right font-semibold">
                              {formatMoney(line.margen || 0)}
                            </TablaCelda>
                          </TablaFila>
                        ))
                      )}
                    </TablaCuerpo>
                  </Tabla>
                </div>

                <div className="flex justify-end">
                  <div className="w-full max-w-[320px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                    <div className="space-y-3">
                      <TotalsRow
                        label="Costo total"
                        value={formatMoney(venta.total_costo || 0)}
                      />
                      <TotalsRow
                        label="Margen total"
                        value={formatMoney(venta.total_margen || 0)}
                      />
                      <div className="border-t border-[var(--color-border)] pt-3">
                        <TotalsRow
                          label="Total venta"
                          value={formatMoney(venta.total || 0)}
                          strong
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <p className="font-semibold text-[var(--color-text)]">Devoluciones</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Historial completo de reversiones asociadas a esta venta.
            </p>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">ID</TablaCelda>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Motivo</TablaCelda>
                <TablaCelda as="th">Método</TablaCelda>
                <TablaCelda as="th" className="text-right">
                  Total
                </TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {devolucionesRows.length === 0 ? (
                <EmptyRow colSpan={5} text="Sin devoluciones registradas." />
              ) : (
                devolucionesRows.map((row) => (
                  <TablaFila key={row.id}>
                    <TablaCelda>#{row.id}</TablaCelda>
                    <TablaCelda>{row.fecha ? formatDateQuito(row.fecha) : '-'}</TablaCelda>
                    <TablaCelda>{row.motivo}</TablaCelda>
                    <TablaCelda>{row.metodo_pago_label || '-'}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                      {formatMoney(row.total_devuelto || 0)}
                    </TablaCelda>
                  </TablaFila>
                ))
              )}
            </TablaCuerpo>
          </Tabla>
        </Card>

        <Card className="p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <p className="font-semibold text-[var(--color-text)]">Movimientos de pago</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Historial operativo de cobros y abonos asociados a esta venta.
            </p>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Movimiento</TablaCelda>
                <TablaCelda as="th">Método</TablaCelda>
                <TablaCelda as="th">Caja</TablaCelda>
                <TablaCelda as="th" className="text-right">
                  Monto
                </TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {movimientosPagoRows.length === 0 ? (
                <EmptyRow colSpan={5} text="No hay movimientos de pago registrados." />
              ) : (
                movimientosPagoRows.map((row) => (
                  <TablaFila key={row.id}>
                    <TablaCelda>{row.fecha ? formatDateQuito(row.fecha) : '-'}</TablaCelda>
                    <TablaCelda>
                      <div>
                        <p className="font-medium text-[var(--color-text)]">{row.movimiento}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{row.referencia || '-'}</p>
                      </div>
                    </TablaCelda>
                    <TablaCelda>{row.metodo}</TablaCelda>
                    <TablaCelda>{row.caja}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                      {formatMoney(row.monto || 0)}
                    </TablaCelda>
                  </TablaFila>
                ))
              )}
            </TablaCuerpo>
          </Tabla>
        </Card>
      </div>

      {devolucionDetalleRows.length > 0 ? (
        <Card className="p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <p className="font-semibold text-[var(--color-text)]">Detalle de devoluciones</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Cantidades revertidas por línea original.
            </p>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad / unidad</TablaCelda>
                <TablaCelda as="th" className="text-right">
                  Subtotal
                </TablaCelda>
                <TablaCelda as="th" className="text-right">
                  Costo revertido
                </TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {devolucionDetalleRows.map((row) => (
                <TablaFila key={row.id}>
                  <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                  <TablaCelda>
                    <span className="whitespace-nowrap">
                      {formatQtyByUnit(
                        row.cantidad,
                        ventaDetalle?.detalle?.find((line) => line.id === row.venta_detalle_id)
                          ?.unidad_medida || 'UND'
                      )}
                    </span>
                  </TablaCelda>
                  <TablaCelda className="text-right">{formatMoney(row.subtotal || 0)}</TablaCelda>
                  <TablaCelda className="text-right">
                    {formatMoney(row.subtotal_costo || 0)}
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </Card>
      ) : null}

      <DevolucionModal
        open={devolucionOpen}
        onClose={() => setDevolucionOpen(false)}
        ventaDetalle={ventaDetalle}
        devoluciones={devoluciones}
        turnoActual={turnoActual}
        submitting={submittingDevolucion}
        error={error}
        onSubmit={handleSubmitDevolucion}
      />

      <Modal
        open={anulacionOpen}
        onClose={() => setAnulacionOpen(false)}
        maxWidthClass="max-w-2xl"
        panelClassName="p-5"
      >
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">
                Anular venta #{venta?.id || ventaId}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                La anulación revierte inventario, caja y crédito cuando el backend lo permite.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ui-modal-close-plain"
              onClick={() => setAnulacionOpen(false)}
            >
              X
            </Button>
          </div>

          {(localError || error) && <Alert tone="error">{localError || error}</Alert>}

          {needsCashShiftForAnular ? (
            <Alert tone="warning">
              La venta tiene efectivo reversible y necesita caja abierta para completar la anulación.
            </Alert>
          ) : null}

          <div className="space-y-3">
            <Input
              value={anulacionForm.motivo}
              error={Boolean(anulacionFormErrors.errors.motivo)}
              onChange={(event) => {
                anulacionFormErrors.clearFieldError('motivo');
                setAnulacionForm((current) => ({ ...current, motivo: event.target.value }));
              }}
              placeholder="Motivo de la anulación"
            />
            {anulacionFormErrors.errors.motivo ? (
              <p className="text-sm text-[var(--color-danger)]">{anulacionFormErrors.errors.motivo}</p>
            ) : null}

            <Textarea
              value={anulacionForm.novedad}
              error={Boolean(anulacionFormErrors.errors.novedad)}
              onChange={(event) => {
                anulacionFormErrors.clearFieldError('novedad');
                setAnulacionForm((current) => ({ ...current, novedad: event.target.value }));
              }}
              placeholder="Novedad operativa obligatoria"
              rows={4}
            />
            {anulacionFormErrors.errors.novedad ? (
              <p className="text-sm text-[var(--color-danger)]">{anulacionFormErrors.errors.novedad}</p>
            ) : null}
          </div>

          {!isAdmin ? (
            <div className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 md:grid-cols-2">
              <Input
                value={anulacionForm.usuario}
                error={Boolean(anulacionFormErrors.errors.usuario)}
                onChange={(event) => {
                  anulacionFormErrors.clearFieldError('usuario');
                  setAnulacionForm((current) => ({ ...current, usuario: event.target.value }));
                }}
                placeholder="Usuario ADMIN"
              />
              <Input
                type="password"
                value={anulacionForm.password}
                error={Boolean(anulacionFormErrors.errors.password)}
                onChange={(event) => {
                  anulacionFormErrors.clearFieldError('password');
                  setAnulacionForm((current) => ({ ...current, password: event.target.value }));
                }}
                placeholder="Clave ADMIN"
              />
              {anulacionFormErrors.errors.usuario ? (
                <p className="text-sm text-[var(--color-danger)] md:col-span-2">
                  {anulacionFormErrors.errors.usuario}
                </p>
              ) : null}
              {anulacionFormErrors.errors.password ? (
                <p className="text-sm text-[var(--color-danger)] md:col-span-2">
                  {anulacionFormErrors.errors.password}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAnulacionOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleSubmitAnulacion}
              disabled={submittingAnulacion}
            >
              {submittingAnulacion ? 'Anulando...' : 'Confirmar anulación'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}