import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiCashRegister, PiPackage, PiReceipt, PiStorefront } from 'react-icons/pi';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
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
import { useReportesStore } from '../../stores/reportesStore';
import ReportDateFilters from './ReportesFilters';
import { ChartPanel, HorizontalBarChart, SalesLineChart } from './ReportesCharts';
import { exportRowsToCsv } from './reportesExport';
import {
  createDefaultQuickFilters,
  formatCentavos,
  formatDateLabel,
  formatDateOnly,
  formatNumber,
  formatQuantity,
  sanitizeDateRange
} from './reportesUtils';
import { useReportTablePagination } from './useReportTablePagination';

function mapCompraMetodo(code = '') {
  const normalized = String(code || '').trim().toUpperCase();
  if (normalized === 'CREDITO') return 'Credito';
  if (normalized === 'CONTADO') return 'Contado';
  if (normalized === 'TRANSFERENCIA') return 'Transferencia';
  if (normalized === 'TARJETA') return 'Tarjeta';
  return normalized || 'Sin metodo';
}

async function fetchProveedoresOptions() {
  const response = await apiClient.get('/api/proveedores', { params: { activo: 1 } });
  return normalizeResponse(response.data) || [];
}

export default function ReportesComprasSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const views = useReportesStore((state) => state.views);
  const [filters, setFilters] = useState(() => ({
    ...createDefaultQuickFilters('last30'),
    proveedor_id: '',
    metodo_pago: ''
  }));
  const [proveedores, setProveedores] = useState([]);

  useEffect(() => {
    fetchProveedoresOptions()
      .then((rows) => setProveedores(Array.isArray(rows) ? rows : []))
      .catch(() => setProveedores([]));
  }, []);

  const loadSection = useCallback(async (currentFilters) => {
    const range = sanitizeDateRange(currentFilters);
    await Promise.all([
      cargarReporte('compras', {
        ...range,
        proveedor_id: currentFilters.proveedor_id,
        metodo_pago: currentFilters.metodo_pago
      }, true),
      cargarReporte('comprasProductos', {
        ...range,
        proveedor_id: currentFilters.proveedor_id,
        metodo_pago: currentFilters.metodo_pago
      }, true)
    ]);
  }, [cargarReporte]);

  useEffect(() => {
    loadSection(filters);
  }, [filters, loadSection]);

  const loading = views.compras.loading || views.comprasProductos.loading;
  const error = views.compras.error || views.comprasProductos.error;
  const hasData = Boolean(views.compras.data || views.comprasProductos.data);

  const comprasSummary = views.compras.data?.resumen || {};
  const comprasRows = views.compras.data?.items || [];
  const productsRows = views.comprasProductos.data?.items || [];

  const filteredComprasRows = useMemo(() => {
    return comprasRows.filter((row) => {
      if (filters.proveedor_id && Number(row.proveedor_id || 0) !== Number(filters.proveedor_id)) return false;
      if (filters.metodo_pago && String(row.metodo_pago || '').toUpperCase() !== filters.metodo_pago) return false;
      return true;
    });
  }, [comprasRows, filters.proveedor_id, filters.metodo_pago]);

  const comprasByDateChart = useMemo(() => {
    const grouped = new Map();
    for (const row of filteredComprasRows) {
      const key = String(row.fecha || '').slice(0, 10);
      grouped.set(key, Number(grouped.get(key) || 0) + Math.round(Number(row.total_compra || 0) * 100));
    }
    return Array.from(grouped.entries())
      .map(([key, value]) => ({
        rawDate: key,
        label: formatDateOnly(key),
        value
      }))
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [filteredComprasRows]);

  const comprasByProveedorRows = useMemo(() => {
    const grouped = new Map();
    for (const row of filteredComprasRows) {
      const key = row.proveedor || 'Sin proveedor';
      grouped.set(key, Number(grouped.get(key) || 0) + Math.round(Number(row.total_compra || 0) * 100));
    }
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredComprasRows]);

  const topProductsChart = useMemo(() => {
    return productsRows
      .map((row) => ({
        label: `${row.codigo} ${row.nombre}`.slice(0, 28),
        value: Math.round(Number(row.total_comprado || 0) * 100)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [productsRows]);

  const providerTop = useMemo(() => {
    return comprasByProveedorRows[0]?.label || comprasSummary.proveedor_top || '-';
  }, [comprasByProveedorRows, comprasSummary.proveedor_top]);

  const totalComprasCentavos = Math.round(Number(comprasSummary.total_compras || 0) * 100);
  const ticketPromedioCentavos = Math.round(Number(comprasSummary.ticket_promedio_compra || 0) * 100);

  const kpis = [
    { label: 'Total compras', value: formatCentavos(totalComprasCentavos), icon: PiCashRegister },
    { label: 'Facturas', value: formatNumber(comprasSummary.cantidad_compras), icon: PiReceipt },
    { label: 'Proveedor top', value: providerTop, icon: PiStorefront },
    { label: 'Ticket promedio', value: formatCentavos(ticketPromedioCentavos), icon: PiPackage }
  ];

  const comprasPagination = useReportTablePagination(filteredComprasRows, 12);
  const proveedoresPagination = useReportTablePagination(comprasByProveedorRows, 10);
  const productosPagination = useReportTablePagination(productsRows, 10);

  return (
    <div className="space-y-5">
      <ReportDateFilters
        filters={filters}
        setFilters={setFilters}
        loading={loading}
        submitLabel="Actualizar compras"
        showExport
        onSubmit={(next) => loadSection(next)}
        onExport={() => {
          const rows = filteredComprasRows.map((row) => ({
            fecha: formatDateLabel(row.fecha),
            factura: row.numero_factura,
            proveedor: row.proveedor,
            metodo_pago: mapCompraMetodo(row.metodo_pago),
            total: formatCentavos(Math.round(Number(row.total_compra || 0) * 100))
          }));
          exportRowsToCsv('reportes-compras-detalle.csv', [
            { key: 'fecha', label: 'Fecha' },
            { key: 'factura', label: 'Factura' },
            { key: 'proveedor', label: 'Proveedor' },
            { key: 'metodo_pago', label: 'Metodo pago' },
            { key: 'total', label: 'Total' }
          ], rows);
        }}
        extraFields={(
          <>
            <Field label="Proveedor">
              <Select
                value={filters.proveedor_id}
                onChange={(event) => setFilters((prev) => ({ ...prev, proveedor_id: event.target.value }))}
              >
                <option value="">Todos</option>
                {proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                ))}
              </Select>
            </Field>

            <Field label="Metodo de pago">
              <Select
                value={filters.metodo_pago}
                onChange={(event) => setFilters((prev) => ({ ...prev, metodo_pago: event.target.value }))}
              >
                <option value="">Todos</option>
                <option value="CONTADO">Contado</option>
                <option value="CREDITO">Credito</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="TARJETA">Tarjeta</option>
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
            <ChartPanel title="Compras por fecha" subtitle="Evolucion de compras para el rango seleccionado.">
              <SalesLineChart data={comprasByDateChart} yType="money" label="Compras" />
            </ChartPanel>
            <ChartPanel title="Compras por proveedor" subtitle="Concentracion de compra por proveedor.">
              <HorizontalBarChart data={comprasByProveedorRows} xType="money" label="Compras" />
            </ChartPanel>
          </div>

          <ChartPanel title="Productos mas comprados" subtitle="Productos con mayor monto de compra en el periodo.">
            <HorizontalBarChart data={topProductsChart} xType="money" label="Monto comprado" />
          </ChartPanel>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Detalle compras</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Facturas registradas por proveedor y metodo de pago.</p>
            </div>
            {filteredComprasRows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No hubo compras en este periodo" description="No se registran facturas para los filtros seleccionados." />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Fecha</TableCell>
                    <TableCell as="th">Factura</TableCell>
                    <TableCell as="th">Proveedor</TableCell>
                    <TableCell as="th">Metodo pago</TableCell>
                    <TableCell as="th">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyColSpan={5} emptyMessage="Sin compras para filtros actuales.">
                  {comprasPagination.pagedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                      <TableCell>{row.numero_factura}</TableCell>
                      <TableCell>{row.proveedor}</TableCell>
                      <TableCell>{mapCompraMetodo(row.metodo_pago)}</TableCell>
                      <TableCell>{formatCentavos(Math.round(Number(row.total_compra || 0) * 100))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pb-4">
              <Paginador
                paginaActual={comprasPagination.page}
                totalPaginas={comprasPagination.totalPages}
                totalRegistros={comprasPagination.totalRecords}
                mostrarSiempre
                onPageChange={comprasPagination.setPage}
              />
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Compras por proveedor</h3>
              </div>
              {comprasByProveedorRows.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Sin proveedores con compras" description="No hay informacion de proveedores para el periodo." />
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell as="th">Proveedor</TableCell>
                      <TableCell as="th">Monto</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody emptyColSpan={2} emptyMessage="Sin compras por proveedor.">
                    {proveedoresPagination.pagedRows.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell>{formatCentavos(row.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                )}
                <div className="px-4 pb-4">
                  <Paginador
                    paginaActual={proveedoresPagination.page}
                    totalPaginas={proveedoresPagination.totalPages}
                    totalRegistros={proveedoresPagination.totalRecords}
                    mostrarSiempre
                    onPageChange={proveedoresPagination.setPage}
                  />
                </div>
              </Panel>

            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Productos comprados</h3>
              </div>
              {productsRows.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Sin productos comprados" description="No hubo recepciones de producto en este rango." />
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell as="th">Producto</TableCell>
                      <TableCell as="th">Categoria</TableCell>
                      <TableCell as="th">Cantidad</TableCell>
                      <TableCell as="th">Total</TableCell>
                      <TableCell as="th">Facturas</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody emptyColSpan={5} emptyMessage="Sin productos para este periodo.">
                    {productosPagination.pagedRows.map((row) => (
                      <TableRow key={row.producto_id}>
                        <TableCell>{row.codigo} {row.nombre}</TableCell>
                        <TableCell>{row.categoria || '-'}</TableCell>
                        <TableCell>{formatQuantity(row.cantidad_comprada, row.unidad_medida, { fixedLB: true })}</TableCell>
                        <TableCell>{formatCentavos(Math.round(Number(row.total_comprado || 0) * 100))}</TableCell>
                        <TableCell>{formatNumber(row.facturas)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                )}
                <div className="px-4 pb-4">
                  <Paginador
                    paginaActual={productosPagination.page}
                    totalPaginas={productosPagination.totalPages}
                    totalRegistros={productosPagination.totalRecords}
                    mostrarSiempre
                    onPageChange={productosPagination.setPage}
                  />
                </div>
              </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
