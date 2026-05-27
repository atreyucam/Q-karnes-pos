import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PiArrowsClockwise, PiReceipt, PiWarningCircle } from 'react-icons/pi';
import { useShallow } from 'zustand/react/shallow';
import { useVentasStore } from '../../stores/ventasStore';
import { useCajaStore } from '../../stores/cajaStore';
import { useAuthStore } from '../../stores/authStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import {
  Alert,
  BackButton,
  Button,
  Card,
  Input,
  Modal,
  StatusBadge,
  Textarea
} from '../../ui';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, getUnidad } from '../../lib/formatQty';
import { printSaleTicketDocument } from './printTicket';
import { SALE_STATUS } from './ventaUtils';
import useFormErrors from '../../shared/hooks/useFormErrors';

const DevolucionModal = lazy(() => import('./DevolucionModal'));

function resolveMetodoLabel(value) {
  return String(value || '-').replace(/_/g, ' ');
}

function isUsefulValue(value) {
  return String(value || '').trim().length > 0;
}

function formatMetodoPagoLabel(value) {
  const text = String(value || '').replace(/_/g, ' ').trim().toLowerCase();
  if (!text) return 'Metodo de pago';
  if (text.includes('inicial')) return 'Crédito inicial';
  if (text.includes('efectivo')) return 'Efectivo';
  if (text.includes('transferencia')) return 'Transferencia';
  if (text.includes('credito') || text.includes('crédito')) return 'Crédito cliente';
  return text
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatFechaCompacta(value) {
  if (!value) return '—';
  const formatted = formatDateQuito(value);
  if (!isUsefulValue(formatted) || formatted === '-') return '—';
  return String(formatted).replace(/(\d{2}:\d{2}):\d{2}/, '$1');
}

function buildPagoDetalle(pago) {
  if (pago?.kind === 'CREDITO_INICIAL') {
    const saldoInicial = Number(pago?.saldo_inicial ?? pago?.monto ?? 0);
    return `Saldo inicial pendiente: ${formatMoney(saldoInicial)}`;
  }

  const raw = `${String(pago?.tipo || '')} ${String(pago?.metodo || '')}`.toLowerCase();
  const isTransferencia = raw.includes('transferencia');
  const isCredito = raw.includes('credito') || raw.includes('crédito') || pago?.kind === 'ABONO_CREDITO';

  if (isTransferencia) {
    const parts = [];
    if (isUsefulValue(pago?.banco)) parts.push(`Banco ${String(pago.banco)}`);
    if (isUsefulValue(pago?.referencia)) parts.push(`Ref. ${pago.referencia}`);
    return parts.join(' • ');
  }

  if (isCredito) {
    if (isUsefulValue(pago?.observacion)) return String(pago.observacion);
    if (isUsefulValue(pago?.referencia)) return String(pago.referencia);
    const saldo = Number(pago?.saldo || 0);
    if (Number.isFinite(saldo) && saldo > 0) return `Saldo pendiente: ${formatMoney(saldo)}`;
    return 'Abono a crédito';
  }

  return '';
}

export default function VentaDetallePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const ventaId = Number(id);
  const {
    detalleVenta,
    cargarDevoluciones,
    cargarTicket,
    crearDevolucion,
    anularVenta,
    ventaDetalle,
    devoluciones,
    loading,
    error
  } = useVentasStore(useShallow((s) => ({
    detalleVenta: s.detalle,
    cargarDevoluciones: s.cargarDevoluciones,
    cargarTicket: s.cargarTicket,
    crearDevolucion: s.crearDevolucion,
    anularVenta: s.anularVenta,
    ventaDetalle: s.ventaDetalle,
    devoluciones: s.devoluciones,
    loading: s.loading,
    error: s.error
  })));

  const { turnoActual, fetchTurnoActual } = useCajaStore(useShallow((s) => ({
    turnoActual: s.turnoActual,
    fetchTurnoActual: s.fetchTurnoActual
  })));

  const user = useAuthStore((s) => s.user);
  const ticketImpresionActiva = useConfiguracionStore((s) => s.configuracion?.ticket_impresion_activa ?? true);

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

  useEffect(() => {
    if (!import.meta.env.DEV || !ventaDetalle) return;
    console.log('DETALLE VENTA:', ventaDetalle);
    console.log('PAGOS DETALLE:', ventaDetalle?.pagos || ventaDetalle?.cobros || ventaDetalle?.pagosVenta);
  }, [ventaDetalle]);

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
  const resumenFinanciero = ventaDetalle?.resumen_financiero || null;
  const metodoPagoLabel = resumenPago?.label || '-';

  const devolucionesRows = useMemo(
    () => (Array.isArray(devoluciones?.devoluciones) ? devoluciones.devoluciones : []),
    [devoluciones?.devoluciones]
  );

  const devolucionDetalleRows = useMemo(
    () => (Array.isArray(devoluciones?.detalle) ? devoluciones.detalle : []),
    [devoluciones?.detalle]
  );

  const ventaAbonos = useMemo(() => {
    if (!Array.isArray(ventaDetalle?.abonos)) return [];
    return ventaDetalle.abonos.map((abono) => ({
      ...abono,
      metodo_pago: abono.metodo_pago || 'EFECTIVO',
      metodo_pago_label: abono.metodo_pago_label || formatMetodoPagoLabel(abono.metodo_pago || 'Efectivo')
    }));
  }, [ventaDetalle?.abonos]);

  const movimientosPagoRows = useMemo(() => {
    const pagosBase = pagos
      .filter((row) => {
        const tipo = String(row?.tipo || '').toUpperCase();
        const metodoCodigo = String(row?.metodo_codigo || '').toUpperCase();
        return tipo !== 'CREDITO' && metodoCodigo !== 'CREDITO_CLIENTE';
      })
      .map((row) => ({
      id: `pago-${row.id}`,
      fecha: row.fecha || row.fecha_emision || venta?.fecha || null,
      tipo: String(row.tipo || '').toUpperCase(),
      kind: 'PAGO_REAL',
      metodo: resolveMetodoLabel(row.metodo_codigo || row.tipo || '-'),
      label: formatMetodoPagoLabel(row.metodo_codigo || row.tipo || '-'),
      monto: Number(row.monto || 0),
      referencia: row.referencia || row.observacion || '',
      banco: row.banco || row.banco_nombre || row.entidad || '',
      saldo: row.saldo_pendiente ?? row.saldo ?? null
    }));

    const abonosCredito = ventaAbonos.map((abono) => ({
      id: `abono-${abono.id}`,
      fecha: abono.fecha || abono.fecha_emision || venta?.fecha || null,
      tipo: String(abono.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'CONTADO',
      kind: 'ABONO_CREDITO',
      metodo: resolveMetodoLabel(abono.metodo_pago || abono.metodo || 'EFECTIVO'),
      label: formatMetodoPagoLabel(abono.metodo_pago_label || abono.metodo_pago || 'Efectivo'),
      monto: Number(abono.monto || 0),
      referencia: abono.referencia || '',
      observacion: abono.observacion || '',
      banco: abono.banco || abono.banco_nombre || '',
      saldo: abono.saldo_pendiente ?? abono.saldo ?? null
    }));

    const creditoInicialMonto = Number(
      resumenFinanciero?.credito_inicial
      ?? ventaDetalle?.credito?.credito_inicial
      ?? 0
    );
    const creditoInicial = creditoInicialMonto > 0
      ? [{
          id: `credito-inicial-${ventaId}`,
          fecha: venta?.fecha || null,
          tipo: 'CREDITO_INICIAL',
          kind: 'CREDITO_INICIAL',
          metodo: 'Crédito inicial',
          label: 'Crédito inicial',
          monto: creditoInicialMonto,
          referencia: '',
          banco: '',
          saldo: null,
          saldo_inicial: creditoInicialMonto
        }]
      : [];

    return [...pagosBase, ...abonosCredito, ...creditoInicial].sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
      return fechaB - fechaA;
    });
  }, [pagos, resumenFinanciero?.credito_inicial, venta, ventaAbonos, ventaDetalle?.credito?.credito_inicial, ventaId]);

  const isAdmin = user?.rol?.nombre === 'ADMIN';
  const saleOwnerId = Number(venta?.usuario_id || venta?.turno_usuario_id || 0);
  const currentUserId = Number(user?.id || 0);
  const currentTurnId = Number(turnoActual?.id || 0);
  const saleTurnId = Number(venta?.turno_id || 0);
  const isSaleOwner = saleOwnerId > 0 && saleOwnerId === currentUserId;
  const isCurrentTurnSale = currentTurnId > 0 && saleTurnId > 0 && currentTurnId === saleTurnId;
  const isClosedTurnSale =
    String(venta?.turno_estado || '').toUpperCase() === 'CERRADO' || Boolean(venta?.turno_fecha_cierre);
  const cajeroCanOperateSale = isSaleOwner && isCurrentTurnSale && !isClosedTurnSale;
  const canReturn =
    Boolean(venta)
    && ![SALE_STATUS.ANULADA, SALE_STATUS.DEVUELTA_TOTAL].includes(venta.estado)
    && (isAdmin || cajeroCanOperateSale);

  const canAnular =
    Boolean(venta)
    && venta.estado === SALE_STATUS.EMITIDA
    && devolucionesRows.length === 0
    && (isAdmin || cajeroCanOperateSale);

  const needsCashShiftForAnular =
    Number(resumenPago?.contado_centavos || 0) > 0 && !turnoActual?.id;

  const salesPolicyMessage = useMemo(() => {
    if (!venta) return '';
    if (isAdmin) return '';
    if (isClosedTurnSale) return 'Esta venta pertenece a un turno cerrado.';
    if (!isSaleOwner || !isCurrentTurnSale) return 'No tienes permisos para esta acción.';
    return '';
  }, [isAdmin, isClosedTurnSale, isCurrentTurnSale, isSaleOwner, venta]);

  const subtotalCalculado = useMemo(() => {
    if (!detalleRows.length) return 0;
    return detalleRows.reduce((acc, row) => acc + Number(row.total_linea || 0), 0);
  }, [detalleRows]);

  const subtotalVenta = Number(venta?.subtotal ?? subtotalCalculado ?? 0);
  const descuentoVenta = Number(venta?.descuento || 0);
  const totalVenta = Number(venta?.total || 0);

  const pagadoTotal = useMemo(() => {
    if (resumenFinanciero && Number.isFinite(Number(resumenFinanciero.pagado_real))) {
      return Number(resumenFinanciero.pagado_real || 0);
    }
    return movimientosPagoRows
      .filter((row) => row.kind !== 'CREDITO_INICIAL')
      .reduce((acc, row) => acc + Number(row.monto || 0), 0);
  }, [movimientosPagoRows, resumenFinanciero]);

  const saldoPendienteVenta = useMemo(() => {
    if (resumenFinanciero && Number.isFinite(Number(resumenFinanciero.saldo_pendiente))) {
      return Number(resumenFinanciero.saldo_pendiente || 0);
    }
    return Math.max(0, totalVenta - pagadoTotal);
  }, [resumenFinanciero, totalVenta, pagadoTotal]);

  const cambioTotal = useMemo(() => {
    let found = false;
    const total = pagos.reduce((acc, row) => {
      const raw = row?.cambio ?? row?.cambio_monto ?? row?.monto_cambio;
      const value = Number(raw);
      if (!Number.isFinite(value)) return acc;
      found = true;
      return acc + value;
    }, 0);
    return found ? total : null;
  }, [pagos]);

  const clienteLabel = String(venta?.cliente_nombre || '').trim() || 'Consumidor final';

  useEffect(() => {
    if (!venta) return;

    const action = searchParams.get('action');

    if (action === 'devolucion') {
      if (canReturn) {
        setDevolucionOpen(true);
      } else if (salesPolicyMessage) {
        setLocalError(salesPolicyMessage);
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      setSearchParams(nextParams, { replace: true });
      return;
    }

    if (action === 'anular') {
      if (canAnular) {
        setAnulacionOpen(true);
      } else if (salesPolicyMessage) {
        setLocalError(salesPolicyMessage);
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      setSearchParams(nextParams, { replace: true });
    }
  }, [canAnular, canReturn, salesPolicyMessage, searchParams, setSearchParams, venta]);

  const handlePrint = async () => {
    if (!ticketImpresionActiva) return;
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
    if (!canReturn) {
      setLocalError(salesPolicyMessage || 'No tienes permisos para esta acción.');
      return;
    }
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
    if (!canAnular) {
      setLocalError(salesPolicyMessage || 'No tienes permisos para esta acción.');
      return;
    }
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
    <div className="mx-auto w-full max-w-[1320px] space-y-4 px-4 py-4 sm:px-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackButton className="h-9 px-3 text-sm" onClick={() => navigate('/ventas')}>
          Volver a ventas
        </BackButton>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="neutral" onClick={handlePrint} disabled={!ticketImpresionActiva || printing || !venta}>
            <PiReceipt className="text-base" />
            {printing ? 'Generando...' : 'Ver ticket'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!canReturn) {
                setLocalError(salesPolicyMessage || 'No tienes permisos para esta acción.');
                return;
              }
              setDevolucionOpen(true);
            }}
            disabled={!canReturn}
          >
            <PiArrowsClockwise className="text-base" />
            Devolver
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => {
              if (!canAnular) {
                setLocalError(salesPolicyMessage || 'No tienes permisos para esta acción.');
                return;
              }
              setAnulacionOpen(true);
            }}
            disabled={!canAnular}
          >
            <PiWarningCircle className="text-base" />
            Anular
          </Button>
        </div>
      </div>

      {(localError || error) && <Alert tone="error">{localError || error}</Alert>}
      {loading && !venta && <Alert tone="info">Cargando detalle de la venta...</Alert>}

      {venta ? (
        <section className="space-y-4">
          <Card className="rounded-xl p-4 shadow-sm">
            <div className="space-y-2.5">
              <p className="text-sm font-semibold text-[var(--color-text)]">
                {venta ? `Venta #${venta.id}` : `Venta #${ventaId}`}
              </p>
              <p className="text-sm font-semibold text-[var(--color-text)]">
                Cliente: <span className="font-normal">{clienteLabel}</span>
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {venta.fecha ? formatDateQuito(venta.fecha) : '-'} • {venta.usuario_nombre || '-'}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-[var(--color-text)]">{metodoPagoLabel}</span>
                <span className="text-[var(--color-text-subtle)]">•</span>
                <StatusBadge status={venta.estado || 'PENDIENTE'} />
              </div>
              <div className="pt-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                  Total
                </p>
                <p className="text-3xl font-black leading-none text-[var(--color-text)]">
                  {formatMoney(totalVenta)}
                </p>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            {!isAdmin ? (
              <Alert tone="info">
                Las ventas cobradas no se editan directamente. Usa anulación o devolución.
              </Alert>
            ) : null}

            <Alert tone="info">
              La anulación y la devolución usan el snapshot de costo y margen registrado en la venta.
            </Alert>

            {salesPolicyMessage ? (
              <Alert tone="warning">{salesPolicyMessage}</Alert>
            ) : null}

            {needsCashShiftForAnular ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm text-amber-800">
                  Esta venta incluye efectivo y la anulación requiere un turno de caja abierto.
                </p>
              </div>
            ) : null}

            {!canReturn ? (
              <Alert tone="info">
                {salesPolicyMessage
                  ? salesPolicyMessage
                  : venta.estado === SALE_STATUS.ANULADA
                  ? 'La venta ya fue anulada y no admite devoluciones.'
                  : 'La venta ya fue devuelta totalmente.'}
              </Alert>
            ) : null}

            {!canAnular ? (
              <Alert tone="info">
                {salesPolicyMessage
                  ? salesPolicyMessage
                  : venta.estado !== SALE_STATUS.EMITIDA
                  ? `La anulación no está disponible para el estado ${venta.estado}.`
                  : 'La anulación ya no está disponible porque la venta tiene devoluciones registradas.'}
              </Alert>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="rounded-xl p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[var(--color-text)]">Productos vendidos</h2>
              {!detalleRows.length ? (
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  No hay líneas registradas en esta venta.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {detalleRows.map((line) => (
                    <article key={line.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                            {line.producto_nombre}
                          </p>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            {formatQtyByUnit(line.cantidad, line.unidad_medida || line.unidad)}{' '}
                            {getUnidad(line.unidad_medida || line.unidad)} × {formatMoney(line.precio_unit || 0)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-[var(--color-text)]">
                          {formatMoney(line.total_linea || 0)}
                        </p>
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
                  <span className="font-semibold text-[var(--color-text)]">{formatMoney(subtotalVenta)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Descuento</span>
                  <span className="font-semibold text-[var(--color-text)]">{formatMoney(descuentoVenta)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Total</span>
                  <span className="text-xl font-black text-[var(--color-text)]">{formatMoney(totalVenta)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Pagado</span>
                  <span className="font-semibold text-[var(--color-text)]">{formatMoney(pagadoTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Saldo pendiente</span>
                  <span className="font-semibold text-[var(--color-text)]">{formatMoney(saldoPendienteVenta)}</span>
                </div>
                {cambioTotal !== null ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Cambio</span>
                    <span className="font-semibold text-[var(--color-text)]">{formatMoney(cambioTotal)}</span>
                  </div>
                ) : null}
              </div>
              </Card>

              <Card className="rounded-xl p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[var(--color-text)]">Pagos</h2>
              {!movimientosPagoRows.length ? (
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  No hay movimientos de pago registrados.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {movimientosPagoRows.map((row) => (
                    <article key={row.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-[var(--color-text)]">
                          {row.label || formatMetodoPagoLabel(row.metodo || row.tipo)}
                        </p>
                        <p className="shrink-0 text-right text-sm font-bold text-[var(--color-text)]">
                          {formatMoney(row.monto || 0)}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{formatFechaCompacta(row.fecha)}</p>
                      {isUsefulValue(buildPagoDetalle(row)) ? (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{buildPagoDetalle(row)}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
              </Card>
            </aside>
          </div>

          <Card className="rounded-xl p-4 shadow-sm">
            <h2 className="text-base font-semibold text-[var(--color-text)]">Devoluciones</h2>
            {devolucionesRows.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2">
                <p className="text-sm text-[var(--color-text-muted)]">Sin devoluciones registradas.</p>
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {devolucionesRows.map((row, index) => (
                  <article key={row.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-[var(--color-text)]">Devolución #{index + 1}</p>
                      <p className="font-bold text-[var(--color-text)]">{formatMoney(row.total_devuelto || 0)}</p>
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                      {row.fecha ? formatDateQuito(row.fecha) : '—'}
                      {row.motivo ? ` • Motivo: ${row.motivo}` : ''}
                    </p>
                    {row.metodo_pago_label ? (
                      <p className="text-xs text-[var(--color-text-muted)]">Método: {row.metodo_pago_label}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}

            {devolucionDetalleRows.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                  Ítems devueltos
                </p>
                <div className="space-y-1">
                  {devolucionDetalleRows.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-sm text-[var(--color-text)]">{row.producto_nombre}</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {formatQtyByUnit(
                          row.cantidad,
                          ventaDetalle?.detalle?.find((line) => line.id === row.venta_detalle_id)?.unidad_medida || 'UND'
                        )}{' '}
                        • {formatMoney(row.subtotal || 0)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      <Suspense fallback={null}>
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
      </Suspense>

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
