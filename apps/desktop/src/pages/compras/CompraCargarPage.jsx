import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient, { normalizeResponse, parseApiError } from '../../lib/apiClient';
import {
  Alert,
  Button,
  Card,
  Input,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../ui';
import { useComprasStore } from '../../stores/comprasStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
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

function getTodayInEcuador() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export default function CompraCargarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ordenActual, error, errorMeta, cargarOrden, recepcionarOrden } = useComprasStore();
  const configuracion = useConfiguracionStore((s) => s.configuracion);
  const metodosPago = useConfiguracionStore((s) => s.metodosPago);

  const ordenId = Number(id);
  const [factura, setFactura] = useState({ numero_factura: '', metodo_pago: 'CREDITO' });
  const [fechaRecepcion, setFechaRecepcion] = useState(getTodayInEcuador());
  const [observacion, setObservacion] = useState('');
  const [modoCosto, setModoCosto] = useState('UNITARIO');
  const [recv, setRecv] = useState({});
  const [localError, setLocalError] = useState('');
  const [requiredIssues, setRequiredIssues] = useState([]);
  const [proveedorInfo, setProveedorInfo] = useState(null);
  const [resumenCxp, setResumenCxp] = useState(null);
  const efectivoHabilitado = metodosPago.length === 0
    || metodosPago.some((method) => method.codigo === 'EFECTIVO' && method.habilitado);
  const creditoComprasHabilitado = Boolean(configuracion?.permitir_compras_credito);
  const lineErrors = errorMeta?.details?.lines || [];
  const recepcionBloqueada = ordenActual?.orden && ordenActual.orden.recepcionable === false;

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
    async function loadProveedorData() {
      const proveedorId = ordenActual?.orden?.proveedor_id;
      if (!proveedorId) {
        setProveedorInfo(null);
        setResumenCxp(null);
        return;
      }

      const proveedorResp = await apiClient.get(`/api/proveedores/${proveedorId}`);
      setProveedorInfo(normalizeResponse(proveedorResp.data));

      try {
        const resumenResp = await apiClient.get(`/api/cxp/proveedores/${proveedorId}/resumen`);
        setResumenCxp(normalizeResponse(resumenResp.data));
      } catch (_) {
        setResumenCxp(null);
      }
    }

    loadProveedorData();
  }, [ordenActual?.orden?.proveedor_id]);

  const totalRecepcion = useMemo(() => {
    return (ordenActual?.detalle || []).reduce((acc, d) => {
      const qty = parseQtyByUnit(recv[d.id]?.cantidad, d.unidad_medida || d.unidad);
      const cost = Number(String(recv[d.id]?.costo || '').replace(',', '.'));
      const safeQty = Number.isFinite(qty) ? qty : 0;
      const safeCost = Number.isFinite(cost) ? cost : 0;
      return acc + (modoCosto === 'TOTAL' ? safeCost : (safeQty * safeCost));
    }, 0);
  }, [modoCosto, ordenActual, recv]);

  const onRegistrar = async () => {
    const nextIssues = [];
    setLocalError('');
    setRequiredIssues([]);

    if (recepcionBloqueada) {
      setLocalError('Esta orden ya no admite nuevas recepciones por su estado actual.');
      return;
    }

    if (!fechaRecepcion) nextIssues.push('Fecha de recepción');
    if (!factura.numero_factura.trim()) nextIssues.push('Documento de respaldo');
    if (!factura.metodo_pago.trim()) nextIssues.push('Método de pago');

    (ordenActual?.detalle || []).forEach((d, index) => {
      const cantidadRaw = String(recv[d.id]?.cantidad || '').trim();
      const costoRaw = String(recv[d.id]?.costo || '').trim();
      const unidad = d.unidad_medida || d.unidad;
      const cantidad = parseQtyByUnit(cantidadRaw, unidad);
      const costo = Number(String(costoRaw || '').replace(',', '.'));

      if (cantidadRaw && !costoRaw) nextIssues.push(`Costo en fila ${index + 1}`);
      if (costoRaw && !cantidadRaw) nextIssues.push(`Cantidad a recibir en fila ${index + 1}`);
      if (cantidadRaw && (!Number.isFinite(cantidad) || cantidad <= 0)) nextIssues.push(`Cantidad válida en fila ${index + 1}`);
      if (costoRaw && (!Number.isFinite(costo) || costo < 0)) nextIssues.push(`Costo válido en fila ${index + 1}`);
    });

    const items = (ordenActual?.detalle || [])
      .map((d) => {
        const unidad = d.unidad_medida || d.unidad;
        const cantidad = parseQtyByUnit(recv[d.id]?.cantidad, unidad);
        const costo = Number(String(recv[d.id]?.costo || '').replace(',', '.'));
        return {
          orden_detalle_id: d.id,
          cantidad,
          ...(modoCosto === 'TOTAL' ? { costo_total_real: costo } : { costo_unit_real: costo })
        };
      })
      .filter((i) => Number.isFinite(i.cantidad) && i.cantidad > 0 && (
        Number.isFinite(i.costo_unit_real) || Number.isFinite(i.costo_total_real)
      ));

    if (!items.length) nextIssues.push('Al menos una línea con cantidad a recibir y costo unitario');
    if (nextIssues.length > 0) {
      setRequiredIssues(Array.from(new Set(nextIssues)));
      setLocalError('Faltan campos obligatorios o datos inválidos para registrar la recepción.');
      return;
    }

    try {
      await recepcionarOrden(ordenId, {
        documento_respaldo: factura.numero_factura.trim(),
        fecha_recepcion: fechaRecepcion || undefined,
        observacion: observacion || undefined,
        factura: {
          numero_factura: factura.numero_factura.trim(),
          metodo_pago: factura.metodo_pago
        },
        items
      });

      navigate(`/compras/ordenes/${ordenId}`);
    } catch (nextError) {
      setLocalError(parseApiError(nextError));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Registrar recepcion compra #${ordenId}`}
        description="La recepción confirmada ingresa stock y genera el efecto financiero asociado."
        actions={(
          <Button variant="ghost" onClick={() => navigate(`/compras/ordenes/${ordenId}`)}>
            Volver
          </Button>
        )}
      />

      {(error || localError) && <Alert tone="error">{localError || error}</Alert>}
      {requiredIssues.length > 0 && (
        <Alert tone="warning">
          <div className="space-y-1">
            <p className="font-semibold">Completa estos campos antes de guardar:</p>
            <ul className="list-disc pl-5 text-sm">
              {requiredIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </div>
        </Alert>
      )}
      {lineErrors.length > 0 && (
        <Alert tone="error">
          <div className="space-y-1">
            <p className="font-semibold">Hay líneas inválidas en la recepción:</p>
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
        <Alert tone="warning">No hay método disponible para registrar la compra. Revise la configuración del sistema.</Alert>
      )}

      {proveedorInfo && (
        <Card className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Nombre</p>
                <p className="font-semibold text-slate-800">{proveedorInfo.nombre}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Telefono</p>
                <p className="font-semibold text-slate-800">{proveedorInfo.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Credito / dias</p>
                <p className="font-semibold text-slate-800">{proveedorInfo.tiene_credito ? 'SI' : 'NO'} / {Number(proveedorInfo.dias_pago || 0)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Estado proveedor</p>
                <StatusBadge status={proveedorInfo.activo ? 'ACTIVO' : 'INACTIVO'} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Saldo pendiente</p>
                <p className="text-lg font-bold text-[#b41428]">{formatMoney(resumenCxp?.saldo || 0)}</p>
              </div>
            </div>
        </Card>
      )}

      <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Fecha de recepción</p>
              <Input
                className="mt-2"
                type="date"
                value={fechaRecepcion}
                onChange={(e) => setFechaRecepcion(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Documento de respaldo</p>
              <Input
                className="mt-2"
                placeholder="Factura, guía o recibo"
                value={factura.numero_factura}
                onChange={(e) => setFactura((s) => ({ ...s, numero_factura: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Método de pago</p>
              <Select
                className="mt-2"
                value={factura.metodo_pago}
                onChange={(e) => setFactura((s) => ({ ...s, metodo_pago: e.target.value }))}
              >
                {efectivoHabilitado && <option value="CONTADO">CONTADO</option>}
                {creditoComprasHabilitado && <option value="CREDITO">CREDITO</option>}
              </Select>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Modo de costo</p>
              <Select
                className="mt-2"
                value={modoCosto}
                onChange={(e) => setModoCosto(e.target.value)}
              >
                <option value="UNITARIO">Costo unitario</option>
                <option value="TOTAL">Costo total</option>
              </Select>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación de recepción</p>
              <Input
                className="mt-2"
                placeholder="Opcional"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
              />
            </div>
          </div>

          {ordenActual?.orden && (
            <div className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Estado compra</p>
                <div className="mt-1">
                  <StatusBadge status={resolveCompraStatus(ordenActual.orden.estado, ordenActual.orden.estado_label).badgeStatus}>
                    {ordenActual.orden.estado_label || resolveCompraStatus(ordenActual.orden.estado).label}
                  </StatusBadge>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Proveedor</p>
                <p className="mt-1 font-semibold text-[var(--color-text)]">{ordenActual.orden.proveedor_nombre || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Fecha emision</p>
                <p className="mt-1 font-semibold text-[var(--color-text)]">{ordenActual.orden.fecha_emision || ordenActual.orden.fecha}</p>
              </div>
            </div>
          )}

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Pendiente</TablaCelda>
                <TablaCelda as="th">Cantidad recibir</TablaCelda>
                <TablaCelda as="th">{modoCosto === 'TOTAL' ? 'Costo total real' : 'Costo unit real'}</TablaCelda>
                <TablaCelda as="th">Subtotal</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(ordenActual?.detalle || []).map((d) => {
                const unidad = d.unidad_medida || d.unidad;
                const pendiente = Number(d.cantidad_pendiente ?? (Number(d.cantidad) - Number(d.cantidad_recibida)));
                const qty = parseQtyByUnit(recv[d.id]?.cantidad, unidad);
                const cost = Number(String(recv[d.id]?.costo || '').replace(',', '.'));
                const safeQty = Number.isFinite(qty) ? qty : 0;
                const safeCost = Number.isFinite(cost) ? cost : 0;
                const subtotal = modoCosto === 'TOTAL' ? safeCost : safeQty * safeCost;

                return (
                  <TablaFila key={d.id}>
                    <TablaCelda>{d.producto_codigo} - {d.producto_nombre}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(pendiente, unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>
                      <Input
                        className="w-28 px-2 py-1"
                        value={recv[d.id]?.cantidad || ''}
                        onChange={(e) => setRecv((s) => ({ ...s, [d.id]: { ...s[d.id], cantidad: sanitizeQtyInput(e.target.value, unidad) } }))}
                        placeholder={unidad === 'UND' ? '0' : '0.00'}
                      />
                    </TablaCelda>
                    <TablaCelda>
                      <Input
                        className="w-28 px-2 py-1"
                        value={recv[d.id]?.costo || ''}
                        onChange={(e) => setRecv((s) => ({ ...s, [d.id]: { ...s[d.id], costo: sanitizeDecimalInput(e.target.value, 2) } }))}
                        placeholder="0.00"
                      />
                    </TablaCelda>
                    <TablaCelda>{formatMoney(subtotal)}</TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>
          <Paginador paginaActual={1} totalPaginas={1} totalRegistros={ordenActual?.detalle?.length || 0} mostrarSiempre />

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Total recepcion: {formatMoney(totalRecepcion)}</p>
            <Button disabled={recepcionBloqueada || (!efectivoHabilitado && !creditoComprasHabilitado)} onClick={onRegistrar}>
              Confirmar recepcion
            </Button>
          </div>
      </Card>
    </div>
  );
}
