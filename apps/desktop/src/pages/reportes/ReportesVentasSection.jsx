import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiCashRegister, PiChartBar, PiPercent, PiReceipt, PiUsersThree, PiWallet } from 'react-icons/pi';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
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
import { ChartPanel, HorizontalBarChart, PaymentDonutChart, SalesLineChart } from './ReportesCharts';
import { exportRowsToCsv } from './reportesExport';
import {
  createDefaultQuickFilters,
  formatCentavos,
  formatDateLabel,
  formatDateOnly,
  formatNumber,
  formatPercent,
  formatSignedCentavos,
  sanitizeDateRange,
  shiftDate
} from './reportesUtils';
import { useReportTablePagination } from './useReportTablePagination';

function sum(rows, field) {
  return rows.reduce((acc, row) => acc + Number(row[field] || 0), 0);
}

function paymentLabel(code = '') {
  const normalized = String(code || '').trim().toUpperCase();
  if (normalized === 'CREDITO_CLIENTE') return 'Crédito cliente';
  if (normalized === 'CONTADO') return 'Contado';
  if (normalized === 'EFECTIVO') return 'Efectivo';
  if (normalized === 'TRANSFERENCIA') return 'Transferencia';
  if (normalized === 'TARJETA') return 'Tarjeta';
  return normalized || 'Sin método';
}

export default function ReportesVentasSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const views = useReportesStore((state) => state.views);
  const [filters, setFilters] = useState(() => ({
    ...createDefaultQuickFilters('last7'),
    producto_id: '',
    categoria_id: '',
    metodo_pago: '',
    usuario_id: ''
  }));
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [compareFilters, setCompareFilters] = useState(() => {
    const today = createDefaultQuickFilters('today').fecha_fin;
    return {
      fecha_a: today,
      fecha_b: shiftDate(today, -1)
    };
  });

  useEffect(() => {
    fetchCategorias().then((rows) => setCategories(Array.isArray(rows) ? rows : []));
    fetchProductosActivos().then((rows) => setProducts(Array.isArray(rows) ? rows : []));
  }, []);

  const loadSection = useCallback(async (currentFilters) => {
    const range = sanitizeDateRange(currentFilters);
    await Promise.all([
      cargarReporte('ventasPeriodo', range, true),
      cargarReporte('ventasDiarias', range, true),
      cargarReporte('ventasPorProducto', {
        ...range,
        producto_id: currentFilters.producto_id,
        categoria_id: currentFilters.categoria_id
      }, true)
    ]);
  }, [cargarReporte]);

  useEffect(() => {
    loadSection(filters);
  }, [loadSection, filters]);

  const loading = views.ventasPeriodo.loading || views.ventasDiarias.loading || views.ventasPorProducto.loading;
  const error = views.ventasPeriodo.error || views.ventasDiarias.error || views.ventasPorProducto.error;
  const hasData = Boolean(views.ventasPeriodo.data || views.ventasPorProducto.data);

  const ventasRows = views.ventasPeriodo.data?.ventas || [];
  const productsRows = views.ventasPorProducto.data?.items || [];

  const filteredSales = useMemo(() => {
    return ventasRows.filter((row) => {
      if (filters.metodo_pago && String(row.metodo_pago_codigo || '').toUpperCase() !== filters.metodo_pago) return false;
      if (filters.usuario_id && Number(row.usuario_id || 0) !== Number(filters.usuario_id)) return false;
      return true;
    });
  }, [filters.metodo_pago, filters.usuario_id, ventasRows]);

  const salesSummary = useMemo(() => {
    const total = sum(filteredSales, 'total_ventas_centavos');
    const cost = sum(filteredSales, 'total_costo_centavos');
    const utilidad = sum(filteredSales, 'utilidad_centavos');
    const cantidad = filteredSales.length;
    return {
      total_ventas_centavos: total,
      total_costo_centavos: cost,
      utilidad_centavos: utilidad,
      numero_ventas: cantidad,
      ticket_promedio_centavos: cantidad > 0 ? Math.round(total / cantidad) : 0,
      margen_porcentaje: total > 0 ? Number(((utilidad / total) * 100).toFixed(2)) : 0
    };
  }, [filteredSales]);

  const salesDaily = (views.ventasDiarias.data || []).map((row) => ({
    label: formatDateOnly(row.fecha),
    value: Math.round(Number(row.total || 0) * 100)
  }));

  const topProducts = productsRows.slice(0, 10).map((row) => ({
    label: `${row.codigo} ${row.nombre}`.slice(0, 26),
    value: Number(row.ingreso_total_centavos || 0)
  }));

  const paymentRows = useMemo(() => {
    const grouped = new Map();
    for (const row of filteredSales) {
      const key = paymentLabel(row.metodo_pago_codigo);
      grouped.set(key, Number(grouped.get(key) || 0) + Number(row.total_ventas_centavos || 0));
    }
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredSales]);

  const userRows = useMemo(() => {
    const grouped = new Map();
    for (const row of filteredSales) {
      const key = row.usuario || 'Sin usuario';
      const current = grouped.get(key) || { label: key, value: 0, ventas: 0 };
      current.value += Number(row.total_ventas_centavos || 0);
      current.ventas += 1;
      grouped.set(key, current);
    }
    return Array.from(grouped.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredSales]);

  const userOptions = useMemo(() => {
    const map = new Map();
    for (const row of ventasRows) {
      const key = Number(row.usuario_id || 0);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, row.usuario || `Usuario ${key}`);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [ventasRows]);

  const salesPagination = useReportTablePagination(filteredSales, 12);
  const productsPagination = useReportTablePagination(productsRows, 12);

  const kpis = [
    { label: 'Ventas netas', value: formatCentavos(salesSummary.total_ventas_centavos), icon: PiCashRegister },
    { label: 'Cantidad de ventas', value: formatNumber(salesSummary.numero_ventas), icon: PiReceipt },
    { label: 'Ticket promedio', value: formatCentavos(salesSummary.ticket_promedio_centavos), icon: PiCashRegister },
    { label: 'Costo', value: formatCentavos(salesSummary.total_costo_centavos), icon: PiWallet },
    { label: 'Utilidad', value: formatCentavos(salesSummary.utilidad_centavos), icon: PiChartBar },
    { label: 'Margen %', value: formatPercent(salesSummary.margen_porcentaje), icon: PiPercent }
  ];

  const compareDays = async () => {
    const [left, right] = await Promise.all([
      cargarReporte('ventasDia', { fecha: compareFilters.fecha_a }, true),
      cargarReporte('ventasDia', { fecha: compareFilters.fecha_b }, true)
    ]);
    const leftSummary = left?.resumen || {};
    const rightSummary = right?.resumen || {};
    setComparison({
      left: compareFilters.fecha_a,
      right: compareFilters.fecha_b,
      ventas: Number(leftSummary.total_ventas_centavos || 0) - Number(rightSummary.total_ventas_centavos || 0),
      utilidad: Number(leftSummary.utilidad_centavos || 0) - Number(rightSummary.utilidad_centavos || 0),
      numero_ventas: Number(leftSummary.numero_ventas || 0) - Number(rightSummary.numero_ventas || 0),
      ticket: Number(leftSummary.ticket_promedio_centavos || 0) - Number(rightSummary.ticket_promedio_centavos || 0)
    });
  };

  return (
    <div className="space-y-5">
      <ReportDateFilters
        filters={filters}
        setFilters={setFilters}
        loading={loading}
        submitLabel="Actualizar ventas"
        showExport
        onSubmit={(next) => loadSection(next)}
        onExport={() => {
          const csvRows = filteredSales.map((row) => ({
            fecha: formatDateLabel(row.fecha),
            referencia: row.referencia,
            usuario: row.usuario,
            metodo: paymentLabel(row.metodo_pago_codigo),
            total: formatCentavos(row.total_ventas_centavos),
            costo: formatCentavos(row.total_costo_centavos),
            utilidad: formatCentavos(row.utilidad_centavos),
            margen: formatPercent(row.margen_porcentaje)
          }));
          exportRowsToCsv('reportes-ventas-detalle.csv', [
            { key: 'fecha', label: 'Fecha' },
            { key: 'referencia', label: 'Referencia' },
            { key: 'usuario', label: 'Usuario' },
            { key: 'metodo', label: 'Método' },
            { key: 'total', label: 'Total' },
            { key: 'costo', label: 'Costo' },
            { key: 'utilidad', label: 'Utilidad' },
            { key: 'margen', label: 'Margen' }
          ], csvRows);
        }}
        extraFields={(
          <>
            <Field label="Categoría">
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

            <Field label="Método de pago">
              <Select
                value={filters.metodo_pago}
                onChange={(event) => setFilters((prev) => ({ ...prev, metodo_pago: event.target.value }))}
              >
                <option value="">Todos</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="CONTADO">Contado</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="CREDITO_CLIENTE">Crédito cliente</option>
              </Select>
            </Field>

            <Field label="Usuario">
              <Select
                value={filters.usuario_id}
                onChange={(event) => setFilters((prev) => ({ ...prev, usuario_id: event.target.value }))}
              >
                <option value="">Todos</option>
                {userOptions.map((user) => (
                  <option key={user.value} value={user.value}>{user.label}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading && !hasData ? <Alert tone="info">Consultando información de ventas...</Alert> : null}

      {hasData ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {kpis.map((kpi) => (
              <MetricTile key={kpi.label} icon={kpi.icon} value={kpi.value} label={kpi.label} tone="primary" />
            ))}
          </div>

          <Panel className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Comparar día A">
                <Input
                  type="date"
                  value={compareFilters.fecha_a}
                  onChange={(event) => setCompareFilters((prev) => ({ ...prev, fecha_a: event.target.value }))}
                />
              </Field>
              <Field label="Comparar día B">
                <Input
                  type="date"
                  value={compareFilters.fecha_b}
                  onChange={(event) => setCompareFilters((prev) => ({ ...prev, fecha_b: event.target.value }))}
                />
              </Field>
              <Button variant="secondary" onClick={compareDays}>Comparar</Button>
            </div>
            {comparison ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile icon={PiCashRegister} value={formatSignedCentavos(comparison.ventas)} label={`Ventas ${comparison.left} vs ${comparison.right}`} tone="info" />
                <MetricTile icon={PiChartBar} value={formatSignedCentavos(comparison.utilidad)} label="Utilidad (delta)" tone="info" />
                <MetricTile icon={PiReceipt} value={comparison.numero_ventas >= 0 ? `+${comparison.numero_ventas}` : `${comparison.numero_ventas}`} label="Ventas (delta)" tone="info" />
                <MetricTile icon={PiCashRegister} value={formatSignedCentavos(comparison.ticket)} label="Ticket promedio (delta)" tone="info" />
              </div>
            ) : null}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel title="Ventas por fecha" subtitle="Comportamiento del periodo seleccionado.">
              <SalesLineChart data={salesDaily} />
            </ChartPanel>
            <ChartPanel title="Ventas por método de pago" subtitle="Distribución de ventas netas por método.">
              <PaymentDonutChart data={paymentRows} />
            </ChartPanel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel title="Top productos" subtitle="Productos con mayor ingreso en el rango.">
              <HorizontalBarChart data={topProducts} />
            </ChartPanel>
            <ChartPanel title="Ventas por usuario" subtitle="Rendimiento de venta por usuario dentro del rango.">
              <HorizontalBarChart data={userRows} xType="money" label="Ventas" />
            </ChartPanel>
          </div>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Detalle de ventas del rango</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Listado operacional para auditoría diaria y control comercial.</p>
            </div>
            {filteredSales.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No hubo ventas en este periodo" description="Ajusta filtros para revisar más operaciones." />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Fecha</TableCell>
                    <TableCell as="th">Referencia</TableCell>
                    <TableCell as="th">Usuario</TableCell>
                    <TableCell as="th">Método</TableCell>
                    <TableCell as="th">Total</TableCell>
                    <TableCell as="th">Costo</TableCell>
                    <TableCell as="th">Utilidad</TableCell>
                    <TableCell as="th">Margen</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyMessage="Sin ventas para los filtros actuales." emptyColSpan={8}>
                  {salesPagination.pagedRows.map((row) => (
                    <TableRow key={row.venta_id}>
                      <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                      <TableCell>{row.referencia}</TableCell>
                      <TableCell>{row.usuario}</TableCell>
                      <TableCell>{paymentLabel(row.metodo_pago_codigo)}</TableCell>
                      <TableCell>{formatCentavos(row.total_ventas_centavos)}</TableCell>
                      <TableCell>{formatCentavos(row.total_costo_centavos)}</TableCell>
                      <TableCell>{formatCentavos(row.utilidad_centavos)}</TableCell>
                      <TableCell>{formatPercent(row.margen_porcentaje)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pb-4">
              <Paginador
                paginaActual={salesPagination.page}
                totalPaginas={salesPagination.totalPages}
                totalRegistros={salesPagination.totalRecords}
                mostrarSiempre
                onPageChange={salesPagination.setPage}
              />
            </div>
          </Panel>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Productos vendidos</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Volumen, ingresos, costo y rentabilidad por producto.</p>
            </div>
            {productsRows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin productos vendidos" description="No se registraron ventas por producto para este rango." />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Producto</TableCell>
                    <TableCell as="th">Categoría</TableCell>
                    <TableCell as="th">Cantidad</TableCell>
                    <TableCell as="th">Ingreso</TableCell>
                    <TableCell as="th">Costo</TableCell>
                    <TableCell as="th">Utilidad</TableCell>
                    <TableCell as="th">Margen</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyMessage="Sin productos para filtros actuales." emptyColSpan={7}>
                  {productsPagination.pagedRows.map((row) => (
                    <TableRow key={row.producto_id}>
                      <TableCell>{row.codigo} {row.nombre}</TableCell>
                      <TableCell>{row.categoria || '-'}</TableCell>
                      <TableCell>{formatNumber(row.cantidad_vendida)} {row.unidad_medida}</TableCell>
                      <TableCell>{formatCentavos(row.ingreso_total_centavos)}</TableCell>
                      <TableCell>{formatCentavos(row.costo_total_centavos)}</TableCell>
                      <TableCell>{formatCentavos(row.utilidad_centavos)}</TableCell>
                      <TableCell>{formatPercent(row.margen_porcentaje)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pb-4">
              <Paginador
                paginaActual={productsPagination.page}
                totalPaginas={productsPagination.totalPages}
                totalRegistros={productsPagination.totalRecords}
                mostrarSiempre
                onPageChange={productsPagination.setPage}
              />
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
