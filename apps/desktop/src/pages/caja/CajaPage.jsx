import { useEffect, useMemo, useState } from 'react';
import {
  PiArrowsLeftRightBold,
  PiCashRegister,
  PiCreditCardBold,
  PiCurrencyDollarSimpleBold,
  PiEye,
  PiReceipt,
  PiWallet
} from 'react-icons/pi';
import {
  Alert,
  Button,
  Card,
  IconButton,
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
import { useNavigate } from 'react-router-dom';
import { useCajaStore } from '../../stores/cajaStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatMovementType(tipo) {
  const map = {
    VENTA_CONTADO: 'Venta contado',
    VENTA_TRANSFERENCIA: 'Venta transferencia',
    VENTA_CREDITO: 'Venta crédito',
    INGRESO_MANUAL: 'Ingreso manual',
    EGRESO_MANUAL: 'Egreso manual',
    ABONO_CLIENTE: 'Abono cliente',
    PAGO_PROVEEDOR: 'Pago proveedor',
    COMPRA_CONTADO: 'Compra contado',
    DEVOLUCION_EFECTIVO: 'Devolución efectivo',
    ANULACION_VENTA_EFECTIVO: 'Anulación efectivo',
    REVERSO_ABONO_CLIENTE: 'Reverso abono',
    REVERSO_PAGO_PROVEEDOR: 'Reverso pago'
  };
  return map[tipo] || tipo || '-';
}

function formatPaymentMethod(metodo) {
  const map = {
    EFECTIVO: 'Efectivo',
    TRANSFERENCIA: 'Transferencia',
    CREDITO_CLIENTE: 'Crédito'
  };
  return map[metodo] || metodo || '-';
}

function resolveMovementSense(movimiento) {
  const tipo = String(movimiento?.tipo || '').toUpperCase();
  if (tipo === 'VENTA_TRANSFERENCIA' || tipo === 'VENTA_CREDITO') {
    return {
      tone: 'default',
      label: 'Informativo'
    };
  }

  if (String(movimiento?.sentido || '').toUpperCase() === 'EGRESO') {
    return {
      tone: 'danger',
      label: 'Egreso'
    };
  }

  return {
    tone: 'success',
    label: 'Ingreso'
  };
}

function resolveBalanceImpact(movimiento) {
  return movimiento?.afecta_saldo
    ? { tone: 'success', label: 'Afecta saldo' }
    : { tone: 'default', label: 'No afecta saldo' };
}

function extractVentaIdFromText(...candidates) {
  for (const candidate of candidates) {
    const text = String(candidate || '');
    const ventaTag = text.match(/VENTA:(\d{1,10})/i);
    if (ventaTag) return Number(ventaTag[1]);

    const ventaRef = text.match(/venta\s*#?\s*(\d{1,10})/i);
    if (ventaRef) return Number(ventaRef[1]);
  }

  return null;
}

export default function CajaPage() {
  const navigate = useNavigate();
  const {
    turnoActual,
    resumen,
    movimientos,
    loading,
    error,
    fetchTurnoActual,
    abrirTurno,
    corteX,
    movimientoManual,
    corteZ,
    cargarMovimientosTurno
  } = useCajaStore();

  const [fondo, setFondo] = useState('100.00');
  const [manualModal, setManualModal] = useState(null);
  const [manualForm, setManualForm] = useState({ concepto: '', monto: '' });
  const [corteData, setCorteData] = useState({ efectivo_contado: '', observacion: '' });
  const [corteAuth, setCorteAuth] = useState({ usuario: '', password: '' });
  const [movimientoDetalle, setMovimientoDetalle] = useState(null);
  const [movementFilter, setMovementFilter] = useState('TODOS');
  const [movimientosPage, setMovimientosPage] = useState(1);
  const pageSize = 10;

  const resolveVentaId = (movimiento) => {
    const tipo = String(movimiento?.tipo || '').toUpperCase();
    const modulo = String(movimiento?.modulo_origen || '').toUpperCase();
    const directId = Number(movimiento?.origen_id || 0);
    const isVentaMovement = modulo.includes('VENTAS')
      || ['VENTA_CONTADO', 'VENTA_TRANSFERENCIA', 'VENTA_CREDITO', 'DEVOLUCION_EFECTIVO', 'ANULACION_VENTA_EFECTIVO'].includes(tipo);

    if (!isVentaMovement) return null;
    if (directId > 0 && tipo !== 'DEVOLUCION_EFECTIVO') return directId;

    return extractVentaIdFromText(
      movimiento?.documento_origen,
      movimiento?.concepto,
      movimiento?.referencia,
      movimiento?.observacion
    );
  };

  const resolveCompraOrdenId = (movimiento) => {
    const tipo = String(movimiento?.tipo || '').toUpperCase();
    const modulo = String(movimiento?.modulo_origen || '').toUpperCase();
    const isCompraMovement = ['COMPRA_CONTADO', 'PAGO_PROVEEDOR', 'REVERSO_PAGO_PROVEEDOR'].includes(tipo)
      || modulo.includes('COMPRA')
      || modulo.includes('PROVEEDOR');

    if (!isCompraMovement) return null;

    const directId = Number(
      movimiento?.orden_compra_id
      || movimiento?.compra_id
      || movimiento?.documento_id
      || movimiento?.origen_id
      || 0
    );
    if (Number.isFinite(directId) && directId > 0) return directId;

    const textCandidates = [
      movimiento?.documento_origen,
      movimiento?.referencia,
      movimiento?.concepto,
      movimiento?.observacion
    ];

    for (const candidate of textCandidates) {
      const match = String(candidate || '').match(/#?\s*(\d{1,10})/);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }

    return null;
  };

  const onViewMovimiento = (movimiento) => {
    const ventaId = resolveVentaId(movimiento);
    if (ventaId) {
      navigate(`/ventas/${ventaId}`);
      return;
    }

    const compraOrdenId = resolveCompraOrdenId(movimiento);
    if (compraOrdenId) {
      navigate(`/compras/ordenes/${compraOrdenId}?readonly=1`);
      return;
    }
    setMovimientoDetalle(movimiento);
  };

  const refreshTurnoData = async (filterValue = movementFilter) => {
    try {
      const turno = await fetchTurnoActual();
      if (!turno?.id) return;
      await Promise.all([
        corteX(),
        cargarMovimientosTurno(turno.id, { limit: 500, offset: 0, filter: filterValue })
      ]);
    } catch (_) {
      // handled by store
    }
  };

  useEffect(() => {
    refreshTurnoData(movementFilter);
  }, [movementFilter]);

  useEffect(() => {
    setMovimientosPage(1);
  }, [movementFilter, movimientos.length]);

  useEffect(() => {
    if (!turnoActual?.id) return undefined;

    const interval = setInterval(() => {
      refreshTurnoData(movementFilter);
    }, 4000);

    return () => clearInterval(interval);
  }, [turnoActual?.id]);

  const resumenCaja = resumen?.resumen_caja || {
    saldo_inicial: Number(turnoActual?.fondo_inicial || 0),
    ingresos_efectivo: 0,
    egresos_efectivo: 0,
    saldo_actual: 0
  };
  const resumenVentas = resumen?.resumen_ventas || {
    efectivo: 0,
    transferencia: 0,
    credito: 0,
    total_ventas: 0
  };
  const ingresos = useMemo(() => round2(Number(resumenCaja.ingresos_efectivo || 0)), [resumenCaja]);
  const egresos = useMemo(() => round2(Number(resumenCaja.egresos_efectivo || 0)), [resumenCaja]);
  const efectivoEsperado = Number(resumen?.efectivo_esperado || resumenCaja.saldo_actual || 0);
  const efectivoContado = Number(corteData.efectivo_contado || 0);
  const diferenciaCierre = round2(efectivoContado - efectivoEsperado);
  const requiereAutorizacionAdmin = corteData.efectivo_contado !== '' && Math.abs(diferenciaCierre) > 0.009;
  const cajaAbiertaPor = turnoActual?.usuario_nombre || (turnoActual?.usuario_id ? `Usuario #${turnoActual.usuario_id}` : 'Usuario no identificado');
  const cajaAbiertaEn = turnoActual?.fecha_apertura ? formatDateQuito(turnoActual.fecha_apertura) : null;
  const turnoResumen = turnoActual?.id ? `Turno #${turnoActual.id}` : 'Sin turno';
  const totalMovimientosPages = Math.max(1, Math.ceil(movimientos.length / pageSize));
  const movimientosPaginados = useMemo(() => {
    const start = (movimientosPage - 1) * pageSize;
    return movimientos.slice(start, start + pageSize);
  }, [movimientos, movimientosPage]);

  useEffect(() => {
    if (!requiereAutorizacionAdmin && (corteAuth.usuario || corteAuth.password)) {
      setCorteAuth({ usuario: '', password: '' });
    }
  }, [requiereAutorizacionAdmin, corteAuth.usuario, corteAuth.password]);

  const onAbrir = async () => {
    await abrirTurno({ fondo_inicial: Number(fondo || 0), observacion: 'Apertura manual desktop' });
    await refreshTurnoData();
  };

  const openManualModal = (tipo) => {
    setManualModal(tipo);
    setManualForm({ concepto: '', monto: '' });
  };

  const onManual = async () => {
    if (!manualModal) return;
    await movimientoManual({
      tipo: manualModal,
      concepto: manualForm.concepto,
      monto: Number(manualForm.monto || 0)
    });
    setManualModal(null);
    setManualForm({ concepto: '', monto: '' });
    await refreshTurnoData();
  };

  const onCorteX = async () => {
    await corteX();
    if (turnoActual?.id) {
      await cargarMovimientosTurno(turnoActual.id, { limit: 500, offset: 0, filter: movementFilter });
    }
  };

  const onCorteZ = async () => {
    await corteZ({
      efectivo_contado: efectivoContado,
      observacion: corteData.observacion || undefined,
      autorizacion: requiereAutorizacionAdmin && corteAuth.usuario.trim() && corteAuth.password
        ? { usuario: corteAuth.usuario.trim(), password: corteAuth.password }
        : undefined
    });
    setCorteData({ efectivo_contado: '', observacion: '' });
    setCorteAuth({ usuario: '', password: '' });
    await refreshTurnoData();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Caja"
        description="Turno actual, efectivo esperado y movimientos separados por impacto real en caja."
        actions={
          turnoActual ? (
            <>
              <Button onClick={() => openManualModal('INGRESO')}>
                Ingreso manual
              </Button>
              <Button variant="danger" onClick={() => openManualModal('EGRESO')}>
                Egreso manual
              </Button>
            </>
          ) : null
        }
      />
      {turnoActual ? (
        <div className="-mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <StatusBadge tone="success">ABIERTO</StatusBadge>
          <span>
            {turnoResumen} abierto por <span className="font-semibold text-[var(--color-text)]">{cajaAbiertaPor}</span>
            {cajaAbiertaEn ? ` a las ${cajaAbiertaEn}` : ''}.
          </span>
        </div>
      ) : null}

      {error && <Alert tone="error">{error}</Alert>}

      {!turnoActual ? (
        <div className="min-h-[19rem] rounded-[1.35rem] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-6 py-10">
          <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-brand)] shadow-sm">
              <PiCurrencyDollarSimpleBold className="h-7 w-7" />
            </div>

            <h3 className="text-xl font-bold text-[var(--color-text)]">Caja no iniciada</h3>
            <p className="mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
              Todavia no hay un turno abierto. Define el fondo inicial para comenzar la operacion de caja.
            </p>

            <div className="mt-6 flex w-full max-w-xs flex-col items-center gap-3">
              <label className="w-full text-left text-sm font-medium text-[var(--color-text)]">
                Fondo inicial
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 text-base font-semibold text-[var(--color-text-muted)]">$</span>
                  <Input
                    className="!bg-surface !border-border-strong"
                    value={fondo}
                    onChange={(e) => setFondo(e.target.value)}
                  />
                </div>
              </label>
              <Button className="w-full" onClick={onAbrir} disabled={loading}>
                Abrir turno
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Turno</p>
              <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{turnoResumen}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{cajaAbiertaPor}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Fondo inicial</p>
              <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{formatMoney(turnoActual.fondo_inicial)}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Base de efectivo al abrir caja</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Efectivo esperado</p>
              <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{formatMoney(efectivoEsperado)}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Solo incluye movimientos que afectan saldo</p>
            </Card>
          </div>

          <section className="ui-kpi-summary-shell">
            <div className="ui-kpi-summary-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div
                className="ui-kpi-summary-item px-4 py-4"
                style={{ '--dashboard-card-icon-bg': 'var(--color-primary-soft)' }}
              >
                <span className="ui-kpi-summary-icon h-11 w-11">
                  <PiWallet className="text-[1rem]" />
                </span>
                <div className="space-y-1">
                  <p className="ui-kpi-summary-label">Saldo inicial</p>
                  <p className="ui-kpi-summary-value text-[1.85rem]">{formatMoney(turnoActual.fondo_inicial)}</p>
                </div>
                <p className="ui-kpi-summary-hint">Base de efectivo al abrir el turno</p>
              </div>

              <div
                className="ui-kpi-summary-item px-4 py-4"
                style={{ '--dashboard-card-icon-bg': 'var(--color-success-soft)' }}
              >
                <span className="ui-kpi-summary-icon h-11 w-11">
                  <PiCashRegister className="text-[1rem]" />
                </span>
                <div className="space-y-1">
                  <p className="ui-kpi-summary-label">Ingresos efectivo</p>
                  <p className="ui-kpi-summary-value text-[1.85rem]">{formatMoney(ingresos)}</p>
                </div>
                <p className="ui-kpi-summary-hint">Ventas contado + cobros + ingresos manuales</p>
              </div>

              <div
                className="ui-kpi-summary-item px-4 py-4"
                style={{ '--dashboard-card-icon-bg': 'var(--color-warning-soft)' }}
              >
                <span className="ui-kpi-summary-icon h-11 w-11">
                  <PiReceipt className="text-[1rem]" />
                </span>
                <div className="space-y-1">
                  <p className="ui-kpi-summary-label">Egresos</p>
                  <p className="ui-kpi-summary-value text-[1.85rem]">{formatMoney(egresos)}</p>
                </div>
                <p className="ui-kpi-summary-hint">Egresos manuales y otros movimientos efectivos</p>
              </div>

              <div
                className="ui-kpi-summary-item px-4 py-4"
                style={{ '--dashboard-card-icon-bg': 'var(--color-danger-soft)' }}
              >
                <span className="ui-kpi-summary-icon h-11 w-11">
                  <PiCurrencyDollarSimpleBold className="text-[1rem]" />
                </span>
                <div className="space-y-1">
                  <p className="ui-kpi-summary-label">Efectivo esperado</p>
                  <p className="ui-kpi-summary-value text-[1.85rem]">{formatMoney(efectivoEsperado)}</p>
                </div>
                <p className="ui-kpi-summary-hint">Caja fisica esperada del turno en curso</p>
              </div>
            </div>
          </section>

          <section className="ui-kpi-summary-shell">
            <div className="mb-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)]">Ventas del turno</p>
                <p className="text-xs text-[var(--color-text-muted)]">Solo el efectivo impacta la caja.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div
                className="flex items-center gap-3 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4"
                style={{ '--dashboard-card-icon-bg': 'var(--color-primary-soft)' }}
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--color-text)]" style={{ background: 'var(--dashboard-card-icon-bg)' }}>
                  <PiWallet className="text-[1.05rem]" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-[1.55rem] font-bold leading-none text-[var(--color-text)]">{formatMoney(resumenVentas.efectivo)}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Efectivo</p>
                </div>
              </div>

              <div
                className="flex items-center gap-3 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4"
                style={{ '--dashboard-card-icon-bg': 'var(--color-info-soft)' }}
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--color-text)]" style={{ background: 'var(--dashboard-card-icon-bg)' }}>
                  <PiArrowsLeftRightBold className="text-[1.05rem]" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-[1.55rem] font-bold leading-none text-[var(--color-text)]">{formatMoney(resumenVentas.transferencia)}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Transferencia</p>
                </div>
              </div>

              <div
                className="flex items-center gap-3 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4"
                style={{ '--dashboard-card-icon-bg': 'var(--color-warning-soft)' }}
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--color-text)]" style={{ background: 'var(--dashboard-card-icon-bg)' }}>
                  <PiCreditCardBold className="text-[1.05rem]" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-[1.55rem] font-bold leading-none text-[var(--color-text)]">{formatMoney(resumenVentas.credito)}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Crédito</p>
                </div>
              </div>

              <div
                className="flex items-center gap-3 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4"
                style={{ '--dashboard-card-icon-bg': 'var(--color-danger-soft)' }}
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--color-text)]" style={{ background: 'var(--dashboard-card-icon-bg)' }}>
                  <PiCurrencyDollarSimpleBold className="text-[1.05rem]" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-[1.55rem] font-bold leading-none text-[var(--color-text)]">{formatMoney(resumenVentas.total_ventas)}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Total ventas</p>
                </div>
              </div>
            </div>
          </section>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--color-text)]">Movimientos del turno actual</p>
                  <p className="text-xs text-[var(--color-text-muted)]">Ventas, ingresos y egresos con sentido contable del turno.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['TODOS', 'VENTAS', 'INGRESOS', 'EGRESOS'].map((item) => (
                    <Button
                      key={item}
                      type="button"
                      size="sm"
                      variant={movementFilter === item ? 'primary' : 'secondary'}
                      onClick={() => setMovementFilter(item)}
                    >
                      {item === 'TODOS' ? 'Todos' : item === 'VENTAS' ? 'Ventas' : item === 'INGRESOS' ? 'Ingresos' : 'Egresos'}
                    </Button>
                  ))}
                </div>
              </div>

              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Fecha</TablaCelda>
                    <TablaCelda as="th">Método</TablaCelda>
                    <TablaCelda as="th">Impacto saldo</TablaCelda>
                    <TablaCelda as="th">Sentido</TablaCelda>
                    <TablaCelda as="th">Origen</TablaCelda>
                    <TablaCelda as="th" className="text-right">Monto</TablaCelda>
                    <TablaCelda as="th">Usuario</TablaCelda>
                    <TablaCelda as="th">Accion</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {movimientos.length === 0 ? (
                    <TablaFila>
                      <TablaCelda colSpan={8} className="text-center text-[var(--color-text-muted)]">
                        Sin movimientos registrados en este turno.
                      </TablaCelda>
                    </TablaFila>
                  ) : (
                    movimientosPaginados.map((m) => {
                      const sense = resolveMovementSense(m);
                      const balanceImpact = resolveBalanceImpact(m);
                      return (
                      <TablaFila key={m.id} className={!m.afecta_saldo ? 'bg-[var(--color-surface-muted)]' : undefined}>
                        <TablaCelda>{formatDateQuito(m.fecha)}</TablaCelda>
                        <TablaCelda>
                          <div className="space-y-1">
                            <div>{formatPaymentMethod(m.metodo_pago)}</div>
                            <div className="text-xs text-[var(--color-text-muted)]">{formatMovementType(m.tipo)}</div>
                          </div>
                        </TablaCelda>
                        <TablaCelda><StatusBadge tone={balanceImpact.tone}>{balanceImpact.label}</StatusBadge></TablaCelda>
                        <TablaCelda><StatusBadge tone={sense.tone}>{sense.label}</StatusBadge></TablaCelda>
                        <TablaCelda>{m.documento_origen || m.modulo_origen || '-'}</TablaCelda>
                        <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(m.monto)}</TablaCelda>
                        <TablaCelda>{m.usuario_nombre || (m.usuario_id ? `Usuario #${m.usuario_id}` : '-')}</TablaCelda>
                        <TablaCelda>
                          <IconButton
                            variant="iconView"
                            size="sm"
                            aria-label="Ver detalle"
                            title="Ver detalle"
                            onClick={() => onViewMovimiento(m)}
                          >
                            <PiEye className="text-lg" />
                          </IconButton>
                        </TablaCelda>
                      </TablaFila>
                    )})
                  )}
                </TablaCuerpo>
              </Tabla>

              {movimientos.length > pageSize ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Mostrando {(movimientosPage - 1) * pageSize + 1}-{Math.min(movimientosPage * pageSize, movimientos.length)} de {movimientos.length} movimientos
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={movimientosPage <= 1}
                      onClick={() => setMovimientosPage((page) => Math.max(1, page - 1))}
                    >
                      Anterior
                    </Button>
                    <span className="min-w-[5.5rem] text-center text-sm font-medium text-[var(--color-text)]">
                      {movimientosPage} / {totalMovimientosPages}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={movimientosPage >= totalMovimientosPages}
                      onClick={() => setMovimientosPage((page) => Math.min(totalMovimientosPages, page + 1))}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card className="space-y-4 p-5">
              <div>
                <p className="font-semibold text-[var(--color-text)]">Cierre de caja</p>
                <p className="text-sm text-[var(--color-text-muted)]">Ejecuta corte X o cierre definitivo del turno.</p>
              </div>

              <Input
                placeholder="Efectivo contado"
                value={corteData.efectivo_contado}
                onChange={(e) => setCorteData((s) => ({ ...s, efectivo_contado: e.target.value }))}
              />

              <Textarea
                placeholder="Observacion (si hay diferencia)"
                value={corteData.observacion}
                onChange={(e) => setCorteData((s) => ({ ...s, observacion: e.target.value }))}
              />

              <div className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text-muted)]">
                <p>Efectivo esperado: <strong className="text-[var(--color-text)]">{formatMoney(efectivoEsperado)}</strong></p>
                <p>Efectivo contado: <strong className="text-[var(--color-text)]">{formatMoney(efectivoContado)}</strong></p>
                <p>
                  Diferencia:{' '}
                  <strong className={diferenciaCierre > 0 ? 'text-success' : diferenciaCierre < 0 ? 'text-danger' : 'text-[var(--color-text)]'}>
                    {formatMoney(diferenciaCierre)}
                  </strong>
                </p>
                <p>
                  Estado:{' '}
                  <strong className="text-[var(--color-text)]">
                    {diferenciaCierre === 0 ? 'Cuadre exacto' : diferenciaCierre > 0 ? 'Sobrante' : 'Faltante'}
                  </strong>
                </p>
              </div>

              {requiereAutorizacionAdmin && (
                <div className="grid gap-2 rounded-xl border border-warning bg-warning-soft p-3">
                  <Input
                    className="border-warning"
                    placeholder="Usuario admin"
                    value={corteAuth.usuario}
                    onChange={(e) => setCorteAuth((s) => ({ ...s, usuario: e.target.value }))}
                  />
                  <Input
                    type="password"
                    className="border-warning"
                    placeholder="Clave admin"
                    value={corteAuth.password}
                    onChange={(e) => setCorteAuth((s) => ({ ...s, password: e.target.value }))}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={onCorteX}>
                  Corte X
                </Button>
                <Button variant="danger" onClick={onCorteZ} disabled={corteData.efectivo_contado === ''}>
                  Cerrar turno
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      <Modal open={Boolean(manualModal)} onClose={() => setManualModal(null)} maxWidthClass="max-w-md" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              {manualModal === 'EGRESO' ? 'Registrar egreso manual' : 'Registrar ingreso manual'}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)]">Ingresa concepto y monto para el turno actual.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setManualModal(null)}>
            X
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <Input
            placeholder="Concepto"
            value={manualForm.concepto}
            onChange={(e) => setManualForm((s) => ({ ...s, concepto: e.target.value }))}
          />
          <Input
            placeholder="Monto"
            value={manualForm.monto}
            onChange={(e) => setManualForm((s) => ({ ...s, monto: e.target.value }))}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setManualModal(null)}>
            Cancelar
          </Button>
          <Button type="button" variant={manualModal === 'EGRESO' ? 'danger' : 'primary'} onClick={onManual}>
            Guardar
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(movimientoDetalle)} onClose={() => setMovimientoDetalle(null)} maxWidthClass="max-w-md" panelClassName="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Detalle movimiento</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMovimientoDetalle(null)}>
            X
          </Button>
        </div>

        <div className="mt-3 space-y-2 text-sm text-[var(--color-text)]">
          <p><span className="font-semibold">Fecha:</span> {formatDateQuito(movimientoDetalle?.fecha)}</p>
          <p><span className="font-semibold">Tipo:</span> {movimientoDetalle?.tipo}</p>
          <p><span className="font-semibold">Método:</span> {formatPaymentMethod(movimientoDetalle?.metodo_pago)}</p>
          <p><span className="font-semibold">Sentido:</span> {movimientoDetalle?.sentido || '-'}</p>
          <p><span className="font-semibold">Concepto:</span> {movimientoDetalle?.concepto}</p>
          <p><span className="font-semibold">Modulo origen:</span> {movimientoDetalle?.modulo_origen || '-'}</p>
          <p><span className="font-semibold">Documento origen:</span> {movimientoDetalle?.documento_origen || '-'}</p>
          <p><span className="font-semibold">Actor:</span> {movimientoDetalle?.usuario_nombre || movimientoDetalle?.usuario_id || '-'}</p>
          <p><span className="font-semibold">Observacion:</span> {movimientoDetalle?.observacion || '-'}</p>
          <p><span className="font-semibold">Monto:</span> {formatMoney(movimientoDetalle?.monto)}</p>
        </div>
      </Modal>
    </div>
  );
}
