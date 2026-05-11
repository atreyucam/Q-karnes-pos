import { useEffect, useMemo, useState } from 'react';
import { PiCashRegister, PiCalendarDots, PiReceipt, PiWarningCircle, PiWallet } from 'react-icons/pi';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Paginador,
  PageHeader,
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
import { ChartPanel, ComparisonBarChart, PaymentDonutChart } from './ReportesCharts';
import { businessTodayString, formatCentavos, formatDateLabel, shiftDate } from './reportesUtils';
import { useReportTablePagination } from './useReportTablePagination';
import { useDebouncedValue } from './useDebouncedValue';

function defaultCajaFilters() {
  const today = businessTodayString();
  return {
    periodo: 'today',
    fecha_inicio: today,
    fecha_fin: today,
    comparar: 'none',
    comparar_con: shiftDate(today, -1)
  };
}

function toneBySigned(value) {
  const amount = Number(value || 0);
  if (amount > 0) return 'text-emerald-600';
  if (amount < 0) return 'text-red-600';
  return 'text-slate-500';
}

function toneBySignedStrict(value) {
  const amount = Number(value || 0);
  if (amount > 0) return 'text-emerald-600';
  if (amount < 0) return 'text-red-600';
  return '';
}

function methodLabel(code) {
  if (code === 'TRANSFERENCIA') return 'Transferencia';
  if (code === 'CREDITO') return 'Crédito';
  return 'Efectivo';
}

function formatSignedMoneyWithPrefix(centavos) {
  const amount = Number(centavos || 0);
  if (amount > 0) return `+${formatCentavos(amount)}`;
  if (amount < 0) return `-${formatCentavos(Math.abs(amount))}`;
  return formatCentavos(0);
}

function PeriodKpi({ icon: Icon, label, value, toneClass }) {
  return (
    <div className="rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <Icon />
        </span>
        <div>
          <p className={`text-xl font-bold ${toneClass || 'text-[var(--color-text)]'}`}>{value}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function ReportesCajaSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const view = useReportesStore((state) => state.views.cajaPanel);
  const [filters, setFilters] = useState(defaultCajaFilters);
  const debouncedFilters = useDebouncedValue(filters, 280);

  useEffect(() => {
    cargarReporte('cajaPanel', {
      periodo: debouncedFilters.periodo,
      fecha_inicio: debouncedFilters.fecha_inicio,
      fecha_fin: debouncedFilters.fecha_fin,
      comparar: debouncedFilters.comparar,
      comparar_con: debouncedFilters.comparar === 'specific' ? debouncedFilters.comparar_con : undefined
    });
  }, [cargarReporte, debouncedFilters]);

  const data = view.data;
  const loading = view.loading;
  const error = view.error;
  const filtros = data?.filtros || {};
  const resumen = data?.resumen || {};
  const graficos = data?.graficos || {};
  const tablas = data?.tablas || {};
  const alertas = data?.alertas || [];
  const isRange = Boolean(filtros.is_range);
  const movimientosPagination = useReportTablePagination(tablas.movimientos || [], 10);

  const resetFilters = () => {
    setFilters(defaultCajaFilters());
  };

  const methodsData = useMemo(() => (
    (graficos.ingresos_por_metodo_comercial || []).map((row) => ({
      label: methodLabel(row.codigo),
      value: Number(row.total_centavos || 0)
    }))
  ), [graficos.ingresos_por_metodo_comercial]);

  const compareBarsData = useMemo(() => (
    [
      {
        label: 'Ingresos',
        actual: Number(graficos.comparativa?.[0]?.ingresos_centavos || 0),
        comparado: Number(graficos.comparativa?.[1]?.ingresos_centavos || 0)
      },
      {
        label: 'Egresos',
        actual: Number(graficos.comparativa?.[0]?.egresos_centavos || 0),
        comparado: Number(graficos.comparativa?.[1]?.egresos_centavos || 0)
      },
      {
        label: 'Diferencia',
        actual: Number(graficos.comparativa?.[0]?.diferencia_centavos || 0),
        comparado: Number(graficos.comparativa?.[1]?.diferencia_centavos || 0)
      }
    ]
  ), [graficos.comparativa]);

  const dayRangeBars = useMemo(() => (
    (graficos.ingresos_vs_egresos_por_dia || []).map((row) => ({
      label: row.fecha,
      ingresos: Number(row.ingresos_centavos || 0),
      egresos: Number(row.egresos_centavos || 0)
    }))
  ), [graficos.ingresos_vs_egresos_por_dia]);

  const kpis = isRange
    ? [
      { label: 'Ingresos acumulados', value: formatCentavos(resumen.ingresos_acumulados_centavos), icon: PiCashRegister, toneClass: 'text-emerald-600' },
      { label: 'Egresos acumulados', value: formatCentavos(resumen.egresos_acumulados_centavos), icon: PiReceipt, toneClass: 'text-red-600' },
      { label: 'Diferencia acumulada', value: formatSignedMoneyWithPrefix(resumen.diferencia_acumulada_centavos), icon: PiWarningCircle, toneClass: toneBySigned(resumen.diferencia_acumulada_centavos) },
      { label: 'Turnos cerrados', value: `${resumen.turnos_cerrados || 0}`, icon: PiCalendarDots },
      { label: 'Turnos con diferencia', value: `${resumen.turnos_con_diferencia || 0}`, icon: PiWarningCircle, toneClass: Number(resumen.turnos_con_diferencia || 0) > 0 ? 'text-amber-600' : 'text-slate-500' },
      { label: 'Total contado', value: formatCentavos(resumen.total_contado_centavos), icon: PiWallet }
    ]
    : [
      { label: 'Apertura', value: formatCentavos(resumen.apertura_centavos), icon: PiWallet },
      { label: 'Ingresos', value: formatCentavos(resumen.ingresos_centavos), icon: PiCashRegister, toneClass: 'text-emerald-600' },
      { label: 'Egresos', value: formatCentavos(resumen.egresos_centavos), icon: PiReceipt, toneClass: 'text-red-600' },
      { label: 'Esperado', value: formatCentavos(resumen.esperado_centavos), icon: PiWallet },
      { label: 'Contado', value: formatCentavos(resumen.contado_centavos), icon: PiCashRegister },
      { label: 'Diferencia', value: formatSignedMoneyWithPrefix(resumen.diferencia_centavos), icon: PiWarningCircle, toneClass: toneBySigned(resumen.diferencia_centavos) }
    ];

  if (loading && !data) {
    return <LoadingState label="Construyendo control de caja..." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Caja"
        description="Control financiero operativo"
        actions={(
          <div className="flex w-full justify-end">
            <div className="flex w-full items-center justify-end gap-2 md:w-auto md:flex-nowrap">
              <Select
                className="w-full md:w-[220px]"
                value={filters.periodo}
                onChange={(event) => {
                  const next = event.target.value;
                  const today = businessTodayString();
                  if (next === 'today') setFilters((prev) => ({ ...prev, periodo: next, fecha_inicio: today, fecha_fin: today }));
                  if (next === 'yesterday') {
                    const d = shiftDate(today, -1);
                    setFilters((prev) => ({ ...prev, periodo: next, fecha_inicio: d, fecha_fin: d }));
                  }
                  if (next === 'last7') setFilters((prev) => ({ ...prev, periodo: next, fecha_inicio: shiftDate(today, -6), fecha_fin: today }));
                  if (next === 'last30') setFilters((prev) => ({ ...prev, periodo: next, fecha_inicio: shiftDate(today, -29), fecha_fin: today }));
                  if (next === 'custom') setFilters((prev) => ({ ...prev, periodo: next }));
                }}
              >
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="last7">Últimos 7 días</option>
                <option value="last30">Últimos 30 días</option>
                <option value="custom">Personalizado</option>
              </Select>
              <Select className="w-full md:w-[240px]" value={filters.comparar} onChange={(event) => setFilters((prev) => ({ ...prev, comparar: event.target.value }))}>
                <option value="none">Comparar: Ninguno</option>
                <option value="day_previous">Comparar: Día anterior</option>
                <option value="week_previous">Comparar: Semana anterior</option>
                <option value="previous_period">Comparar: Período anterior equivalente</option>
                <option value="specific">Comparar: Fecha específica</option>
              </Select>
              {filters.comparar === 'specific' ? (
                <Input className="w-full md:w-[180px]" type="date" value={filters.comparar_con} onChange={(event) => setFilters((prev) => ({ ...prev, comparar_con: event.target.value }))} />
              ) : null}
              <Button className="w-full md:w-[140px]" variant="neutral" onClick={resetFilters}>Limpiar</Button>
            </div>
          </div>
        )}
      />

      {filters.periodo === 'custom' ? (
        <Panel className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Fecha inicio">
            <Input type="date" value={filters.fecha_inicio} onChange={(event) => setFilters((prev) => ({ ...prev, fecha_inicio: event.target.value }))} />
          </Field>
          <Field label="Fecha fin">
            <Input type="date" value={filters.fecha_fin} onChange={(event) => setFilters((prev) => ({ ...prev, fecha_fin: event.target.value }))} />
          </Field>
        </Panel>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <PeriodKpi key={kpi.label} icon={kpi.icon} label={kpi.label} value={kpi.value} toneClass={kpi.toneClass} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
        <ChartPanel title="Ingresos por método comercial" subtitle="Efectivo, transferencia y crédito comerciales.">
          <PaymentDonutChart data={methodsData} />
        </ChartPanel>

        {filters.comparar !== 'none' && (graficos.comparativa || []).length === 2 ? (
          <ChartPanel
            title="Comparativa de caja"
            subtitle={`${graficos.comparativa?.[0]?.etiqueta || filtros.fecha_inicio} vs ${graficos.comparativa?.[1]?.etiqueta || ''}`}
          >
            <ComparisonBarChart
              data={compareBarsData}
              bars={[
                { key: 'actual', label: graficos.comparativa?.[0]?.etiqueta || 'Período actual', color: '#0f766e' },
                { key: 'comparado', label: graficos.comparativa?.[1]?.etiqueta || 'Período comparado', color: '#94a3b8' }
              ]}
              yType="money"
            />
          </ChartPanel>
        ) : (
          <ChartPanel title="Ingresos vs egresos por día" subtitle="Comportamiento diario del período seleccionado.">
            <ComparisonBarChart
              data={dayRangeBars}
              bars={[
                { key: 'ingresos', label: 'Ingresos', color: '#059669' },
                { key: 'egresos', label: 'Egresos', color: '#dc2626' }
              ]}
              yType="money"
            />
          </ChartPanel>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Panel className="p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Movimientos de caja</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Movimientos que afectan saldo en el período.</p>
          </div>
          {(tablas.movimientos || []).length === 0 ? (
            <div className="p-4">
              <EmptyState title="No hay movimientos de caja para este rango." description="Ajusta el período o la comparación." />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell as="th">Fecha</TableCell>
                  <TableCell as="th">Hora</TableCell>
                  <TableCell as="th">Tipo</TableCell>
                  <TableCell as="th">Descripción</TableCell>
                  <TableCell as="th">Monto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody emptyColSpan={5} emptyMessage="Sin movimientos.">
                {movimientosPagination.pagedRows.map((row) => (
                  <TableRow key={row.movimiento_id}>
                    <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                    <TableCell>{row.hora}</TableCell>
                    <TableCell>
                      <StatusChip tone={row.sentido === 'EGRESO' ? 'warning' : 'success'}>{row.tipo}</StatusChip>
                    </TableCell>
                    <TableCell>{row.descripcion}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-semibold ${toneBySignedStrict(row.sentido === 'EGRESO' ? -Math.abs(Number(row.monto_centavos || 0)) : Math.abs(Number(row.monto_centavos || 0)))}`}>
                        {formatSignedMoneyWithPrefix(row.sentido === 'EGRESO' ? -Math.abs(Number(row.monto_centavos || 0)) : Math.abs(Number(row.monto_centavos || 0)))}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {(tablas.movimientos || []).length > 0 ? (
            <div className="border-t border-[var(--color-border)] px-4 py-3">
              <Paginador
                paginaActual={movimientosPagination.page}
                totalPaginas={movimientosPagination.totalPages}
                totalRegistros={movimientosPagination.totalRecords}
                mostrarSiempre
                onPageChange={movimientosPagination.setPage}
              />
            </div>
          ) : null}
        </Panel>

        <Panel className="p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Alertas operativas</h3>
          </div>
          {alertas.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin alertas" description="No hay anomalías operativas para este período." />
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {alertas.map((alerta) => (
                <div key={alerta.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-[var(--color-text)]">{alerta.titulo}</p>
                    <StatusChip tone={alerta.tone || 'warning'}>Alerta</StatusChip>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{alerta.descripcion}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="p-0">
        <div className="border-b border-[var(--color-border)] px-4 py-4">
          <h3 className="text-base font-semibold text-[var(--color-text)]">Turnos</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Turnos incluidos en el período.</p>
        </div>
        {(tablas.turnos || []).length === 0 ? (
          <div className="p-4">
            <EmptyState title="No hay turnos para este rango." description="No se registraron aperturas/cierres en el período seleccionado." />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell as="th">Fecha</TableCell>
                <TableCell as="th">Turno</TableCell>
                <TableCell as="th">Usuario</TableCell>
                <TableCell as="th">Apertura</TableCell>
                <TableCell as="th">Cierre</TableCell>
                <TableCell as="th">Diferencia</TableCell>
              </TableRow>
            </TableHead>
            <TableBody emptyColSpan={6} emptyMessage="Sin turnos.">
              {(tablas.turnos || []).map((row) => (
                <TableRow key={`${row.fecha}-${row.turno_id}`}>
                  <TableCell>{row.fecha}</TableCell>
                  <TableCell>#{row.turno_id}</TableCell>
                  <TableCell>{row.usuario}</TableCell>
                  <TableCell>{formatCentavos(row.apertura_centavos)}</TableCell>
                  <TableCell>{row.cierre_centavos === null ? '-' : formatCentavos(row.cierre_centavos)}</TableCell>
                  <TableCell className="text-right">
                    <span className={`font-semibold ${toneBySignedStrict(row.diferencia_centavos)}`}>
                      {row.diferencia_centavos === null ? '-' : formatSignedMoneyWithPrefix(row.diferencia_centavos)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {loading ? <div className="text-sm text-[var(--color-text-muted)]">Actualizando caja...</div> : null}
    </div>
  );
}
