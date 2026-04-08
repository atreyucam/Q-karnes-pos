import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Textarea
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

  if (cantidadRaw && (!Number.isFinite(cantidad) || cantidad <= 0)) {
    errors.push('Cantidad inválida.');
  }
  if (Number.isFinite(cantidad) && cantidad > pendiente) {
    errors.push('No puede recibir más que lo pendiente.');
  }
  if (inputCostoRaw && !cantidadRaw) {
    errors.push('Ingresa cantidad antes del costo.');
  }
  if (cantidadRaw && !inputCostoRaw) {
    errors.push(costMode === 'UNITARIO' ? 'Costo unitario requerido.' : 'Costo total requerido.');
  }
  if (inputCostoRaw && (!Number.isFinite(costMode === 'UNITARIO' ? costoUnitarioParsed : costoTotalParsed) || (costMode === 'UNITARIO' ? costoUnitarioParsed : costoTotalParsed) < 0)) {
    errors.push('Costo inválido.');
  }

  const payload = Number.isFinite(cantidad) && cantidad > 0 && cantidad <= pendiente && Number.isFinite(derivedUnitCost) && Number.isFinite(derivedTotalCost)
    ? {
        orden_detalle_id: detail.id,
        cantidad,
        ...(costMode === 'UNITARIO'
          ? { costo_unit_real: derivedUnitCost }
          : { costo_total_real: derivedTotalCost })
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
  if (!selectedLines.length) return order.estado;

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

  const onLineChange = (detailId, field, value) => {
    setRecv((prev) => {
      const next = { ...(prev[detailId] || getEmptyLineState()) };
      if (field === 'cantidad') next.cantidad = sanitizeQtyInput(value, (ordenActual?.detalle || []).find((line) => line.id === detailId)?.unidad_medida || 'UND');
      if (field === 'costMode') next.costMode = value;
      if (field === 'costoUnitario') next.costoUnitario = sanitizeDecimalInput(value, 6);
      if (field === 'costoTotal') next.costoTotal = sanitizeDecimalInput(value, 6);
      return { ...prev, [detailId]: next };
    });
  };

  const onRegistrar = async () => {
    const nextIssues = [];
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
    } catch (nextError) {
      setLocalError(parseApiError(nextError));
    }
  };

  return (
    <div className="space-y-5">
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
            className="mt-2"
            rows={3}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Impacto esperado</p>
            <p className="mt-1 font-semibold text-[var(--color-text)]">{selectedPayloadItems.length} línea(s) actualizan inventario</p>
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
              <TablaCelda as="th">Producto</TablaCelda>
              <TablaCelda as="th">Pendiente</TablaCelda>
              <TablaCelda as="th">Recibir</TablaCelda>
              <TablaCelda as="th">Modalidad costo</TablaCelda>
              <TablaCelda as="th">Costo unit. real</TablaCelda>
              <TablaCelda as="th">Costo total real</TablaCelda>
              <TablaCelda as="th">Impacto</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {(ordenActual?.detalle || []).map((detail) => {
              const line = buildLineReception(detail, recv[detail.id] || getEmptyLineState());
              const editableUnit = line.costMode === 'UNITARIO';
              const editableTotal = line.costMode === 'TOTAL';
              const hasErrors = line.errors.length > 0;

              return (
                <TablaFila key={detail.id} className={hasErrors ? 'bg-[color-mix(in_oklab,var(--color-warning-soft)_76%,white_24%)]' : ''}>
                  <TablaCelda>
                    <div>
                      <p className="font-semibold text-[var(--color-text)]">{detail.producto_codigo} - {detail.producto_nombre}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Recibido {formatQtyByUnit(detail.cantidad_recibida, line.unidad, { fixedLB: line.unidad !== 'UND' })} de {formatQtyByUnit(detail.cantidad, line.unidad, { fixedLB: line.unidad !== 'UND' })}
                      </p>
                    </div>
                  </TablaCelda>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">
                    {formatQtyByUnit(line.pendiente, line.unidad, { fixedLB: line.unidad !== 'UND' })}
                  </TablaCelda>
                  <TablaCelda>
                    <Input
                      className={hasErrors && line.cantidadRaw ? 'border-[var(--color-danger)]' : ''}
                      value={recv[detail.id]?.cantidad || ''}
                      onChange={(e) => onLineChange(detail.id, 'cantidad', e.target.value)}
                      placeholder={line.unidad === 'UND' ? '0' : '0.000'}
                    />
                  </TablaCelda>
                  <TablaCelda>
                    <Select value={recv[detail.id]?.costMode || 'UNITARIO'} onChange={(e) => onLineChange(detail.id, 'costMode', e.target.value)}>
                      <option value="UNITARIO">Unitario</option>
                      <option value="TOTAL">Total</option>
                    </Select>
                  </TablaCelda>
                  <TablaCelda>
                    <Input
                      className={!editableUnit ? 'bg-[var(--color-surface-muted)]' : ''}
                      readOnly={!editableUnit}
                      value={editableUnit ? (recv[detail.id]?.costoUnitario || '') : (Number.isFinite(line.derivedUnitCost) ? String(line.derivedUnitCost.toFixed(6)) : '')}
                      onChange={(e) => onLineChange(detail.id, 'costoUnitario', e.target.value)}
                      placeholder="0.000000"
                    />
                  </TablaCelda>
                  <TablaCelda>
                    <Input
                      className={!editableTotal ? 'bg-[var(--color-surface-muted)]' : ''}
                      readOnly={!editableTotal}
                      value={editableTotal ? (recv[detail.id]?.costoTotal || '') : (Number.isFinite(line.derivedTotalCost) ? String(line.derivedTotalCost.toFixed(6)) : '')}
                      onChange={(e) => onLineChange(detail.id, 'costoTotal', e.target.value)}
                      placeholder="0.000000"
                    />
                  </TablaCelda>
                  <TablaCelda>
                    {line.errors.length > 0 ? (
                      <div className="space-y-1 text-xs text-[var(--color-danger)]">
                        {line.errors.map((message) => <p key={message}>{message}</p>)}
                      </div>
                    ) : line.payload ? (
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-[var(--color-text)]">Inventario sí se actualiza</p>
                        <p className="text-[var(--color-text-muted)]">Subtotal: {formatMoney(line.derivedTotalCost)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">Sin recepción en esta línea</span>
                    )}
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-text-muted)]">La orden quedará <strong>{projectedStatusMeta.label}</strong> si confirmas esta recepción.</p>
          <Button disabled={recepcionBloqueada || (!efectivoHabilitado && !creditoComprasHabilitado)} onClick={onRegistrar}>
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
              variant="secondary"
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
