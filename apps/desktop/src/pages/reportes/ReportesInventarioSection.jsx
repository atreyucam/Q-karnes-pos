import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PiArrowsClockwise, PiChartBar, PiPackage, PiWarningCircle } from 'react-icons/pi';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
import {
  Alert,
  EmptyState,
  Field,
  Input,
  LoadingState,
  MetricTile,
  PageHeader,
  Panel,
  Select,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs
} from '../../shared/ui';
import { fetchProductosActivos } from '../../services/catalogoService';
import { useReportesStore } from '../../stores/reportesStore';
import { ChartPanel, PaymentDonutChart, VerticalBarChart } from './ReportesCharts';
import ReportesComprasSection from './ReportesComprasSection';
import ReportesDespieceSection from './ReportesDespieceSection';
import KardexReport from './KardexReport';
import {
  businessTodayString,
  formatCentavos,
  formatDateLabel,
  formatKardexQuantity,
  formatNumber,
  formatOrigin,
  formatQuantity,
  shiftDate
} from './reportesUtils';
import { INVENTORY_REPORT_TABS, resolveInventoryTab } from './reportesSections';
import { useDebouncedValue } from './useDebouncedValue';

async function fetchProveedoresOptions() {
  const response = await apiClient.get('/api/proveedores', { params: { activo: 1 } });
  return normalizeResponse(response.data) || [];
}

function defaultRange(days = 7) {
  const today = businessTodayString();
  return {
    fecha_inicio: shiftDate(today, -(days - 1)),
    fecha_fin: today
  };
}

function FilterPanel({ children }) {
  return <Panel className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</Panel>;
}

function StockTablePanel({ title, subtitle, rows, emptyTitle, emptyDescription, columns }) {
  const safeRows = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
  return (
    <Panel className="p-0">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
        <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p>
      </div>
      {safeRows.length === 0 ? (
        <div className="p-4">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.key} as="th" className={column.className}>{column.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody emptyColSpan={columns.length} emptyMessage="Sin registros para esta vista.">
            {safeRows.map((row, index) => (
              <TableRow key={row?.id || row?.producto_id || `${title}-${index}`}>
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.className}>
                    {column.render ? column.render(row) : row[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function renderEstadoStock(estado) {
  if (estado === 'SIN_STOCK') return <StatusChip tone="danger">Sin stock</StatusChip>;
  return <StatusChip tone="warning">Bajo mínimo</StatusChip>;
}

function toneBySigned(value) {
  const amount = Number(value || 0);
  if (amount > 0) return 'text-emerald-600';
  if (amount < 0) return 'text-red-600';
  return 'text-slate-500';
}

function movementTone(tipo = '', signo = 0) {
  const upper = String(tipo || '').toUpperCase();
  if (upper.includes('AJUSTE')) return 'text-amber-600';
  if (upper.includes('TRANSFORM')) return 'text-[var(--color-primary)]';
  return Number(signo || 0) >= 0 ? 'text-emerald-600' : 'text-red-600';
}

function formatSignedInventoryQuantity(row) {
  const qty = Number(row.cantidad || 0);
  const sign = Number(row.signo || 0);
  const absQty = Math.abs(qty);
  const unit = row.unidad_medida || row.unidad || 'UND';
  const baseValue = formatQuantity(absQty, unit, { fixedLB: true });
  if (sign > 0) return `+${baseValue}`;
  if (sign < 0) return `-${baseValue}`;
  return baseValue;
}

function normalizeCompraEstado(estado = '') {
  const normalized = String(estado || '').trim().toUpperCase();
  if (normalized === 'CERRADA') return 'COMPLETA';
  if (normalized === 'RECIBIDA') return 'PARCIAL';
  return normalized || 'ABIERTA';
}

function compraEstadoTone(estado = '') {
  const normalized = normalizeCompraEstado(estado);
  if (normalized === 'COMPLETA') return 'success';
  if (normalized === 'PARCIAL' || normalized === 'CERRADA_PARCIAL') return 'warning';
  if (normalized === 'CANCELADA') return 'neutral';
  return 'info';
}

function despieceEstadoTone(estado = '') {
  const normalized = String(estado || '').toUpperCase();
  if (normalized === 'APLICADA') return 'success';
  if (normalized === 'ANULADA') return 'danger';
  return 'warning';
}

export default function ReportesInventarioSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const views = useReportesStore((state) => state.views);
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const rawTab = String(searchParams.get('tab') || 'stock').trim().toLowerCase();
  const currentTab = resolveInventoryTab(rawTab);

  useEffect(() => {
    if (rawTab !== currentTab) {
      setSearchParams({ tab: currentTab }, { replace: true });
    }
  }, [currentTab, rawTab, setSearchParams]);

  const [movimientosFilters, setMovimientosFilters] = useState(() => ({
    fecha_inicio: '',
    fecha_fin: '',
    tipo: '',
    producto_id: ''
  }));
  const [comprasFilters, setComprasFilters] = useState(() => ({
    fecha_inicio: '',
    fecha_fin: '',
    proveedor_id: '',
    estado: ''
  }));
  const [despieceFilters, setDespieceFilters] = useState(() => ({
    fecha_inicio: '',
    fecha_fin: '',
    estado: '',
    producto_padre_id: ''
  }));
  const [kardexFilters, setKardexFilters] = useState(() => ({
    ...defaultRange(30),
    producto_id: ''
  }));

  const debouncedMovimientos = useDebouncedValue(movimientosFilters, 280);
  const debouncedCompras = useDebouncedValue(comprasFilters, 280);
  const debouncedDespiece = useDebouncedValue(despieceFilters, 280);
  const debouncedKardex = useDebouncedValue(kardexFilters, 280);

  useEffect(() => {
    fetchProductosActivos()
      .then((rows) => setProducts(Array.isArray(rows) ? rows : []))
      .catch(() => setProducts([]));
    fetchProveedoresOptions()
      .then((rows) => setProveedores(Array.isArray(rows) ? rows : []))
      .catch(() => setProveedores([]));
  }, []);

  useEffect(() => {
    if (currentTab === 'stock') {
      cargarReporte('inventarioPanel', defaultRange(30));
    }
    if (currentTab === 'movimientos') {
      cargarReporte('inventarioMovimientos', debouncedMovimientos);
    }
    if (currentTab === 'compras') {
      cargarReporte('compras', debouncedCompras);
      cargarReporte('comprasProductos', debouncedCompras);
    }
    if (currentTab === 'despiece') {
      cargarReporte('transformaciones', debouncedDespiece);
      cargarReporte('transformacionesResumen', debouncedDespiece);
    }
    if (currentTab === 'kardex' && debouncedKardex.producto_id) {
      cargarReporte('kardex', debouncedKardex);
    }
  }, [cargarReporte, currentTab, debouncedCompras, debouncedDespiece, debouncedKardex, debouncedMovimientos]);

  const activeLoading = {
    stock: views.inventarioPanel.loading,
    movimientos: views.inventarioMovimientos.loading,
    compras: views.compras.loading || views.comprasProductos.loading,
    despiece: views.transformaciones.loading || views.transformacionesResumen.loading,
    kardex: views.kardex.loading
  }[currentTab];

  const activeError = {
    stock: views.inventarioPanel.error,
    movimientos: views.inventarioMovimientos.error,
    compras: views.compras.error || views.comprasProductos.error,
    despiece: views.transformaciones.error || views.transformacionesResumen.error,
    kardex: views.kardex.error
  }[currentTab];

  const stockData = views.inventarioPanel.data;
  const movementsData = Array.isArray(views.inventarioMovimientos.data?.items)
    ? views.inventarioMovimientos.data.items.filter((row) => row && typeof row === 'object')
    : [];
  const comprasData = views.compras.data;
  const comprasProductosData = views.comprasProductos.data;
  const despieceData = views.transformaciones.data;
  const despieceResumen = Array.isArray(views.transformacionesResumen.data)
    ? views.transformacionesResumen.data.filter((row) => row && typeof row === 'object')
    : [];
  const kardexData = Array.isArray(views.kardex.data?.items)
    ? views.kardex.data.items.filter((row) => row && typeof row === 'object')
    : [];

  const stockResumen = stockData?.resumen || {};
  const stockGraficos = stockData?.graficos || {};
  const stockTablas = stockData?.tablas || {};

  const stockKpis = [
    { label: 'Valorización total', value: formatCentavos(stockResumen.valorizacion_total_centavos), icon: PiPackage },
    { label: 'Productos bajo mínimo', value: formatNumber(stockResumen.productos_bajo_minimo), icon: PiWarningCircle, toneClass: Number(stockResumen.productos_bajo_minimo || 0) > 0 ? 'text-amber-600' : 'text-slate-500' },
    { label: 'Inconsistencias de stock', value: formatNumber(stockResumen.inconsistencias_stock), icon: PiWarningCircle, toneClass: Number(stockResumen.inconsistencias_stock || 0) > 0 ? 'text-red-600' : 'text-slate-500' },
    { label: 'Sin movimiento 30 días', value: formatNumber(stockResumen.productos_sin_movimiento_30_dias), icon: PiArrowsClockwise, toneClass: Number(stockResumen.productos_sin_movimiento_30_dias || 0) > 0 ? 'text-amber-600' : 'text-slate-500' }
  ];

  const stockStateData = useMemo(() => (
    (stockGraficos.estado_stock || []).map((row) => ({ label: row.estado, value: row.cantidad }))
  ), [stockGraficos.estado_stock]);

  const valuationCategoryData = useMemo(() => (
    (stockGraficos.valorizacion_por_categoria || []).map((row) => ({
      label: row.categoria,
      value: Number(row.total_centavos || 0)
    }))
  ), [stockGraficos.valorizacion_por_categoria]);

  const comprasResumen = comprasData?.resumen || {};
  const comprasRows = Array.isArray(comprasData?.items)
    ? comprasData.items.filter((row) => row && typeof row === 'object')
    : [];
  const comprasProductosRows = Array.isArray(comprasProductosData?.items)
    ? comprasProductosData.items.filter((row) => row && typeof row === 'object')
    : [];
  const comprasByProveedorChart = useMemo(() => {
    const grouped = new Map();
    for (const row of comprasRows) {
      grouped.set(row.proveedor, Number(grouped.get(row.proveedor) || 0) + Math.round(Number(row.total_compra || 0) * 100));
    }
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 8);
  }, [comprasRows]);

  const despieceRows = Array.isArray(despieceData?.items)
    ? despieceData.items.filter((row) => row && typeof row === 'object')
    : [];
  const movimientosKpis = useMemo(() => {
    const entradas = movementsData.reduce((acc, row) => (Number(row.signo || 0) > 0 ? acc + Math.abs(Number(row.cantidad || 0)) : acc), 0);
    const salidas = movementsData.reduce((acc, row) => (Number(row.signo || 0) < 0 ? acc + Math.abs(Number(row.cantidad || 0)) : acc), 0);
    const ajustes = movementsData.filter((row) => String(row.tipo || '').toUpperCase().includes('AJUSTE')).length;
    return [
      { label: 'Entradas del período', value: formatNumber(entradas), toneClass: 'text-emerald-600', icon: PiPackage },
      { label: 'Salidas del período', value: formatNumber(salidas), toneClass: 'text-red-600', icon: PiWarningCircle },
      { label: 'Ajustes', value: formatNumber(ajustes), toneClass: ajustes > 0 ? 'text-amber-600' : 'text-slate-500', icon: PiArrowsClockwise },
      { label: 'Movimientos totales', value: formatNumber(movementsData.length), icon: PiChartBar }
    ];
  }, [movementsData]);

  const comprasDecoradas = useMemo(() => (
    comprasRows.map((row) => {
      const estado = normalizeCompraEstado(row.estado);
      const totalCentavos = Math.round(Number(row.total_compra || 0) * 100);
      const pendienteCentavos = ['ABIERTA', 'PARCIAL', 'CERRADA_PARCIAL'].includes(estado) ? totalCentavos : 0;
      return {
        ...row,
        estado_normalizado: estado,
        total_centavos: totalCentavos,
        pendiente_centavos: pendienteCentavos
      };
    })
  ), [comprasRows]);

  const comprasKpis = useMemo(() => {
    const facturasPendientes = comprasDecoradas.filter((row) => row.pendiente_centavos > 0).length;
    const proveedoresPendientes = new Set(comprasDecoradas.filter((row) => row.pendiente_centavos > 0).map((row) => row.proveedor_id).filter(Boolean)).size;
    const productosRecibidos = comprasProductosRows.reduce((acc, row) => acc + Number(row.cantidad_comprada || 0), 0);
    return [
      { label: 'Total comprado', value: formatCentavos(Math.round(Number(comprasResumen.total_compras || 0) * 100)), icon: PiPackage },
      { label: 'Facturas pendientes', value: formatNumber(facturasPendientes), icon: PiChartBar, toneClass: facturasPendientes > 0 ? 'text-amber-600' : 'text-slate-500' },
      { label: 'Proveedores pendientes', value: formatNumber(proveedoresPendientes), icon: PiPackage, toneClass: proveedoresPendientes > 0 ? 'text-amber-600' : 'text-slate-500' },
      { label: 'Productos recibidos', value: formatNumber(productosRecibidos), icon: PiArrowsClockwise, toneClass: productosRecibidos > 0 ? 'text-emerald-600' : 'text-slate-500' }
    ];
  }, [comprasDecoradas, comprasProductosRows, comprasResumen.total_compras]);

  const despieceKpis = useMemo(() => {
    const aplicadas = despieceRows.filter((row) => String(row.estado || '').toUpperCase() === 'APLICADA');
    const kgProcesados = aplicadas.reduce((acc, row) => acc + Number(row.producto_padre?.cantidad || 0), 0);
    const mermaTotal = despieceRows.reduce((acc, row) => acc + Number(row.merma_total || 0), 0);
    const valorGeneradoCentavos = aplicadas.reduce((acc, row) => acc + Number(row.costo_total_distribuido_centavos || 0), 0);
    return [
      { label: 'Transformaciones aplicadas', value: formatNumber(aplicadas.length), icon: PiPackage, toneClass: aplicadas.length > 0 ? 'text-emerald-600' : 'text-slate-500' },
      { label: 'KG procesados', value: `${formatNumber(kgProcesados)} KG`, icon: PiArrowsClockwise },
      { label: 'Merma total', value: `${formatNumber(mermaTotal)} LB`, icon: PiWarningCircle, toneClass: mermaTotal > 0 ? 'text-amber-600' : 'text-slate-500' },
      { label: 'Valor generado', value: formatCentavos(valorGeneradoCentavos), icon: PiChartBar, toneClass: valorGeneradoCentavos > 0 ? 'text-emerald-600' : 'text-slate-500' }
    ];
  }, [despieceRows]);

  const despieceSeries = useMemo(() => (
    despieceResumen.map((row) => ({
      label: row.fecha,
      value: Number(row.rendimiento_promedio || row.rendimiento || 0)
    }))
  ), [despieceResumen]);

  const kardexKpis = useMemo(() => {
    if (!kardexFilters.producto_id) return [];
    const entradas = kardexData.reduce((acc, row) => (Number(row.signo || 0) > 0 ? acc + Math.abs(Number(row.cantidad || 0)) : acc), 0);
    const salidas = kardexData.reduce((acc, row) => (Number(row.signo || 0) < 0 ? acc + Math.abs(Number(row.cantidad || 0)) : acc), 0);
    const last = kardexData[kardexData.length - 1];
    const saldoActual = last ? formatQuantity(last.saldo_resultante, last.unidad_medida, { fixedLB: true }) : '-';

    const weighted = kardexData.reduce((acc, row) => {
      if (Number(row.signo || 0) <= 0) return acc;
      const qty = Math.abs(Number(row.cantidad || 0));
      const totalCentavos = Number(row.costo_total_centavos || 0);
      return {
        qty: acc.qty + qty,
        total: acc.total + totalCentavos
      };
    }, { qty: 0, total: 0 });
    const costoPromedioCentavos = weighted.qty > 0 ? Math.round(weighted.total / weighted.qty) : 0;

    return [
      { label: 'Entradas', value: formatNumber(entradas), icon: PiPackage, toneClass: entradas > 0 ? 'text-emerald-600' : 'text-slate-500' },
      { label: 'Salidas', value: formatNumber(salidas), icon: PiWarningCircle, toneClass: salidas > 0 ? 'text-red-600' : 'text-slate-500' },
      { label: 'Saldo actual', value: saldoActual, icon: PiArrowsClockwise },
      { label: 'Costo promedio', value: formatCentavos(costoPromedioCentavos), icon: PiChartBar }
    ];
  }, [kardexData, kardexFilters.producto_id]);

  if (activeLoading && currentTab === 'stock' && !stockData) {
    return <LoadingState label="Construyendo reporte de inventario..." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario"
        description="Stock, valorización y movimientos"
      />

      <Panel className="space-y-4 p-4">
        <Tabs
          className="reportes-tabs-secondary"
          ariaLabel="Secciones secundarias de inventario"
          items={INVENTORY_REPORT_TABS}
          value={currentTab}
          onChange={(nextTab) => setSearchParams({ tab: nextTab })}
        />
      </Panel>

      {activeError ? <Alert tone="error">{activeError}</Alert> : null}

      {(() => {
        switch (currentTab) {
          case 'stock':
            return (
              <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {stockKpis.map((kpi) => (
              <div key={kpi.label} className="rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <MetricTile icon={kpi.icon} value={kpi.value} label={kpi.label} tone="primary" className="border-0 bg-transparent px-0 py-0" />
                {kpi.toneClass ? <p className={`mt-2 text-sm font-semibold ${kpi.toneClass}`}>{kpi.value}</p> : null}
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel title="Estado de stock" subtitle="Lectura compacta del estado operativo actual.">
              <PaymentDonutChart data={stockStateData} valueType="count" />
            </ChartPanel>
            <ChartPanel title="Valorización por categoría" subtitle="Solo las categorías con mayor peso actual.">
              <VerticalBarChart data={valuationCategoryData} label="Valorización" />
            </ChartPanel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <StockTablePanel
              title="Productos críticos"
              subtitle="Productos bajo mínimo o sin stock."
              rows={stockTablas.productos_criticos || []}
              emptyTitle="Sin productos críticos"
              emptyDescription="No hay productos bajo mínimo en este momento."
              columns={[
                { key: 'producto', label: 'Producto', render: (row) => `${row.codigo} ${row.producto}` },
                { key: 'stock_actual', label: 'Stock', render: (row) => `${formatNumber(row.stock_actual)} ${row.unidad_medida}` },
                { key: 'stock_minimo', label: 'Mínimo', render: (row) => `${formatNumber(row.stock_minimo)} ${row.unidad_medida}` },
                { key: 'estado', label: 'Estado', render: (row) => renderEstadoStock(row.estado) }
              ]}
            />

            <StockTablePanel
              title="Inconsistencias de stock"
              subtitle="Diferencias entre esperado y registrado."
              rows={stockTablas.inconsistencias_stock || []}
              emptyTitle="Sin inconsistencias"
              emptyDescription="No hay diferencias detectadas en stock."
              columns={[
                { key: 'producto', label: 'Producto', render: (row) => `${row.codigo} ${row.producto}` },
                { key: 'stock_esperado', label: 'Esperado', render: (row) => `${formatNumber(row.stock_esperado)} ${row.unidad_medida}` },
                { key: 'stock_registrado', label: 'Registrado', render: (row) => `${formatNumber(row.stock_registrado)} ${row.unidad_medida}` },
                { key: 'diferencia', label: 'Diferencia', render: (row) => `${formatNumber(row.diferencia)} ${row.unidad_medida}` }
              ]}
            />
          </div>

          <StockTablePanel
            title="Movimientos recientes"
            subtitle="Últimos movimientos útiles para revisar el estado actual."
            rows={stockTablas.movimientos_recientes || []}
            emptyTitle="Sin movimientos recientes"
            emptyDescription="No hubo movimientos recientes para mostrar."
            columns={[
              { key: 'fecha', label: 'Fecha', render: (row) => formatDateLabel(row.fecha) },
              { key: 'producto', label: 'Producto', render: (row) => `${row.codigo} ${row.producto}` },
              { key: 'tipo', label: 'Tipo' },
              { key: 'cantidad', label: 'Cantidad', render: (row) => `${formatNumber(row.cantidad)} ${row.unidad_medida}` }
            ]}
          />
              </>
            );
          case 'movimientos':
            return (
              <>
          <FilterPanel>
            <Field label="Fecha inicio">
              <Input type="date" value={movimientosFilters.fecha_inicio} onChange={(event) => setMovimientosFilters((prev) => ({ ...prev, fecha_inicio: event.target.value }))} />
            </Field>
            <Field label="Fecha fin">
              <Input type="date" value={movimientosFilters.fecha_fin} onChange={(event) => setMovimientosFilters((prev) => ({ ...prev, fecha_fin: event.target.value }))} />
            </Field>
            <Field label="Tipo">
              <Select value={movimientosFilters.tipo} onChange={(event) => setMovimientosFilters((prev) => ({ ...prev, tipo: event.target.value }))}>
                <option value="">Todos</option>
                <option value="AJUSTE">Ajuste</option>
                <option value="VENTA">Venta</option>
                <option value="COMPRA">Compra</option>
                <option value="TRANSFORMACION">Transformación</option>
              </Select>
            </Field>
            <Field label="Producto">
              <Select value={movimientosFilters.producto_id} onChange={(event) => setMovimientosFilters((prev) => ({ ...prev, producto_id: event.target.value }))}>
                <option value="">Todos</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.codigo} {product.nombre}</option>
                ))}
              </Select>
            </Field>
          </FilterPanel>

          <StockTablePanel
            title="Movimientos"
            subtitle="Fecha, producto, tipo, cantidad, referencia y usuario."
            rows={movementsData}
            emptyTitle="No hay movimientos de inventario en este período."
            emptyDescription="Ajusta el rango o el tipo de movimiento para ampliar resultados."
            columns={[
              { key: 'fecha', label: 'Fecha', render: (row) => formatDateLabel(row.fecha) },
              { key: 'producto', label: 'Producto', render: (row) => `${row.producto_codigo} ${row.producto_nombre}` },
              { key: 'tipo', label: 'Tipo', render: (row) => <span className={movementTone(row.tipo, row.signo)}>{row.tipo}</span> },
              {
                key: 'cantidad',
                label: 'Cantidad',
                render: (row) => <span className={`font-semibold ${movementTone(row.tipo, row.signo)}`}>{formatSignedInventoryQuantity(row)}</span>
              },
              { key: 'unidad', label: 'Unidad', render: (row) => (row.unidad_medida || row.unidad || 'UND') },
              {
                key: 'referencia',
                label: 'Referencia',
                render: (row) => {
                  if (!row.referencia) return '-';
                  if (!row.origen_id) return row.referencia;
                  const upper = String(row.tipo || '').toUpperCase();
                  const href = upper.includes('VENTA')
                    ? `/ventas/${row.origen_id}`
                    : upper.includes('COMPRA')
                      ? `/compras/ordenes/${row.origen_id}`
                      : upper.includes('TRANSFORM')
                        ? `/transformaciones/${row.origen_id}`
                        : null;
                  if (!href) return row.referencia;
                  return <Link className="text-[var(--color-primary)] underline decoration-[1.5px]" to={href}>{row.referencia}</Link>;
                }
              },
              { key: 'usuario_id', label: 'Usuario', render: (row) => row.usuario_nombre || row.usuario || '-' }
            ]}
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {movimientosKpis.map((kpi) => (
              <div key={kpi.label} className="rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <MetricTile icon={kpi.icon} value={kpi.value} label={kpi.label} tone="primary" className="border-0 bg-transparent px-0 py-0" />
                {kpi.toneClass ? <p className={`mt-2 text-sm font-semibold ${kpi.toneClass}`}>{kpi.value}</p> : null}
              </div>
            ))}
          </div>
              </>
            );
          case 'compras':
            return <ReportesComprasSection />;
          case 'despiece':
            return <ReportesDespieceSection />;
          case 'kardex':
            return <KardexReport />;
          default:
            return (
              <Panel>
                <EmptyState
                  title="Tab de inventario no disponible"
                  description="Selecciona una sección válida para continuar."
                />
              </Panel>
            );
        }
      })()}

      {activeLoading ? <div className="text-sm text-[var(--color-text-muted)]">Actualizando {currentTab}...</div> : null}
    </div>
  );
}
