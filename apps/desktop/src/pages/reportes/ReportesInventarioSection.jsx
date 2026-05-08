import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiChartBar, PiPackage, PiWarningCircle } from 'react-icons/pi';
import {
  Alert,
  EmptyState,
  Field,
  MetricTile,
  Paginador,
  Panel,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '../../shared/ui';
import { fetchCategorias, fetchProductosActivos } from '../../services/catalogoService';
import { useReportesStore } from '../../stores/reportesStore';
import ReportDateFilters from './ReportesFilters';
import { ChartPanel, HorizontalBarChart, PaymentDonutChart } from './ReportesCharts';
import { exportRowsToCsv } from './reportesExport';
import {
  createDefaultQuickFilters,
  formatCentavos,
  formatDateLabel,
  formatKardexQuantity,
  formatNumber,
  formatOrigin,
  formatQuantity,
  sanitizeDateRange
} from './reportesUtils';
import { useReportTablePagination } from './useReportTablePagination';

function normalizeMovementsData(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (rawData && Array.isArray(rawData.items)) return rawData.items;
  return [];
}

export default function ReportesInventarioSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const views = useReportesStore((state) => state.views);
  const [filters, setFilters] = useState(() => ({
    ...createDefaultQuickFilters('last7'),
    categoria_id: '',
    producto_id: '',
    estado_stock: 'todos'
  }));
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetchCategorias().then((rows) => setCategories(Array.isArray(rows) ? rows : []));
    fetchProductosActivos().then((rows) => setProducts(Array.isArray(rows) ? rows : []));
  }, []);

  const loadSection = useCallback(async (currentFilters) => {
    const range = sanitizeDateRange(currentFilters);
    await Promise.all([
      cargarReporte('inventarioActual', {}, true),
      cargarReporte('inventario', {}, true),
      cargarReporte('inventarioMovimientos', {
        ...range,
        categoria_id: currentFilters.categoria_id,
        producto_id: currentFilters.producto_id
      }, true),
      currentFilters.producto_id
        ? cargarReporte('kardex', {
          ...range,
          producto_id: currentFilters.producto_id
        }, true)
        : Promise.resolve(null)
    ]);
  }, [cargarReporte]);

  useEffect(() => {
    loadSection(filters);
  }, [filters, loadSection]);

  const loading = views.inventarioActual.loading || views.inventario.loading || views.inventarioMovimientos.loading || views.kardex.loading;
  const error = views.inventarioActual.error || views.inventario.error || views.inventarioMovimientos.error || views.kardex.error;
  const hasData = Boolean(views.inventarioActual.data || views.inventario.data || views.inventarioMovimientos.data);

  const inventorySummary = views.inventarioActual.data?.resumen || {};
  const inventoryRows = views.inventario.data?.items || [];
  const movementRows = normalizeMovementsData(views.inventarioMovimientos.data);
  const kardexRows = filters.producto_id ? (views.kardex.data?.items || []) : [];

  const filteredInventoryRows = useMemo(() => {
    return inventoryRows
      .filter((row) => {
        if (filters.categoria_id && Number(row.categoria_id || 0) !== Number(filters.categoria_id)) return false;
        if (filters.producto_id && Number(row.id || 0) !== Number(filters.producto_id)) return false;
        if (filters.estado_stock === 'bajo' && !row.bajo_minimo) return false;
        if (filters.estado_stock === 'sin' && Number(row.stock_actual || 0) > 0) return false;
        return true;
      })
      .sort((left, right) => {
        if (Boolean(left.bajo_minimo) !== Boolean(right.bajo_minimo)) return left.bajo_minimo ? -1 : 1;
        return String(left.producto || '').localeCompare(String(right.producto || ''));
      });
  }, [inventoryRows, filters.categoria_id, filters.producto_id, filters.estado_stock]);

  const criticalRows = useMemo(
    () => filteredInventoryRows.filter((row) => row.bajo_minimo),
    [filteredInventoryRows]
  );

  const outOfStockRows = useMemo(
    () => filteredInventoryRows.filter((row) => Number(row.stock_actual || 0) <= 0),
    [filteredInventoryRows]
  );

  const filteredMovementRows = useMemo(() => {
    return movementRows.filter((row) => {
      if (filters.producto_id && Number(row.producto_id || 0) !== Number(filters.producto_id)) return false;
      if (filters.categoria_id && Number(row.categoria_id || 0) !== Number(filters.categoria_id)) return false;
      return true;
    });
  }, [movementRows, filters.producto_id, filters.categoria_id]);

  const movementByType = useMemo(() => {
    const grouped = new Map();
    for (const row of filteredMovementRows) {
      const key = String(row.tipo || 'SIN_TIPO');
      grouped.set(key, Number(grouped.get(key) || 0) + 1);
    }
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredMovementRows]);

  const stockDistribution = useMemo(() => {
    const sinStock = outOfStockRows.length;
    const bajo = criticalRows.length;
    const normal = Math.max(filteredInventoryRows.length - sinStock - bajo, 0);
    return [
      { label: 'Sin stock', value: sinStock },
      { label: 'Bajo minimo', value: bajo },
      { label: 'Stock saludable', value: normal }
    ].filter((item) => item.value > 0);
  }, [criticalRows.length, filteredInventoryRows.length, outOfStockRows.length]);

  const kpis = [
    {
      label: 'Valor inventario',
      value: formatCentavos(inventorySummary.valor_total_inventario_centavos),
      icon: PiPackage
    },
    {
      label: 'Productos criticos',
      value: formatNumber(criticalRows.length),
      icon: PiWarningCircle
    },
    {
      label: 'Sin stock',
      value: formatNumber(outOfStockRows.length),
      icon: PiWarningCircle
    },
    {
      label: 'Movimientos',
      value: formatNumber(filteredMovementRows.length),
      icon: PiChartBar
    }
  ];

  const stockPagination = useReportTablePagination(filteredInventoryRows, 12);
  const criticalPagination = useReportTablePagination(criticalRows, 10);
  const movementPagination = useReportTablePagination(filteredMovementRows, 12);
  const kardexPagination = useReportTablePagination(kardexRows, 12);

  return (
    <div className="space-y-5">
      <ReportDateFilters
        filters={filters}
        setFilters={setFilters}
        loading={loading}
        submitLabel="Actualizar inventario"
        showExport
        onSubmit={(next) => loadSection(next)}
        onExport={() => {
          const rows = filteredMovementRows.map((row) => ({
            fecha: formatDateLabel(row.fecha),
            producto: `${row.producto_codigo || ''} ${row.producto_nombre || ''}`.trim(),
            tipo: row.tipo,
            cantidad: formatQuantity(row.cantidad, row.unidad_medida || row.unidad || 'UND', { fixedLB: true }),
            referencia: row.referencia || '-'
          }));
          exportRowsToCsv('reportes-inventario-movimientos.csv', [
            { key: 'fecha', label: 'Fecha' },
            { key: 'producto', label: 'Producto' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'cantidad', label: 'Cantidad' },
            { key: 'referencia', label: 'Referencia' }
          ], rows);
        }}
        extraFields={(
          <>
            <Field label="Categoria">
              <Select
                value={filters.categoria_id}
                onChange={(event) => setFilters((prev) => ({ ...prev, categoria_id: event.target.value }))}
              >
                <option value="">Todas</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.nombre}</option>
                ))}
              </Select>
            </Field>

            <Field label="Producto">
              <Select
                value={filters.producto_id}
                onChange={(event) => setFilters((prev) => ({ ...prev, producto_id: event.target.value }))}
              >
                <option value="">Todos</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.codigo} {product.nombre}</option>
                ))}
              </Select>
            </Field>

            <Field label="Estado stock">
              <Select
                value={filters.estado_stock}
                onChange={(event) => setFilters((prev) => ({ ...prev, estado_stock: event.target.value }))}
              >
                <option value="todos">Todos</option>
                <option value="bajo">Solo bajo minimo</option>
                <option value="sin">Solo sin stock</option>
              </Select>
            </Field>
          </>
        )}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      {hasData ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <MetricTile key={kpi.label} icon={kpi.icon} value={kpi.value} label={kpi.label} tone="primary" />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel title="Movimientos por tipo" subtitle="Distribucion operativa por tipo de movimiento.">
              <HorizontalBarChart data={movementByType} xType="count" label="Movimientos" />
            </ChartPanel>
            <ChartPanel title="Estado de stock" subtitle="Lectura rapida de criticidad del inventario actual.">
              <PaymentDonutChart data={stockDistribution} valueType="count" />
            </ChartPanel>
          </div>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Stock actual</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Inventario visible por producto con costo y umbral minimo.</p>
            </div>
            {filteredInventoryRows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin stock para este filtro" description="No se encontraron productos para los criterios seleccionados." />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Producto</TableCell>
                    <TableCell as="th">Categoria</TableCell>
                    <TableCell as="th">Stock actual</TableCell>
                    <TableCell as="th">Stock minimo</TableCell>
                    <TableCell as="th">Costo promedio</TableCell>
                    <TableCell as="th">Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyColSpan={6} emptyMessage="Sin inventario para filtros actuales.">
                  {stockPagination.pagedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.codigo} {row.producto}</TableCell>
                      <TableCell>{row.categoria || '-'}</TableCell>
                      <TableCell>{formatQuantity(row.stock_actual, row.unidad_medida, { fixedLB: true })}</TableCell>
                      <TableCell>{formatQuantity(row.stock_minimo, row.unidad_medida, { fixedLB: true })}</TableCell>
                      <TableCell>{formatCentavos(Math.round(Number(row.costo_promedio || 0) * 100))}</TableCell>
                      <TableCell>{row.bajo_minimo ? 'Bajo minimo' : 'Normal'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pb-4">
              <Paginador
                paginaActual={stockPagination.page}
                totalPaginas={stockPagination.totalPages}
                totalRegistros={stockPagination.totalRecords}
                mostrarSiempre
                onPageChange={stockPagination.setPage}
              />
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Productos con stock bajo</h3>
              </div>
              {criticalRows.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No existen productos con stock bajo" description="No hay alertas criticas para el corte actual." />
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell as="th">Producto</TableCell>
                      <TableCell as="th">Stock</TableCell>
                      <TableCell as="th">Minimo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody emptyColSpan={3} emptyMessage="Sin productos criticos.">
                    {criticalPagination.pagedRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.codigo} {row.producto}</TableCell>
                        <TableCell>{formatQuantity(row.stock_actual, row.unidad_medida, { fixedLB: true })}</TableCell>
                        <TableCell>{formatQuantity(row.stock_minimo, row.unidad_medida, { fixedLB: true })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                )}
                <div className="px-4 pb-4">
                  <Paginador
                    paginaActual={criticalPagination.page}
                    totalPaginas={criticalPagination.totalPages}
                    totalRegistros={criticalPagination.totalRecords}
                    mostrarSiempre
                    onPageChange={criticalPagination.setPage}
                  />
                </div>
              </Panel>

            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Movimientos de inventario</h3>
              </div>
              {filteredMovementRows.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Sin movimientos en el rango" description="No se registraron movimientos para este periodo." />
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell as="th">Fecha</TableCell>
                      <TableCell as="th">Producto</TableCell>
                      <TableCell as="th">Tipo</TableCell>
                      <TableCell as="th">Cantidad</TableCell>
                      <TableCell as="th">Referencia</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody emptyColSpan={5} emptyMessage="Sin movimientos para filtros actuales.">
                    {movementPagination.pagedRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                        <TableCell>{row.producto_codigo} {row.producto_nombre}</TableCell>
                        <TableCell>{row.tipo}</TableCell>
                        <TableCell>{formatQuantity(row.cantidad, row.unidad_medida || row.unidad || 'UND', { fixedLB: true })}</TableCell>
                        <TableCell>{row.referencia || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                )}
                <div className="px-4 pb-4">
                  <Paginador
                    paginaActual={movementPagination.page}
                    totalPaginas={movementPagination.totalPages}
                    totalRegistros={movementPagination.totalRecords}
                    mostrarSiempre
                    onPageChange={movementPagination.setPage}
                  />
                </div>
              </Panel>
          </div>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Kardex</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Trazabilidad de entradas y salidas por producto.</p>
            </div>
            {!filters.producto_id ? (
              <div className="p-4">
                <EmptyState title="Selecciona un producto para ver kardex" description="El kardex se habilita cuando eliges un producto especifico." />
              </div>
            ) : kardexRows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin kardex en el periodo" description="No hubo movimientos kardex para ese producto en el rango." />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Fecha</TableCell>
                    <TableCell as="th">Tipo</TableCell>
                    <TableCell as="th">Origen</TableCell>
                    <TableCell as="th">Cantidad</TableCell>
                    <TableCell as="th">Saldo</TableCell>
                    <TableCell as="th">Costo unitario</TableCell>
                    <TableCell as="th">Costo total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyColSpan={7} emptyMessage="Sin movimientos kardex para filtros actuales.">
                  {kardexPagination.pagedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                      <TableCell>{row.tipo_movimiento}</TableCell>
                      <TableCell>{formatOrigin(row.origen)}</TableCell>
                      <TableCell>{formatKardexQuantity(row)}</TableCell>
                      <TableCell>{formatQuantity(row.saldo_resultante, row.unidad_medida, { fixedLB: true })}</TableCell>
                      <TableCell>{formatCentavos(Math.round(Number(row.costo_unitario || 0) * 100))}</TableCell>
                      <TableCell>{formatCentavos(row.costo_total_centavos)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {filters.producto_id ? (
              <div className="px-4 pb-4">
                <Paginador
                  paginaActual={kardexPagination.page}
                  totalPaginas={kardexPagination.totalPages}
                  totalRegistros={kardexPagination.totalRecords}
                  mostrarSiempre
                  onPageChange={kardexPagination.setPage}
                />
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
