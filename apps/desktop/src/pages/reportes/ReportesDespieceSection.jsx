import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiChartBar, PiTrendUp, PiWarningCircle } from 'react-icons/pi';
import {
  Alert,
  EmptyState,
  Field,
  Input,
  MetricTile,
  Paginador,
  Panel,
  Select,
  StatusChip,
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
  formatPercent,
  formatQuantity,
  joinChildren,
  sanitizeDateRange
} from './reportesUtils';
import { useReportTablePagination } from './useReportTablePagination';

function normalizeTransformacionesResumen(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (rawData && Array.isArray(rawData.items)) return rawData.items;
  return [];
}

export default function ReportesDespieceSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const views = useReportesStore((state) => state.views);
  const [filters, setFilters] = useState(() => ({
    ...createDefaultQuickFilters('last30'),
    estado: '',
    lote: ''
  }));

  const loadSection = useCallback(async (currentFilters) => {
    const range = sanitizeDateRange(currentFilters);
    await Promise.all([
      cargarReporte('transformaciones', {
        ...range,
        estado: currentFilters.estado
      }, true),
      cargarReporte('transformacionesResumen', range, true)
    ]);
  }, [cargarReporte]);

  useEffect(() => {
    loadSection(filters);
  }, [filters, loadSection]);

  const loading = views.transformaciones.loading || views.transformacionesResumen.loading;
  const error = views.transformaciones.error || views.transformacionesResumen.error;
  const hasData = Boolean(views.transformaciones.data || views.transformacionesResumen.data);

  const transformacionesRows = views.transformaciones.data?.items || [];
  const resumenRowsRaw = normalizeTransformacionesResumen(views.transformacionesResumen.data);
  const range = sanitizeDateRange(filters);

  const filteredTransformacionesRows = useMemo(() => {
    return transformacionesRows.filter((row) => {
      if (filters.estado && String(row.estado || '').toUpperCase() !== filters.estado) return false;
      if (filters.lote && !String(row.numero || '').toUpperCase().includes(String(filters.lote).trim().toUpperCase())) return false;
      return true;
    });
  }, [transformacionesRows, filters.estado, filters.lote]);

  const resumenRows = useMemo(() => {
    return resumenRowsRaw
      .filter((row) => {
        const fecha = String(row.fecha || '').slice(0, 10);
        return (!range.fecha_inicio || fecha >= range.fecha_inicio) && (!range.fecha_fin || fecha <= range.fecha_fin);
      })
      .map((row) => {
        const entrada = Number(row.entrada_total || 0);
        const salida = Number(row.salida_util_total || 0);
        const merma = Number(row.merma_total || 0);
        const rendimiento = entrada > 0 ? Number(((salida / entrada) * 100).toFixed(2)) : 0;
        return {
          ...row,
          fecha: String(row.fecha || '').slice(0, 10),
          lotes: Number(row.lotes || 0),
          entrada_total: entrada,
          salida_util_total: salida,
          merma_total: merma,
          rendimiento
        };
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [resumenRowsRaw, range.fecha_inicio, range.fecha_fin]);

  const rendimientoChart = resumenRows.map((row) => ({
    label: formatDateOnly(row.fecha),
    value: row.rendimiento
  }));

  const mermaByLoteChart = filteredTransformacionesRows
    .map((row) => ({
      label: row.numero || `TRF-${row.id}`,
      value: Number(row.merma_total || 0)
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const totalMerma = filteredTransformacionesRows.reduce((acc, row) => acc + Number(row.merma_total || 0), 0);
  const averageRendimiento = filteredTransformacionesRows.length > 0
    ? filteredTransformacionesRows.reduce((acc, row) => acc + Number(row.rendimiento_porcentaje || 0), 0) / filteredTransformacionesRows.length
    : 0;
  const averageCost = filteredTransformacionesRows.length > 0
    ? Math.round(
      filteredTransformacionesRows.reduce((acc, row) => acc + Number(row.costo_total_padre_centavos || 0), 0) /
      filteredTransformacionesRows.length
    )
    : 0;

  const kpis = [
    {
      label: 'Transformaciones',
      value: formatNumber(filteredTransformacionesRows.length),
      icon: PiChartBar
    },
    {
      label: 'Merma total',
      value: formatNumber(totalMerma),
      icon: PiWarningCircle
    },
    {
      label: 'Rendimiento promedio',
      value: formatPercent(averageRendimiento),
      icon: PiTrendUp
    },
    {
      label: 'Costo promedio lote',
      value: formatCentavos(averageCost),
      icon: PiChartBar
    }
  ];

  const transformacionesPagination = useReportTablePagination(filteredTransformacionesRows, 10);
  const resumenPagination = useReportTablePagination(resumenRows, 12);

  return (
    <div className="space-y-5">
      <ReportDateFilters
        filters={filters}
        setFilters={setFilters}
        loading={loading}
        submitLabel="Actualizar despiece"
        showExport
        onSubmit={(next) => loadSection(next)}
        onExport={() => {
          const rows = filteredTransformacionesRows.map((row) => ({
            fecha: formatDateLabel(row.fecha),
            lote: row.numero,
            estado: row.estado,
            padre: `${row.producto_padre?.codigo || ''} ${row.producto_padre?.nombre || ''}`.trim(),
            entrada: formatQuantity(row.producto_padre?.cantidad, row.producto_padre?.unidad_medida || 'UND', { fixedLB: true }),
            merma: formatQuantity(row.merma_total, row.producto_padre?.unidad_medida || 'UND', { fixedLB: true }),
            rendimiento: formatPercent(row.rendimiento_porcentaje)
          }));
          exportRowsToCsv('reportes-despiece-transformaciones.csv', [
            { key: 'fecha', label: 'Fecha' },
            { key: 'lote', label: 'Lote' },
            { key: 'estado', label: 'Estado' },
            { key: 'padre', label: 'Producto padre' },
            { key: 'entrada', label: 'Entrada' },
            { key: 'merma', label: 'Merma' },
            { key: 'rendimiento', label: 'Rendimiento' }
          ], rows);
        }}
        extraFields={(
          <>
            <Field label="Estado">
              <Select
                value={filters.estado}
                onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value }))}
              >
                <option value="">Todos</option>
                <option value="APLICADA">Aplicada</option>
                <option value="BORRADOR">Borrador</option>
                <option value="ANULADA">Anulada</option>
              </Select>
            </Field>

            <Field label="Lote / numero">
              <Input
                value={filters.lote}
                onChange={(event) => setFilters((prev) => ({ ...prev, lote: event.target.value }))}
                placeholder="Ej: TRF-001"
              />
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
            <ChartPanel title="Rendimiento por fecha" subtitle="Comportamiento de rendimiento (%) por dia de proceso.">
              <SalesLineChart data={rendimientoChart} yType="percent" label="Rendimiento" />
            </ChartPanel>
            <ChartPanel title="Merma por lote" subtitle="Lotes con mayor merma en el periodo seleccionado.">
              <HorizontalBarChart data={mermaByLoteChart} xType="count" label="Merma" />
            </ChartPanel>
          </div>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Detalle transformaciones</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Entrada, salida, merma y costos por lote de despiece.</p>
            </div>
            {filteredTransformacionesRows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin transformaciones en el periodo" description="No hubo despiece para los filtros elegidos." />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Fecha</TableCell>
                    <TableCell as="th">Lote</TableCell>
                    <TableCell as="th">Padre</TableCell>
                    <TableCell as="th">Hijos</TableCell>
                    <TableCell as="th">Entrada</TableCell>
                    <TableCell as="th">Merma</TableCell>
                    <TableCell as="th">Rendimiento</TableCell>
                    <TableCell as="th">Costo padre</TableCell>
                    <TableCell as="th">Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyColSpan={9} emptyMessage="Sin transformaciones para filtros actuales.">
                  {transformacionesPagination.pagedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                      <TableCell>{row.numero || `#${row.id}`}</TableCell>
                      <TableCell>{row.producto_padre?.codigo} {row.producto_padre?.nombre}</TableCell>
                      <TableCell>{joinChildren(row.productos_hijos)}</TableCell>
                      <TableCell>{formatQuantity(row.producto_padre?.cantidad, row.producto_padre?.unidad_medida || 'UND', { fixedLB: true })}</TableCell>
                      <TableCell>{formatQuantity(row.merma_total, row.producto_padre?.unidad_medida || 'UND', { fixedLB: true })}</TableCell>
                      <TableCell>{formatPercent(row.rendimiento_porcentaje)}</TableCell>
                      <TableCell>{formatCentavos(row.costo_total_padre_centavos)}</TableCell>
                      <TableCell>
                        <StatusChip tone={row.estado === 'APLICADA' ? 'success' : row.estado === 'ANULADA' ? 'danger' : 'warning'}>
                          {row.estado}
                        </StatusChip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pb-4">
              <Paginador
                paginaActual={transformacionesPagination.page}
                totalPaginas={transformacionesPagination.totalPages}
                totalRegistros={transformacionesPagination.totalRecords}
                mostrarSiempre
                onPageChange={transformacionesPagination.setPage}
              />
            </div>
          </Panel>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Entrada / salida / merma por fecha</h3>
            </div>
            {resumenRows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin resumen de despiece" description="No se encontraron dias con transformaciones aplicadas." />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Fecha</TableCell>
                    <TableCell as="th">Lotes</TableCell>
                    <TableCell as="th">Entrada</TableCell>
                    <TableCell as="th">Salida util</TableCell>
                    <TableCell as="th">Merma</TableCell>
                    <TableCell as="th">Rendimiento</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyColSpan={6} emptyMessage="Sin resumen diario para filtros actuales.">
                  {resumenPagination.pagedRows.map((row) => (
                    <TableRow key={row.fecha}>
                      <TableCell>{formatDateOnly(row.fecha)}</TableCell>
                      <TableCell>{formatNumber(row.lotes)}</TableCell>
                      <TableCell>{formatNumber(row.entrada_total)}</TableCell>
                      <TableCell>{formatNumber(row.salida_util_total)}</TableCell>
                      <TableCell>{formatNumber(row.merma_total)}</TableCell>
                      <TableCell>{formatPercent(row.rendimiento)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pb-4">
              <Paginador
                paginaActual={resumenPagination.page}
                totalPaginas={resumenPagination.totalPages}
                totalRegistros={resumenPagination.totalRecords}
                mostrarSiempre
                onPageChange={resumenPagination.setPage}
              />
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
