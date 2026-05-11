import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PiCurrencyDollar } from 'react-icons/pi';
import {
  Alert,
  BackButton,
  Button,
  Card,
  LoadingState,
  StatusBadge,
  Toast
} from '../../ui';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { useCajaStore } from '../../stores/cajaStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, getUnidad } from '../../lib/formatQty';
import ProveedorPagoModal from './ProveedorPagoModal';

function formatCondicion(metodo) {
  return String(metodo || '').toUpperCase() === 'CREDITO' ? 'Crédito' : 'Contado';
}

function formatMetodoPagoLabel(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'TRANSFERENCIA') return 'Transferencia';
  if (text === 'EFECTIVO') return 'Efectivo';
  return 'Pago';
}

function buildPagoDetalle(pago) {
  const parts = [];
  if (pago?.banco) parts.push(`Banco ${pago.banco}`);
  if (pago?.referencia) parts.push(`Ref. ${pago.referencia}`);
  if (!parts.length && pago?.observacion) parts.push(String(pago.observacion));
  return parts.join(' • ');
}

export default function ProveedorFacturaDetallePage() {
  const navigate = useNavigate();
  const { id, facturaId } = useParams();
  const proveedorId = Number(id);
  const facturaNumero = Number(facturaId);

  const {
    proveedorDetalle,
    loading,
    error,
    getById,
    cargarFacturaDetalle,
    cargarResumenCxp,
    pagarCredito
  } = useProveedoresStore();
  const configuracion = useConfiguracionStore((state) => state.configuracion);
  const turnoActual = useCajaStore((state) => state.turnoActual);
  const fetchTurnoActual = useCajaStore((state) => state.fetchTurnoActual);

  const [facturaDetalle, setFacturaDetalle] = useState(null);
  const [modalPagoOpen, setModalPagoOpen] = useState(false);
  const [statusToast, setStatusToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const loadData = async () => {
    const responses = await Promise.all([
      getById(proveedorId),
      cargarFacturaDetalle(proveedorId, facturaNumero),
      cargarResumenCxp(proveedorId),
      fetchTurnoActual({ silent: true }).catch(() => {})
    ]);
    const detalle = responses[1];
    setFacturaDetalle(detalle);
  };

  useEffect(() => {
    if (!Number.isFinite(proveedorId) || proveedorId <= 0) return;
    if (!Number.isFinite(facturaNumero) || facturaNumero <= 0) return;
    loadData();
  }, [proveedorId, facturaNumero]);

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

  const factura = facturaDetalle?.factura || null;
  const items = useMemo(() => (Array.isArray(facturaDetalle?.items) ? facturaDetalle.items : []), [facturaDetalle?.items]);
  const pagos = useMemo(() => (Array.isArray(facturaDetalle?.pagos) ? facturaDetalle.pagos : []), [facturaDetalle?.pagos]);
  const resumen = facturaDetalle?.resumen_financiero || null;

  const totalFactura = Number(resumen?.total ?? factura?.total ?? 0);
  const subtotalFactura = Number(resumen?.subtotal ?? totalFactura);
  const descuentoFactura = Number(resumen?.descuento ?? 0);
  const pagadoFactura = Number(resumen?.pagado ?? factura?.pagado ?? 0);
  const pendienteFactura = Number(resumen?.pendiente ?? factura?.pendiente ?? 0);
  const condicionLabel = factura?.condicion || formatCondicion(factura?.metodo_pago);

  const facturaForPayment = useMemo(() => {
    if (!factura) return null;
    return {
      id: factura.id,
      numero_factura: factura.numero_factura,
      numero_documento: factura.numero_documento,
      pendiente: pendienteFactura
    };
  }, [factura, pendienteFactura]);

  const onRegistrarPago = async (payload) => {
    await pagarCredito(proveedorId, payload);
    setModalPagoOpen(false);
    await loadData();
    setStatusToast('Pago registrado correctamente');
  };

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4 px-4 py-4 sm:px-5 lg:px-6">
      {statusToast ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast tone="success" className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToast}</Toast>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackButton className="h-9 px-3 text-sm" onClick={() => navigate(`/proveedores/${proveedorId}`)}>
          Volver al proveedor
        </BackButton>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setModalPagoOpen(true)}
            disabled={!factura || pendienteFactura <= 0}
          >
            <PiCurrencyDollar className="text-base" />
            Registrar pago
          </Button>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading && !factura ? <Alert tone="info">Cargando detalle de factura...</Alert> : null}

      {factura ? (
        <section className="space-y-4">
          <Card className="rounded-xl p-4 shadow-sm">
            <div className="space-y-2.5">
              <p className="text-sm font-semibold text-[var(--color-text)]">
                Factura {factura.numero_factura || `#${factura.id}`}
              </p>
              <p className="text-sm font-semibold text-[var(--color-text)]">
                Proveedor: <span className="font-normal">{proveedorDetalle?.nombre || '-'}</span>
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {factura.fecha ? formatDateQuito(factura.fecha) : '-'}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-[var(--color-text)]">Condición: {condicionLabel}</span>
                <span className="text-[var(--color-text-subtle)]">•</span>
                <StatusBadge status={pendienteFactura > 0 ? 'PENDIENTE' : 'PAGADA'} />
              </div>
              <div className="space-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text)]">
                <p>
                  Orden asociada: {factura.orden_id ? `#${factura.orden_id}` : '—'}
                  <span className="mx-1 text-[var(--color-text-subtle)]">•</span>
                  Recepción asociada: {factura.recepcion_id ? `#${factura.recepcion_id}` : '—'}
                </p>
                <p>Vencimiento: {factura.fecha_vencimiento ? formatDateQuito(factura.fecha_vencimiento) : '—'}</p>
                <p>Observación: {factura.observacion || '—'}</p>
              </div>
              <div className="pt-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Total</p>
                <p className="text-3xl font-black leading-none text-[var(--color-text)]">{formatMoney(totalFactura)}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="rounded-xl p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[var(--color-text)]">Productos comprados</h2>
              {!items.length ? (
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">No hay ítems registrados para esta factura.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {items.map((item) => (
                    <article key={item.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--color-text)]">{item.producto_nombre}</p>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            {formatQtyByUnit(item.cantidad, item.unidad_medida || item.unidad, { fixedLB: true })}{' '}
                            {getUnidad(item.unidad_medida || item.unidad)} × {formatMoney(item.costo_unit_real || 0)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-[var(--color-text)]">{formatMoney(item.subtotal || 0)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Card>

            <aside className="space-y-4">
              <Card className="rounded-xl p-4 shadow-sm">
                <h2 className="text-base font-semibold text-[var(--color-text)]">Resumen financiero</h2>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Subtotal</span>
                    <span className="font-semibold text-[var(--color-text)]">{formatMoney(subtotalFactura)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Descuento</span>
                    <span className="font-semibold text-[var(--color-text)]">{formatMoney(descuentoFactura)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Total</span>
                    <span className="text-xl font-black text-[var(--color-text)]">{formatMoney(totalFactura)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Pagado</span>
                    <span className="font-semibold text-[var(--color-text)]">{formatMoney(pagadoFactura)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Pendiente</span>
                    <span className="font-semibold text-[var(--color-text)]">{formatMoney(pendienteFactura)}</span>
                  </div>
                </div>
              </Card>

              <Card className="rounded-xl p-4 shadow-sm">
                <h2 className="text-base font-semibold text-[var(--color-text)]">Pagos realizados</h2>
                {!pagos.length ? (
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">Sin pagos registrados.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {pagos.map((pago) => (
                      <article key={pago.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold text-[var(--color-text)]">
                            {pago.metodo_pago_label || formatMetodoPagoLabel(pago.metodo_pago)}
                          </p>
                          <p className="shrink-0 text-right text-sm font-bold text-[var(--color-text)]">
                            {formatMoney(pago.monto || 0)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{pago.fecha ? formatDateQuito(pago.fecha) : '—'}</p>
                        {buildPagoDetalle(pago) ? (
                          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{buildPagoDetalle(pago)}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </Card>
            </aside>
          </div>
        </section>
      ) : null}

      <ProveedorPagoModal
        open={modalPagoOpen}
        onClose={() => setModalPagoOpen(false)}
        onSubmit={onRegistrarPago}
        proveedor={proveedorDetalle}
        factura={facturaForPayment}
        configuracion={configuracion}
        turnoActual={turnoActual}
        loading={loading}
      />

      {loading ? <LoadingState label="Cargando factura proveedor..." /> : null}
    </div>
  );
}
