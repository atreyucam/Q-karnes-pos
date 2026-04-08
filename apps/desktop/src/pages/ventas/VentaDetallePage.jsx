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

function resolvePaymentTypeLabel(row) {
  const tipo = String(row?.tipo || '').trim().toUpperCase();
  if (tipo === 'TRANSFERENCIA') return 'Transferencia';
  if (tipo === 'CREDITO') return 'Credito';
  return 'Efectivo';
}

function resolveCashImpact(row) {
  return row?.afecta_caja ? 'Si' : 'No';
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

  const canReturn = Boolean(venta) && ![SALE_STATUS.ANULADA, SALE_STATUS.DEVUELTA_TOTAL].includes(venta.estado);
  const canAnular = Boolean(venta)
    && venta.estado === SALE_STATUS.EMITIDA
    && devolucionesRows.length === 0;
  const needsCashShiftForAnular = Number(resumenPago?.contado_centavos || 0) > 0 && !turnoActual?.id;
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

    if (!anulacionForm.motivo.trim()) {
      setLocalError('El motivo es obligatorio para anular la venta.');
      return;
    }

    if (!anulacionForm.novedad.trim()) {
      setLocalError('La novedad es obligatoria para registrar la anulacion.');
      return;
    }

    if (!isAdmin && (!anulacionForm.usuario.trim() || !anulacionForm.password)) {
      setLocalError('Como cajero debes ingresar credenciales ADMIN para anular.');
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
        autorizacion: !isAdmin && anulacionForm.usuario.trim() && anulacionForm.password
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
    <div className="space-y-4">
      <BackButton onClick={() => navigate('/ventas')}>Volver a ventas</BackButton>

      <PageHeader
        title={venta ? `Venta #${venta.id}` : `Venta #${ventaId}`}
        description="Detalle operativo completo de la venta, sus pagos, devoluciones y acciones reversibles."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handlePrint} disabled={printing || !venta}>
              {printing ? 'Generando ticket...' : 'Ver ticket'}
            </Button>
            <Button type="button" variant="primary" onClick={() => setDevolucionOpen(true)} disabled={!canReturn}>
              Devolver
            </Button>
            <Button type="button" variant="danger" onClick={() => setAnulacionOpen(true)} disabled={!canAnular}>
              Anular
            </Button>
          </div>
        )}
      />

      {(localError || error) && (
        <Alert tone="error">
          {localError || error}
        </Alert>
      )}

      {loading && !venta && (
        <Alert tone="info">
          Cargando detalle de la venta...
        </Alert>
      )}

      {venta && needsCashShiftForAnular ? (
        <Alert tone="warning">
          Esta venta incluye efectivo y la anulacion requiere un turno de caja abierto para revertir el saldo.
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
            ? `La anulacion no esta disponible para el estado ${venta.estado}.`
            : 'La anulacion ya no esta disponible porque la venta tiene devoluciones registradas.'}
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Estado</p>
          <div className="mt-2"><StatusBadge status={venta?.estado || 'PENDIENTE'} /></div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Cliente</p>
          <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{venta?.cliente_nombre || 'Comprobante final'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Fecha</p>
          <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{venta?.fecha ? formatDateQuito(venta.fecha) : '-'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Metodo principal</p>
          <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{ventaDetalle?.resumen_pago?.label || '-'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Referencia</p>
          <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{venta?.referencia || '-'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Vendedor</p>
          <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{venta?.usuario_nombre || '-'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Total</p>
          <p className="mt-2 text-xl font-bold text-[var(--color-text)]">{formatMoney(venta?.total || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Costo / margen</p>
          <p className="mt-2 text-base font-semibold text-[var(--color-text)]">
            {formatMoney(venta?.total_costo || 0)} / {formatMoney(venta?.total_margen || 0)}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-[var(--color-text)]">Productos vendidos</p>
              <p className="text-sm text-[var(--color-text-muted)]">Incluye snapshot de costo y margen por linea.</p>
            </div>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th" className="text-right">P. unit</TablaCelda>
                <TablaCelda as="th" className="text-right">Total</TablaCelda>
                <TablaCelda as="th" className="text-right">Costo snap</TablaCelda>
                <TablaCelda as="th" className="text-right">Subtotal costo</TablaCelda>
                <TablaCelda as="th" className="text-right">Margen</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(ventaDetalle?.detalle || []).map((line) => (
                <TablaFila key={line.id}>
                  <TablaCelda>
                    <div>
                      <p className="font-medium text-[var(--color-text)]">{line.producto_codigo} - {line.producto_nombre}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{getUnidad(line.unidad_medida || line.unidad)}</p>
                    </div>
                  </TablaCelda>
                  <TablaCelda>{formatQtyByUnit(line.cantidad, line.unidad_medida || line.unidad)}</TablaCelda>
                  <TablaCelda className="text-right">{formatMoney(line.precio_unit || 0)}</TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(line.total_linea || 0)}</TablaCelda>
                  <TablaCelda className="text-right">{formatMoney(line.costo_unit_snapshot || 0)}</TablaCelda>
                  <TablaCelda className="text-right">{formatMoney(line.subtotal_costo || 0)}</TablaCelda>
                  <TablaCelda className="text-right">{formatMoney(line.margen || 0)}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3">
              <p className="font-semibold text-[var(--color-text)]">Pagos registrados</p>
              <p className="text-sm text-[var(--color-text-muted)]">Caja solo se afecta cuando el pago es efectivo.</p>
            </div>

            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Tipo</TablaCelda>
                  <TablaCelda as="th">Metodo</TablaCelda>
                  <TablaCelda as="th">Caja</TablaCelda>
                  <TablaCelda as="th" className="text-right">Monto</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {pagos.length === 0 ? (
                  <TablaFila>
                    <TablaCelda colSpan={4} className="text-center text-[var(--color-text-muted)]">
                      No hay pagos registrados.
                    </TablaCelda>
                  </TablaFila>
                ) : pagos.map((row) => (
                  <TablaFila key={row.id}>
                    <TablaCelda>{resolvePaymentTypeLabel(row)}</TablaCelda>
                    <TablaCelda>{String(row.metodo_codigo || '-').replace(/_/g, ' ')}</TablaCelda>
                    <TablaCelda>{resolveCashImpact(row)}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(row.monto || 0)}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </Card>

          <Card className="p-4">
            <div className="mb-3">
              <p className="font-semibold text-[var(--color-text)]">Devoluciones</p>
              <p className="text-sm text-[var(--color-text-muted)]">Historial completo de reversiones asociadas a esta venta.</p>
            </div>

            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">ID</TablaCelda>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Motivo</TablaCelda>
                  <TablaCelda as="th">Metodo</TablaCelda>
                  <TablaCelda as="th" className="text-right">Total</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {devolucionesRows.length === 0 ? (
                  <TablaFila>
                    <TablaCelda colSpan={5} className="text-center text-[var(--color-text-muted)]">
                      Sin devoluciones registradas.
                    </TablaCelda>
                  </TablaFila>
                ) : devolucionesRows.map((row) => (
                  <TablaFila key={row.id}>
                    <TablaCelda>#{row.id}</TablaCelda>
                    <TablaCelda>{row.fecha ? formatDateQuito(row.fecha) : '-'}</TablaCelda>
                    <TablaCelda>{row.motivo}</TablaCelda>
                    <TablaCelda>{row.metodo_pago_label || '-'}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(row.total_devuelto || 0)}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </Card>
        </div>
      </div>

      {devolucionDetalleRows.length > 0 ? (
        <Card className="p-4">
          <div className="mb-3">
            <p className="font-semibold text-[var(--color-text)]">Detalle de devoluciones</p>
            <p className="text-sm text-[var(--color-text-muted)]">Cantidades revertidas por linea original.</p>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th" className="text-right">Subtotal</TablaCelda>
                <TablaCelda as="th" className="text-right">Costo revertido</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {devolucionDetalleRows.map((row) => (
                <TablaFila key={row.id}>
                  <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                  <TablaCelda>{formatQtyByUnit(row.cantidad, ventaDetalle?.detalle?.find((line) => line.id === row.venta_detalle_id)?.unidad_medida || 'UND')}</TablaCelda>
                  <TablaCelda className="text-right">{formatMoney(row.subtotal || 0)}</TablaCelda>
                  <TablaCelda className="text-right">{formatMoney(row.subtotal_costo || 0)}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </Card>
      ) : null}

      {ventaAbonos.length > 0 ? (
        <Card className="p-4">
          <div className="mb-3">
            <p className="font-semibold text-[var(--color-text)]">Pagos del credito</p>
            <p className="text-sm text-[var(--color-text-muted)]">Abonos aplicados a la cuenta por cobrar de esta venta.</p>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Observacion</TablaCelda>
                <TablaCelda as="th" className="text-right">Monto</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {ventaAbonos.map((abono) => (
                <TablaFila key={abono.id}>
                  <TablaCelda>{formatDateQuito(abono.fecha || abono.fecha_emision || venta?.fecha)}</TablaCelda>
                  <TablaCelda>{abono.observacion || abono.referencia || '-'}</TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(abono.monto || 0)}</TablaCelda>
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

      <Modal open={anulacionOpen} onClose={() => setAnulacionOpen(false)} maxWidthClass="max-w-2xl" panelClassName="p-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Anular venta #{venta?.id || ventaId}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                La anulacion revierte inventario, caja y credito cuando el backend lo permite.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAnulacionOpen(false)}>
              X
            </Button>
          </div>

          {(localError || error) && (
            <Alert tone="error">
              {localError || error}
            </Alert>
          )}

          {needsCashShiftForAnular ? (
            <Alert tone="warning">
              La venta tiene efectivo reversible y necesita caja abierta para completar la anulacion.
            </Alert>
          ) : null}

          <div className="space-y-3">
            <Input
              value={anulacionForm.motivo}
              onChange={(event) => setAnulacionForm((current) => ({ ...current, motivo: event.target.value }))}
              placeholder="Motivo de la anulacion"
            />
            <Textarea
              value={anulacionForm.novedad}
              onChange={(event) => setAnulacionForm((current) => ({ ...current, novedad: event.target.value }))}
              placeholder="Novedad operativa obligatoria"
              rows={4}
            />
          </div>

          {!isAdmin ? (
            <div className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 md:grid-cols-2">
              <Input
                value={anulacionForm.usuario}
                onChange={(event) => setAnulacionForm((current) => ({ ...current, usuario: event.target.value }))}
                placeholder="Usuario ADMIN"
              />
              <Input
                type="password"
                value={anulacionForm.password}
                onChange={(event) => setAnulacionForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Clave ADMIN"
              />
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAnulacionOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={handleSubmitAnulacion} disabled={submittingAnulacion}>
              {submittingAnulacion ? 'Anulando...' : 'Confirmar anulacion'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
