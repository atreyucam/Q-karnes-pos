import { useEffect, useMemo, useState } from 'react';
import { PiCashRegister, PiPackage, PiReceipt, PiStorefront, PiUsersThree, PiWarningCircle } from 'react-icons/pi';
import {
  Alert,
  EmptyState,
  Input,
  LoadingState,
  MetricTile,
  PageHeader,
  Panel,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '../../shared/ui';
import { useReportesStore } from '../../stores/reportesStore';
import { ChartPanel, VerticalBarChart } from './ReportesCharts';
import { businessTodayString, formatCentavos, formatDateLabel, formatNumber, formatSignedPercent } from './reportesUtils';
import { useDebouncedValue } from './useDebouncedValue';

function toneBySigned(value) {
  const amount = Number(value || 0);
  if (amount > 0) return 'text-emerald-600';
  if (amount < 0) return 'text-red-600';
  return 'text-slate-500';
}

function toneByCount(value, warningThreshold = 1) {
  const amount = Number(value || 0);
  if (amount <= 0) return 'text-slate-500';
  if (amount >= warningThreshold) return 'text-red-600';
  return 'text-amber-600';
}

function SummaryTable({ title, subtitle, columns, rows, emptyTitle, emptyDescription }) {
  return (
    <Panel className="p-0">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
        <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
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
          <TableBody emptyColSpan={columns.length} emptyMessage="Sin datos disponibles.">
            {rows.map((row, index) => (
              <TableRow key={row.id || row.producto_id || row.cliente_id || row.proveedor_id || `${title}-${index}`}>
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

export default function ReportesResumenSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const view = useReportesStore((state) => state.views.resumenOperativo);
  const [filters, setFilters] = useState(() => ({
    fecha: businessTodayString()
  }));
  const debouncedFilters = useDebouncedValue(filters, 280);

  useEffect(() => {
    cargarReporte('resumenOperativo', debouncedFilters);
  }, [cargarReporte, debouncedFilters]);

  const data = view.data;
  const loading = view.loading;
  const error = view.error;
  const resumen = data?.resumen || {};
  const ventas7 = data?.ventas_ultimos_7_dias || [];
  const tablas = data?.tablas || {};
  const actividad = data?.actividad_reciente || [];
  const alertas = data?.alertas || [];

  const kpis = [
    {
      label: 'Ventas Hoy',
      value: formatCentavos(resumen.ventas_hoy_centavos),
      note: `${formatSignedPercent(resumen.variacion_ventas_vs_ayer_porcentaje)} vs ayer`,
      noteClass: toneBySigned(resumen.variacion_ventas_vs_ayer_porcentaje),
      icon: PiCashRegister
    },
    {
      label: 'Ticket Promedio',
      value: formatCentavos(resumen.ticket_promedio_centavos),
      note: `${formatNumber(resumen.numero_ventas)} ventas`,
      icon: PiReceipt
    },
    {
      label: 'Caja Actual',
      value: formatCentavos(resumen.caja_actual_centavos),
      note: Number(resumen.caja_diferencia_centavos || 0) === 0 ? 'Sin diferencias' : `Diferencia ${formatCentavos(Math.abs(resumen.caja_diferencia_centavos || 0))}`,
      noteClass: Number(resumen.caja_diferencia_centavos || 0) === 0 ? 'text-emerald-600' : toneBySigned(-Math.abs(resumen.caja_diferencia_centavos || 0)),
      icon: PiCashRegister
    },
    {
      label: 'Stock Crítico',
      value: `${formatNumber(resumen.stock_critico)} productos`,
      note: `${formatNumber(resumen.inconsistencias_stock)} inconsistencias`,
      noteClass: toneByCount(resumen.inconsistencias_stock),
      icon: PiWarningCircle
    },
    {
      label: 'Clientes con Deuda',
      value: `${formatNumber(resumen.clientes_con_deuda)} clientes`,
      note: `Saldo: ${formatCentavos(resumen.deuda_clientes_centavos)}`,
      noteClass: Number(resumen.deuda_clientes_centavos || 0) > 100000 ? 'text-red-600' : Number(resumen.deuda_clientes_centavos || 0) > 0 ? 'text-amber-600' : 'text-slate-500',
      icon: PiUsersThree
    },
    {
      label: 'Proveedores Pendientes',
      value: `${formatNumber(resumen.proveedores_pendientes)} proveedores`,
      note: `Saldo: ${formatCentavos(resumen.saldo_proveedores_centavos)}`,
      noteClass: Number(resumen.saldo_proveedores_centavos || 0) > 0 ? 'text-amber-600' : 'text-slate-500',
      icon: PiStorefront
    }
  ];

  const chartData = useMemo(() => (
    ventas7.map((row) => ({
      label: new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: '2-digit' }).format(new Date(`${row.fecha}T00:00:00`)),
      value: Number(row.total_ventas_centavos || 0)
    }))
  ), [ventas7]);

  if (loading && !data) {
    return <LoadingState label="Construyendo resumen operativo..." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Resumen Operativo"
        description="Vista general del negocio en tiempo real"
        actions={(
          <Input
            type="date"
            value={filters.fecha}
            onChange={(event) => setFilters({ fecha: event.target.value || businessTodayString() })}
            className="w-[180px]"
          />
        )}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <MetricTile icon={kpi.icon} value={kpi.value} label={kpi.label} tone="primary" className="border-0 bg-transparent px-0 py-0" />
            <p className={`mt-2 text-sm font-semibold ${kpi.noteClass || 'text-[var(--color-text-muted)]'}`}>{kpi.note}</p>
          </div>
        ))}
      </div>

      <ChartPanel
        title="Ventas últimos 7 días"
        subtitle="Siempre toma como referencia el día seleccionado."
      >
        <VerticalBarChart data={chartData} label="Ventas" />
      </ChartPanel>

      <div className="grid gap-4 xl:grid-cols-3">
        <SummaryTable
          title="Productos críticos"
          subtitle="Solo los casos más urgentes."
          rows={tablas.productos_criticos || []}
          emptyTitle="Sin productos críticos"
          emptyDescription="No hay alertas críticas de stock para este corte."
          columns={[
            {
              key: 'producto',
              label: 'Producto',
              render: (row) => ` ${row.producto}`
            },
            {
              key: 'stock_actual',
              label: 'Stock',
              render: (row) => `${formatNumber(row.stock_actual)} ${row.unidad_medida}`
            },
            {
              key: 'estado',
              label: 'Estado',
              render: (row) => (
                <StatusChip tone={row.estado === 'SIN_STOCK' ? 'danger' : 'warning'}>
                  {row.estado === 'SIN_STOCK' ? 'Sin stock' : 'Bajo mínimo'}
                </StatusChip>
              )
            }
          ]}
        />

        <SummaryTable
          title="Clientes con deuda"
          subtitle="Mayor exposición pendiente."
          rows={tablas.clientes_con_deuda || []}
          emptyTitle="Sin deuda activa"
          emptyDescription="No hay clientes con saldo pendiente."
          columns={[
            { key: 'cliente', label: 'Cliente' },
            {
              key: 'saldo_pendiente_centavos',
              label: 'Saldo',
              className: 'text-right',
              render: (row) => <span className={Number(row.saldo_pendiente_centavos || 0) > 100000 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold'}>{formatCentavos(row.saldo_pendiente_centavos)}</span>
            }
          ]}
        />

        <SummaryTable
          title="Proveedores pendientes"
          subtitle="Facturas por pagar vigentes."
          rows={tablas.proveedores_pendientes || []}
          emptyTitle="Sin cuentas por pagar"
          emptyDescription="No hay proveedores con saldo pendiente."
          columns={[
            { key: 'proveedor', label: 'Proveedor' },
            {
              key: 'saldo_pendiente_centavos',
              label: 'Saldo',
              className: 'text-right',
              render: (row) => <span className="font-semibold text-amber-600">{formatCentavos(row.saldo_pendiente_centavos)}</span>
            }
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Panel className="p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Actividad reciente</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Solo eventos operativos relevantes.</p>
          </div>
          {actividad.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin actividad reciente" description="No se registran eventos recientes para mostrar." />
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {actividad.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-[var(--color-text)]">{item.titulo}</p>
                    <span className="text-xs text-[var(--color-text-muted)]">{formatDateLabel(item.fecha)}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.descripcion}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Alertas críticas</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Solo excepciones operativas reales.</p>
          </div>
          {alertas.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin alertas críticas" description="No hay alertas que requieran atención inmediata." />
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {alertas.map((alerta) => (
                <div key={alerta.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-3">
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

      {loading ? <div className="text-sm text-[var(--color-text-muted)]">Actualizando resumen...</div> : null}
    </div>
  );
}
