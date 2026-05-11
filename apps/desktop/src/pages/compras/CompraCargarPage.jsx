import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PiInfo } from 'react-icons/pi';
import apiClient, { normalizeResponse, parseApiError } from '../../lib/apiClient';
import {
  Alert,
  BackButton,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea,
  Toast
} from '../../ui';
import { useComprasStore } from '../../stores/comprasStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import { resolveCompraStatus } from './comprasStatus';

function parseQtyByUnit(value, unidad) {
  const unit = getUnidad(unidad);
  if (unit === 'UND') {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseMoney(value) {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getTodayInEcuador() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getEmptyLineState() {
  return {
    cantidad: '',
    costMode: 'UNITARIO',
    costoUnitario: '',
    costoTotal: ''
  };
}

function formatMoneyInput(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
}

function formatQtyInput(value, unidad) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return getUnidad(unidad) === 'UND' ? String(Math.trunc(parsed)) : parsed.toFixed(3);
}

function buildLineReception(detail, state = {}) {
  const unidad = detail.unidad_medida || detail.unidad || 'UND';
  const pendiente = Number(detail.cantidad_pendiente ?? (Number(detail.cantidad) - Number(detail.cantidad_recibida)));
  const cantidadRaw = String(state.cantidad || '').trim();
  const cantidad = parseQtyByUnit(cantidadRaw, unidad);
  const costMode = state.costMode === 'TOTAL' ? 'TOTAL' : 'UNITARIO';
  const costoUnitarioRaw = String(state.costoUnitario || '').trim();
  const costoTotalRaw = String(state.costoTotal || '').trim();
  const inputCostoRaw = costMode === 'UNITARIO' ? costoUnitarioRaw : costoTotalRaw;
  const costoUnitarioParsed = parseMoney(costoUnitarioRaw);
  const costoTotalParsed = parseMoney(costoTotalRaw);
  const derivedUnitCost = costMode === 'TOTAL'
    ? (Number.isFinite(cantidad) && cantidad > 0 && Number.isFinite(costoTotalParsed) ? costoTotalParsed / cantidad : NaN)
    : costoUnitarioParsed;
  const derivedTotalCost = costMode === 'UNITARIO'
    ? (Number.isFinite(cantidad) && Number.isFinite(costoUnitarioParsed) ? cantidad * costoUnitarioParsed : NaN)
    : costoTotalParsed;

  const errors = [];

  if (cantidadRaw && (!Number.isFinite(cantidad) || cantidad < 0)) {
    errors.push('Cantidad inválida.');
  }
  if (Number.isFinite(cantidad) && cantidad === 0 && (costoUnitarioRaw || costoTotalRaw)) {
    errors.push('Si recibir es 0, los costos deben quedar en 0.00.');
  }
  if (Number.isFinite(cantidad) && cantidad > pendiente) {
    errors.push('No puede recibir más que lo pendiente.');
  }
  if (inputCostoRaw && !cantidadRaw) {
    errors.push('Ingresa cantidad antes del costo.');
  }
  if (cantidadRaw && Number.isFinite(cantidad) && cantidad > 0 && !inputCostoRaw) {
    errors.push(costMode === 'UNITARIO' ? 'Costo unitario requerido.' : 'Costo total requerido.');
  }
  if (inputCostoRaw && (!Number.isFinite(costMode === 'UNITARIO' ? costoUnitarioParsed : costoTotalParsed) || (costMode === 'UNITARIO' ? costoUnitarioParsed : costoTotalParsed) < 0)) {
    errors.push('Costo inválido.');
  }
  if (Number.isFinite(cantidad) && cantidad > 0) {
    const activeCost = costMode === 'UNITARIO' ? costoUnitarioParsed : costoTotalParsed;
    if (Number.isFinite(activeCost) && activeCost <= 0) {
      errors.push(costMode === 'UNITARIO' ? 'Costo unitario debe ser mayor a 0.' : 'Costo total debe ser mayor a 0.');
    }
  }

  const payload = Number.isFinite(cantidad) && cantidad > 0 && cantidad <= pendiente && Number.isFinite(derivedUnitCost) && Number.isFinite(derivedTotalCost) && derivedUnitCost > 0 && derivedTotalCost > 0
    ? {
        orden_detalle_id: detail.id,
        cantidad,
        costo_unit_real: derivedUnitCost,
        costo_total_real: derivedTotalCost
      }
    : null;

  return {
    unidad,
    pendiente,
    cantidadRaw,
    cantidad,
    costMode,
    costoUnitarioRaw,
    costoTotalRaw,
    derivedUnitCost,
    derivedTotalCost,
    errors,
    payload
  };
}

function resolveProjectedOrderStatus(order, detalle, selectedLines) {
  if (!order || !Array.isArray(detalle)) return null;
  if (!['ABIERTA', 'PARCIAL'].includes(order.estado)) return order.estado;
  if (!selectedLines.length) return 'ABIERTA';

  const projected = detalle.map((line) => {
    const selected = selectedLines.find((item) => Number(item.orden_detalle_id) === Number(line.id));
    return Number(line.cantidad_recibida || 0) + Number(selected?.cantidad || 0);
  });

  const totalLines = detalle.length;
  const completedLines = detalle.filter((line, index) => projected[index] >= Number(line.cantidad || 0)).length;
  const hasReception = projected.some((cantidad) => cantidad > 0);

  if (totalLines > 0 && completedLines === totalLines) return 'COMPLETA';
  if (hasReception) return 'PARCIAL';
  return 'ABIERTA';
}

export default function CompraCargarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ordenActual, error, errorMeta, cargarOrden, recepcionarOrden } = useComprasStore();
  const configuracion = useConfiguracionStore((s) => s.configuracion);
  const metodosPago = useConfiguracionStore((s) => s.metodosPago);
  const cargarConfiguracion = useConfiguracionStore((s) => s.cargarTodo);

  const ordenId = Number(id);
  const [documentoRespaldo, setDocumentoRespaldo] = useState('');
  const [factura, setFactura] = useState({ numero_factura: '', metodo_pago: 'CREDITO' });
  const [fechaRecepcion, setFechaRecepcion] = useState(getTodayInEcuador());
  const [observacion, setObservacion] = useState('');
  const [recv, setRecv] = useState({});
  const [localError, setLocalError] = useState('');
  const [requiredIssues, setRequiredIssues] = useState([]);
  const [proveedorInfo, setProveedorInfo] = useState(null);
  const [resumenCxp, setResumenCxp] = useState(null);
  const [recepcionSuccess, setRecepcionSuccess] = useState({ open: false, recepcionId: null, total: 0, estado: null });
  const [statusToast, setStatusToast] = useState('');
  const [statusToastError, setStatusToastError] = useState('');
  const [statusToastWarning, setStatusToastWarning] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [errorToastVisible, setErrorToastVisible] = useState(false);
  const [warningToastVisible, setWarningToastVisible] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const efectivoHabilitado = metodosPago.length === 0
    || metodosPago.some((method) => method.codigo === 'EFECTIVO' && method.habilitado);
  const creditoComprasHabilitado = Boolean(configuracion?.permitir_compras_credito);
  const lineErrors = errorMeta?.details?.lines || [];
  const recepcionBloqueada = ordenActual?.orden && ordenActual.orden.recepcionable === false;

  useEffect(() => {
    cargarConfiguracion();
  }, [cargarConfiguracion]);

  useEffect(() => {
    if (!Number.isFinite(ordenId) || ordenId <= 0) return;
    cargarOrden(ordenId);
  }, [ordenId, cargarOrden]);

  useEffect(() => {
    setFactura((state) => {
      if (state.metodo_pago === 'CREDITO' && !creditoComprasHabilitado) {
        return { ...state, metodo_pago: efectivoHabilitado ? 'CONTADO' : state.metodo_pago };
      }
      if (state.metodo_pago === 'CONTADO' && !efectivoHabilitado && creditoComprasHabilitado) {
        return { ...state, metodo_pago: 'CREDITO' };
      }
      return state;
    });
  }, [creditoComprasHabilitado, efectivoHabilitado]);

  useEffect(() => {
    let active = true;

    async function loadProveedorData() {
      const proveedorId = ordenActual?.orden?.proveedor_id;
      if (!proveedorId) {
        if (active) {
          setProveedorInfo(null);
          setResumenCxp(null);
        }
        return;
      }

      try {
        const proveedorResp = await apiClient.get(`/api/proveedores/${proveedorId}`);
        if (active) setProveedorInfo(normalizeResponse(proveedorResp.data));
      } catch (_) {
        if (active) setProveedorInfo(null);
      }

      try {
        const resumenResp = await apiClient.get(`/api/cxp/proveedores/${proveedorId}/resumen`);
        if (active) setResumenCxp(normalizeResponse(resumenResp.data));
      } catch (_) {
        if (active) setResumenCxp(null);
      }
    }

    loadProveedorData();
    return () => {
      active = false;
    };
  }, [ordenActual?.orden?.proveedor_id]);

  const lineStates = useMemo(
    () => (ordenActual?.detalle || []).map((detail) => ({ detail, state: buildLineReception(detail, recv[detail.id] || getEmptyLineState()) })),
    [ordenActual?.detalle, recv]
  );

  const selectedPayloadItems = useMemo(
    () => lineStates.map((line) => line.state.payload).filter(Boolean),
    [lineStates]
  );

  const totalRecepcion = useMemo(
    () => selectedPayloadItems.reduce((acc, item) => {
      if (item.costo_total_real !== undefined) return acc + Number(item.costo_total_real || 0);
      return acc + (Number(item.costo_unit_real || 0) * Number(item.cantidad || 0));
    }, 0),
    [selectedPayloadItems]
  );

  const projectedStatus = useMemo(
    () => resolveProjectedOrderStatus(ordenActual?.orden, ordenActual?.detalle || [], selectedPayloadItems),
    [ordenActual?.detalle, ordenActual?.orden, selectedPayloadItems]
  );
  const projectedStatusMeta = resolveCompraStatus(projectedStatus, projectedStatus);
  const hasLineErrors = useMemo(() => lineStates.some(({ state }) => state.errors.length > 0), [lineStates]);
  const canSubmit = !recepcionBloqueada && !hasLineErrors && selectedPayloadItems.length > 0 && (efectivoHabilitado || creditoComprasHabilitado);

  useEffect(() => {
    if (!statusToast) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 2800);
    const clearTimer = window.setTimeout(() => setStatusToast(''), 3000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToast]);

  useEffect(() => {
    if (!statusToastError) return undefined;
    setErrorToastVisible(true);
    const hideTimer = window.setTimeout(() => setErrorToastVisible(false), 2800);
    const clearTimer = window.setTimeout(() => setStatusToastError(''), 3000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToastError]);

  useEffect(() => {
    if (!statusToastWarning) return undefined;
    setWarningToastVisible(true);
    const hideTimer = window.setTimeout(() => setWarningToastVisible(false), 2800);
    const clearTimer = window.setTimeout(() => setStatusToastWarning(''), 3000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToastWarning]);

  const onLineChange = (detailId, field, value) => {
    setRecv((prev) => {
      const next = { ...(prev[detailId] || getEmptyLineState()) };
      if (field === 'cantidad') {
        const detail = (ordenActual?.detalle || []).find((line) => line.id === detailId);
        next.cantidad = sanitizeQtyInput(value, detail?.unidad_medida || 'UND');
        const nextCantidad = parseQtyByUnit(next.cantidad, detail?.unidad_medida || detail?.unidad || 'UND');
        const pendiente = Number(detail?.cantidad_pendiente ?? (Number(detail?.cantidad) - Number(detail?.cantidad_recibida)));
        if (Number.isFinite(nextCantidad) && Number.isFinite(pendiente) && nextCantidad > pendiente) {
          setStatusToastError('La cantidad a recibir no puede superar el máximo pendiente.');
        }
      }
      if (field === 'costMode') next.costMode = value;
      if (field === 'costoUnitario') next.costoUnitario = sanitizeDecimalInput(value, 2);
      if (field === 'costoTotal') next.costoTotal = sanitizeDecimalInput(value, 2);
      return { ...prev, [detailId]: next };
    });
  };

  const onLineBlur = (detail, field) => {
    setRecv((prev) => {
      const current = { ...(prev[detail.id] || getEmptyLineState()) };
      if (field === 'cantidad') {
        current.cantidad = formatQtyInput(current.cantidad, detail.unidad_medida || detail.unidad || 'UND');
      }
      if (field === 'costoUnitario') {
        current.costoUnitario = formatMoneyInput(current.costoUnitario);
      }
      if (field === 'costoTotal') {
        current.costoTotal = formatMoneyInput(current.costoTotal);
      }
      return { ...prev, [detail.id]: current };
    });
  };

  const onRegistrar = async () => {
    const nextIssues = [];
    setSubmitAttempted(true);
    setLocalError('');
    setRequiredIssues([]);

    if (recepcionBloqueada) {
      setLocalError('Esta orden ya no admite nuevas recepciones por su estado actual.');
      return;
    }

    if (!fechaRecepcion) nextIssues.push('Fecha de recepción');
    if (!documentoRespaldo.trim()) nextIssues.push('Documento de respaldo');
    if (!factura.numero_factura.trim()) nextIssues.push('Número de factura');
    if (!factura.metodo_pago.trim()) nextIssues.push('Método de pago');

    lineStates.forEach(({ state }, index) => {
      state.errors.forEach((message) => nextIssues.push(`Línea ${index + 1}: ${message}`));
    });

    if (!selectedPayloadItems.length) {
      nextIssues.push('Al menos una línea con cantidad recibida y costo real');
    }

    if (nextIssues.length > 0) {
      setRequiredIssues(Array.from(new Set(nextIssues)));
      setLocalError('Faltan campos obligatorios o hay líneas inválidas en la recepción.');
      setStatusToastWarning('Completa las líneas recibidas con costo real válido');
      return;
    }

    try {
      const result = await recepcionarOrden(ordenId, {
        documento_respaldo: documentoRespaldo.trim(),
        fecha_recepcion: fechaRecepcion || undefined,
        observacion: observacion || undefined,
        factura: {
          numero_factura: factura.numero_factura.trim(),
          metodo_pago: factura.metodo_pago
        },
        items: selectedPayloadItems
      });

      await cargarOrden(ordenId);
      setRecepcionSuccess({
        open: true,
        recepcionId: result?.recepcion_id || null,
        total: Number(result?.total || totalRecepcion || 0),
        estado: result?.estado || projectedStatus
      });
      setStatusToast('Recepción registrada correctamente');
    } catch (nextError) {
      setLocalError(parseApiError(nextError));
      setStatusToastError('No se pudo registrar la recepción');
    }
  };

  return (
    <div className="space-y-5">
      {statusToast ? <div className="fixed right-5 top-5 z-[1200]"><Toast tone="success" className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToast}</Toast></div> : null}
      {statusToastError ? <div className="fixed right-5 top-5 z-[1200]"><Toast tone="danger" className={errorToastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToastError}</Toast></div> : null}
      {statusToastWarning ? <div className="fixed right-5 top-5 z-[1200]"><Toast tone="warning" className={warningToastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToastWarning}</Toast></div> : null}
      <BackButton to={`/compras/ordenes/${ordenId}`}>Volver</BackButton>

      <PageHeader
        title={`Registrar recepción compra #${ordenId}`}
        description="La recepción actualiza stock, costo visible y valorización."
      />

      {(error || localError) && <Alert tone="error">{localError || error}</Alert>}
      <Alert tone="info">
        La recepción actualiza stock, costo visible y valorización. La orden puede quedar PARCIAL o COMPLETA según lo recibido.
      </Alert>
      {requiredIssues.length > 0 && (
        <Alert tone="warning">
          <div className="space-y-1">
            <p className="font-semibold">Revisa estos puntos antes de confirmar:</p>
            <ul className="list-disc pl-5 text-sm">
              {requiredIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </div>
        </Alert>
      )}
      {lineErrors.length > 0 && (
        <Alert tone="error">
          <div className="space-y-1">
            <p className="font-semibold">El backend rechazó una o más líneas:</p>
            <ul className="list-disc pl-5 text-sm">
              {lineErrors.map((line) => (
                <li key={`${line.index}-${line.code}`}>
                  Línea {Number(line.index) + 1}: {line.message}
                </li>
              ))}
            </ul>
          </div>
        </Alert>
      )}
      {recepcionBloqueada && (
        <Alert tone="warning">
          La orden está en estado <strong>{ordenActual?.orden?.estado_label || ordenActual?.orden?.estado}</strong> y ya no admite recepciones.
        </Alert>
      )}
      {!efectivoHabilitado && !creditoComprasHabilitado && (
        <Alert tone="warning">No hay método disponible para registrar la recepción. Revisa la configuración del sistema.</Alert>
      )}

      {(proveedorInfo || ordenActual?.orden) && (
        <Card className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Proveedor</p>
            <p className="font-semibold text-[var(--color-text)]">{ordenActual?.orden?.proveedor_nombre || proveedorInfo?.nombre || '-'}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{proveedorInfo?.telefono || 'Sin teléfono'} • {proveedorInfo?.direccion || 'Sin dirección'}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Orden actual</p>
            <div><StatusBadge status={resolveCompraStatus(ordenActual?.orden?.estado, ordenActual?.orden?.estado_label).badgeStatus}>{ordenActual?.orden?.estado_label || resolveCompraStatus(ordenActual?.orden?.estado).label}</StatusBadge></div>
            <p className="text-sm text-[var(--color-text-muted)]">{formatDateQuito(ordenActual?.orden?.fecha_emision || ordenActual?.orden?.fecha)}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Estado proyectado</p>
            <div><StatusBadge status={projectedStatusMeta.badgeStatus}>{projectedStatusMeta.label}</StatusBadge></div>
            <p className="text-sm text-[var(--color-text-muted)]">{selectedPayloadItems.length} línea(s) con recepción</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Saldo proveedor</p>
            <p className="text-lg font-bold text-[var(--color-text)]">{formatMoney(resumenCxp?.saldo || 0)}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{proveedorInfo?.tiene_credito ? `Crédito ${Number(proveedorInfo?.dias_pago || 0)} días` : 'Proveedor sin crédito'}</p>
          </div>
        </Card>
      )}

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Fecha de recepción</label>
            <Input className="mt-2" type="date" value={fechaRecepcion} onChange={(e) => setFechaRecepcion(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Documento de respaldo</label>
            <Input
              className="mt-2"
              placeholder="Guía, acta o recibo"
              value={documentoRespaldo}
              onChange={(e) => setDocumentoRespaldo(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Número de factura</label>
            <Input
              className="mt-2"
              placeholder="001-001-0000001"
              value={factura.numero_factura}
              onChange={(e) => setFactura((state) => ({ ...state, numero_factura: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Método de pago</label>
            <Select className="mt-2" value={factura.metodo_pago} onChange={(e) => setFactura((state) => ({ ...state, metodo_pago: e.target.value }))}>
              {efectivoHabilitado && <option value="CONTADO">CONTADO</option>}
              {creditoComprasHabilitado && <option value="CREDITO">CREDITO</option>}
            </Select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación</label>
          <Textarea
            className="mt-2 max-w-2xl"
            rows={3}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Impacto esperado</p>
            <p className="mt-1 font-semibold text-[var(--color-text)]">
              {selectedPayloadItems.length === 1 ? '1 línea actualiza inventario' : `${selectedPayloadItems.length} líneas actualizan inventario`}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Total recepción</p>
            <p className="mt-1 font-semibold text-[var(--color-text)]">{formatMoney(totalRecepcion)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Resultado de orden</p>
            <p className="mt-1 font-semibold text-[var(--color-text)]">{projectedStatusMeta.label}</p>
          </div>
        </div>

        {factura.metodo_pago === 'CONTADO' && (
          <Alert tone="warning">
            La recepción con pago CONTADO requiere caja abierta en el backend.
          </Alert>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-[var(--color-text)]">Líneas pendientes por recibir</p>
            <p className="text-sm text-[var(--color-text-muted)]">Cada línea puede valorarse por costo unitario real o costo total real.</p>
          </div>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th" className="w-[25%]">Producto</TablaCelda>
              <TablaCelda as="th" className="w-[22%]">Cantidad a recibir</TablaCelda>
              <TablaCelda as="th" className="w-[22%]">Modalidad costo</TablaCelda>
              <TablaCelda as="th" className="w-[31%]">Costo</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {(ordenActual?.detalle || []).map((detail) => {
              const line = buildLineReception(detail, recv[detail.id] || getEmptyLineState());
              const hasReceivingQty = Number.isFinite(line.cantidad) && line.cantidad > 0;
              const editableUnit = line.costMode === 'UNITARIO' && hasReceivingQty;
              const editableTotal = line.costMode === 'TOTAL' && hasReceivingQty;
              const hasErrors = submitAttempted && line.errors.length > 0;
              const quantityOverMax = Number.isFinite(line.cantidad) && line.cantidad > line.pendiente;
              const editableInputClass = 'h-9 pr-3 pl-7 text-right bg-white border-[color-mix(in_oklab,var(--color-text-muted)_45%,white_55%)] text-[var(--color-text)] transition-colors duration-150 hover:border-[var(--color-text-muted)] focus:border-[var(--color-text)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--color-text)_16%,transparent)]';
              const readonlyInputClass = 'h-9 pr-3 pl-7 text-right bg-[var(--color-surface-muted)] border-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed transition-colors duration-150';

              return (
                <TablaFila key={detail.id} className={`align-top ${hasErrors ? 'bg-[color-mix(in_oklab,var(--color-warning-soft)_82%,white_18%)]' : ''}`}>
                  <TablaCelda className="py-5">
                    <div>
                      <p className="text-[0.95rem] font-bold text-[var(--color-text)]" title={detail.producto_codigo || ''}>{detail.producto_nombre}</p>
                      <p className="text-[13px] text-[var(--color-text-muted)]">
                        Recibido: {formatQtyByUnit(detail.cantidad_recibida, line.unidad, { fixedLB: line.unidad !== 'UND' })} de {formatQtyByUnit(detail.cantidad, line.unidad, { fixedLB: line.unidad !== 'UND' })} {line.unidad.toLowerCase()}
                      </p>
                      <p className="text-[13px] text-[var(--color-text-muted)]">
                        Pendiente: {formatQtyByUnit(line.pendiente, line.unidad, { fixedLB: line.unidad !== 'UND' })} {line.unidad.toLowerCase()}
                      </p>
                    </div>
                  </TablaCelda>
                  <TablaCelda className="py-5">
                    <div className="w-full max-w-[230px]">
                      <div className={`flex h-10 overflow-hidden rounded-lg border bg-white ${quantityOverMax || (hasErrors && line.cantidadRaw) ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'}`}>
                        <Input
                          className={`h-10 flex-1 border-0 bg-transparent text-right focus:ring-0 ${quantityOverMax || (hasErrors && line.cantidadRaw) ? 'text-[var(--color-danger)]' : ''}`}
                          value={recv[detail.id]?.cantidad || ''}
                          onChange={(e) => onLineChange(detail.id, 'cantidad', e.target.value)}
                          onBlur={() => onLineBlur(detail, 'cantidad')}
                          placeholder={line.unidad === 'UND' ? '0' : '0.000'}
                        />
                        <div className="flex w-14 items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs font-semibold uppercase text-[var(--color-text-muted)]">
                          {line.unidad.toLowerCase()}
                        </div>
                      </div>
                      <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Máx. {formatQtyByUnit(line.pendiente, line.unidad, { fixedLB: line.unidad !== 'UND' })} {line.unidad.toLowerCase()}</p>
                    </div>
                  </TablaCelda>
                  <TablaCelda className="py-5">
                    <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1 align-middle">
                      <button
                        type="button"
                        className={`h-8 min-w-[88px] rounded-md px-3 text-xs font-semibold transition-colors ${
                          (recv[detail.id]?.costMode || 'UNITARIO') === 'UNITARIO'
                            ? 'bg-[var(--color-text)] text-white shadow-sm'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                        onClick={() => onLineChange(detail.id, 'costMode', 'UNITARIO')}
                      >
                        Unitario
                      </button>
                      <button
                        type="button"
                        className={`h-8 min-w-[88px] rounded-md px-3 text-xs font-semibold transition-colors ${
                          (recv[detail.id]?.costMode || 'UNITARIO') === 'TOTAL'
                            ? 'bg-[var(--color-text)] text-white shadow-sm'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                        onClick={() => onLineChange(detail.id, 'costMode', 'TOTAL')}
                      >
                        Total
                      </button>
                    </div>
                  </TablaCelda>
                  <TablaCelda className="min-w-56 py-5">
                    <div className="ml-auto max-w-[250px]">
                      <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">
                        {line.costMode === 'UNITARIO' ? 'Costo unitario real' : 'Costo total real'}
                      </p>
                      <div className="flex h-10 overflow-hidden rounded-lg">
                        <div className="flex w-11 items-center justify-center border border-r-0 border-[var(--color-border)] bg-[var(--color-surface-muted)] text-sm font-semibold text-[var(--color-text-muted)]">
                          $
                        </div>
                        <Input
                          className={`${(line.costMode === 'UNITARIO' ? editableUnit : editableTotal) ? editableInputClass : readonlyInputClass} h-10 flex-1 rounded-l-none border-l-0 focus:ring-0`}
                          readOnly={line.costMode === 'UNITARIO' ? !editableUnit : !editableTotal}
                          value={
                            line.costMode === 'UNITARIO'
                              ? ((line.costMode === 'UNITARIO' ? editableUnit : editableTotal) ? (recv[detail.id]?.costoUnitario || '') : '0.00')
                              : ((line.costMode === 'UNITARIO' ? editableUnit : editableTotal) ? (recv[detail.id]?.costoTotal || '') : '0.00')
                          }
                          onChange={(e) => onLineChange(detail.id, line.costMode === 'UNITARIO' ? 'costoUnitario' : 'costoTotal', e.target.value)}
                          onBlur={() => onLineBlur(detail, line.costMode === 'UNITARIO' ? 'costoUnitario' : 'costoTotal')}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="mt-1 text-right text-[13px]">
                      {line.costMode === 'UNITARIO' ? (
                        <p className="text-[var(--color-text-muted)]">Total calculado: <span className="font-semibold text-[color-mix(in_oklab,var(--color-success,#2e7d32)_80%,black_20%)]">{formatMoney(Number.isFinite(line.derivedTotalCost) ? line.derivedTotalCost : 0)}</span></p>
                      ) : (
                        <p className="text-[var(--color-text-muted)]">Unitario calculado: <span className="font-semibold text-[color-mix(in_oklab,var(--color-success,#2e7d32)_80%,black_20%)]">{formatMoney(Number.isFinite(line.derivedUnitCost) ? line.derivedUnitCost : 0)}</span> / {line.unidad.toLowerCase()}</p>
                      )}
                    </div>
                    {hasReceivingQty ? null : (
                      <p className="mt-1 text-right text-xs text-[var(--color-text-muted)]">Ingresa una cantidad para calcular el costo.</p>
                    )}
                    {hasErrors ? (
                      <div className="space-y-1 text-xs text-[var(--color-danger)]">
                        {line.errors.map((message) => <p key={message}>{message}</p>)}
                      </div>
                    ) : null}
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
          <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><PiInfo className="text-base" /> La orden quedará <strong>{projectedStatusMeta.label}</strong> si confirmas esta recepción.</p>
          <Button disabled={!canSubmit} onClick={onRegistrar}>
            Confirmar recepción
          </Button>
        </div>
      </Card>

      <Modal open={recepcionSuccess.open} onClose={() => setRecepcionSuccess({ open: false, recepcionId: null, total: 0, estado: null })} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Recepción registrada correctamente</h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              La recepción {recepcionSuccess.recepcionId ? `#${recepcionSuccess.recepcionId}` : ''} actualizó stock, costo visible y valorización.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm text-[var(--color-text)]">
            <p>Total registrado: <strong>{formatMoney(recepcionSuccess.total)}</strong></p>
            <p>Estado resultante: <strong>{resolveCompraStatus(recepcionSuccess.estado, recepcionSuccess.estado).label}</strong></p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="neutral"
              onClick={() => {
                setRecepcionSuccess({ open: false, recepcionId: null, total: 0, estado: null });
                navigate(`/compras/ordenes/${ordenId}`);
              }}
            >
              Ver orden
            </Button>
            <Button
              onClick={() => {
                setRecepcionSuccess({ open: false, recepcionId: null, total: 0, estado: null });
                navigate('/inventario');
              }}
            >
              Ir a inventario
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
