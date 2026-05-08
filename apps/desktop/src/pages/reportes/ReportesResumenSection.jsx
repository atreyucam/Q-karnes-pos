import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiCashRegister, PiChartBar, PiPackage, PiReceipt, PiWarningCircle } from 'react-icons/pi';
import {
  Alert,
  EmptyState,
  LoadingState,
  MetricTile,
  Paginador,
  Panel,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '../../shared/ui';
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
  sanitizeDateRange
} from './reportesUtils';
import { useReportTablePagination } from './useReportTablePagination';

function normalizePaymentLabel(code = '') {
  const normalized = String(code || '').trim().toUpperCase();
  if (normalized === 'CREDITO_CLIENTE') return 'Crédito cliente';
  if (normalized === 'CONTADO') return 'Contado';
  if (normalized === 'EFECTIVO') return 'Efectivo';
  if (normalized === 'TRANSFERENCIA') return 'Transferencia';
  if (normalized === 'TARJETA') return 'Tarjeta';
  return normalized || 'Sin método';
}

export default function ReportesResumenSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const views = useReportesStore((state) => state.views);
  const [filters, setFilters] = useState(() => createDefaultQuickFilters('last7'));

  const loadSection = useCallback(async (currentFilters) => {
    const range = sanitizeDateRange(currentFilters);
    await Promise.all([
      cargarReporte('dashboard', {}, true),
      cargarReporte('ventasPeriodo', range, true),
      cargarReporte('ventasDiarias', range, true),
      cargarReporte('ventasPorProducto', range, true),
      cargarReporte('inventarioActual', {}, true),
      cargarReporte('inventario', {}, true),
      cargarReporte('cajaDiaria', { fecha: range.fecha_fin }, true)
    ]);
  }, [cargarReporte]);

  useEffect(() => {
    loadSection(filters);
  }, [loadSection, filters]);

  const loading = [
    views.dashboard.loading,
    views.ventasPeriodo.loading,
    views.ventasDiarias.loading,
    views.ventasPorProducto.loading,
    views.inventarioActual.loading,
    views.inventario.loading,
    views.cajaDiaria.loading
  ].some(Boolean);

  const hasData = Boolean(
    views.dashboard.data ||
    views.ventasPeriodo.data ||
    views.ventasDiarias.data ||
    views.ventasPorProducto.data ||
    views.inventarioActual.data
  );

  const error = views.dashboard.error || views.ventasPeriodo.error || views.inventario.error || views.cajaDiaria.error;

  const resumenVentas = views.ventasPeriodo.data?.resumen || {};
  const ventasRows = views.ventasPeriodo.data?.ventas || [];
  const seriesVentas = (views.ventasDiarias.data || []).map((row) => ({
    label: formatDateOnly(row.fecha),
    value: Number(row.total || 0) * 100
  }));
  const topProductos = (views.ventasPorProducto.data?.items || []).slice(0, 8).map((row) => ({
    label: `${row.codigo} ${row.nombre}`.slice(0, 28),
    value: Number(row.ingreso_total_centavos || 0)
  }));
  const inventarioResumen = views.inventarioActual.data?.resumen || {};
  const inventarioRows = views.inventario.data?.items || [];
  const lowStockRows = inventarioRows
    .filter((row) => row.bajo_minimo)
    .slice(0, 8)
    .map((row) => ({
      codigo: row.codigo,
      producto: row.producto,
      stock_actual: row.stock_actual,
      stock_minimo: row.stock_minimo,
      unidad: row.unidad_medida
    }));
  const cajaResumen = views.cajaDiaria.data?.resumen || {};
  const dashboardData = views.dashboard.data || {};
  const alerts = dashboardData.alertas_operativas || [];

  const paymentDistribution = useMemo(() => {
    const grouped = new Map();
    for (const row of ventasRows) {
      const key = normalizePaymentLabel(row.metodo_pago_codigo);
      grouped.set(key, Number(grouped.get(key) || 0) + Number(row.total_ventas_centavos || 0));
    }
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [ventasRows]);

  const kpis = [
    {
      label: 'Ventas netas',
      value: formatCentavos(resumenVentas.total_ventas_centavos),
      icon: PiCashRegister
    },
    {
      label: 'Número de ventas',
      value: formatNumber(resumenVentas.numero_ventas),
      icon: PiReceipt
    },
    {
      label: 'Ticket promedio',
      value: formatCentavos(resumenVentas.ticket_promedio_centavos),
      icon: PiCashRegister
    },
    {
      label: 'Utilidad',
      value: formatCentavos(resumenVentas.utilidad_centavos),
      icon: PiChartBar
    },
    {
      label: 'Caja esperada',
      value: formatCentavos(cajaResumen.saldo_esperado_centavos),
      icon: PiCashRegister
    },
    {
      label: 'Diferencia caja',
      value: formatSignedCentavos(cajaResumen.diferencia_centavos),
      icon: PiWarningCircle
    },
    {
      label: 'Inventario valorizado',
      value: formatCentavos(inventarioResumen.valor_total_inventario_centavos),
      icon: PiPackage
    },
    {
      label: 'Stock bajo',
      value: formatNumber(inventarioRows.filter((row) => row.bajo_minimo).length),
      icon: PiWarningCircle
    }
  ];

  const latestSalesRows = (dashboardData.ultimas_ventas || []).map((row) => ({
    venta: row.venta,
    hora: row.hora,
    cliente: row.cliente,
    metodo: row.metodo,
    total: formatCentavos(Math.round(Number(row.total || 0) * 100)),
    usuario: row.usuario
  }));
  const latestSalesPagination = useReportTablePagination(latestSalesRows, 8);
  const lowStockPagination = useReportTablePagination(lowStockRows, 8);

  return (
    <div className="space-y-5">
      <ReportDateFilters
        filters={filters}
        setFilters={setFilters}
        loading={loading}
        submitLabel="Actualizar resumen"
        showExport
        onSubmit={(next) => loadSection(next)}
        onExport={() => {
          exportRowsToCsv('reportes-resumen-ultimas-ventas.csv', [
            { key: 'venta', label: 'Venta' },
            { key: 'hora', label: 'Hora' },
            { key: 'cliente', label: 'Cliente' },
            { key: 'metodo', label: 'Método' },
            { key: 'total', label: 'Total' },
            { key: 'usuario', label: 'Usuario' }
          ], latestSalesRows);
        }}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading && !hasData ? <LoadingState label="Construyendo reporte resumen..." /> : null}

      {hasData ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <MetricTile key={kpi.label} icon={kpi.icon} value={kpi.value} label={kpi.label} tone="primary" />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel
              title="Ventas por día"
              subtitle="Evolución diaria de ventas netas dentro del rango seleccionado."
            >
              <SalesLineChart data={seriesVentas} yType="money" label="Ventas netas" />
            </ChartPanel>
            <ChartPanel
              title="Métodos de pago"
              subtitle="Distribución de ventas del periodo por método predominante."
            >
              <PaymentDonutChart data={paymentDistribution} />
            </ChartPanel>
          </div>

          <ChartPanel
            title="Top productos"
            subtitle="Productos con mayor ingreso dentro del periodo."
          >
            <HorizontalBarChart data={topProductos} xType="money" label="Ingreso" />
          </ChartPanel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Últimas ventas</h3>
                <p className="text-sm text-[var(--color-text-muted)]">Lectura rápida de emisión reciente.</p>
              </div>
              <div className="p-0">
                {latestSalesRows.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="Sin ventas recientes" description="Las últimas ventas aparecerán aquí." />
                  </div>
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell as="th">Venta</TableCell>
                        <TableCell as="th">Hora</TableCell>
                        <TableCell as="th">Cliente</TableCell>
                        <TableCell as="th">Método</TableCell>
                        <TableCell as="th">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody emptyMessage="Sin ventas registradas." emptyColSpan={5}>
                      {latestSalesPagination.pagedRows.map((row) => (
                        <TableRow key={`${row.venta}-${row.hora}`}>
                          <TableCell>{row.venta}</TableCell>
                          <TableCell>{row.hora}</TableCell>
                          <TableCell>{row.cliente}</TableCell>
                          <TableCell>{row.metodo}</TableCell>
                          <TableCell>{row.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="px-4 pb-4">
                  <Paginador
                    paginaActual={latestSalesPagination.page}
                    totalPaginas={latestSalesPagination.totalPages}
                    totalRegistros={latestSalesPagination.totalRecords}
                    mostrarSiempre
                    onPageChange={latestSalesPagination.setPage}
                  />
                </div>
              </div>
            </Panel>

            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Alertas de stock bajo</h3>
                <p className="text-sm text-[var(--color-text-muted)]">Productos por debajo de mínimo operativo.</p>
              </div>
              <div className="p-0">
                {lowStockRows.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="Sin alertas de stock" description="No existen productos bajo mínimo en este momento." />
                  </div>
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell as="th">Producto</TableCell>
                        <TableCell as="th">Stock actual</TableCell>
                        <TableCell as="th">Stock mínimo</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody emptyMessage="Sin productos críticos." emptyColSpan={3}>
                      {lowStockPagination.pagedRows.map((row) => (
                        <TableRow key={row.codigo}>
                          <TableCell>{row.codigo} {row.producto}</TableCell>
                          <TableCell>{row.stock_actual} {row.unidad}</TableCell>
                          <TableCell>{row.stock_minimo} {row.unidad}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="px-4 pb-4">
                  <Paginador
                    paginaActual={lowStockPagination.page}
                    totalPaginas={lowStockPagination.totalPages}
                    totalRegistros={lowStockPagination.totalRecords}
                    mostrarSiempre
                    onPageChange={lowStockPagination.setPage}
                  />
                </div>
              </div>
            </Panel>
          </div>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Alertas operativas</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Señales de operación y control del negocio.</p>
            </div>
            {alerts.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin alertas operativas" description="No se detectan alertas para el corte actual." />
              </div>
            ) : (
              <div className="space-y-2 p-4">
                {alerts.map((alert) => (
                  <div key={alert.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--color-text)]">{alert.title}</p>
                      <StatusChip tone={alert.tone || 'warning'}>{alert.category || 'alerta'}</StatusChip>
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{alert.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {loading ? <LoadingState label="Actualizando resumen..." /> : null}
        </>
      ) : null}
    </div>
  );
}
