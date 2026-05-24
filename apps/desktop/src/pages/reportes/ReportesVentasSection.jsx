import { useEffect, useMemo, useState } from 'react';
import { PiCashRegister, PiChartBar, PiPercent, PiReceipt, PiTrendUp, PiWallet } from 'react-icons/pi';
import {
  Alert,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Panel,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '../../shared/ui';
import { useReportesStore } from '../../stores/reportesStore';
import { exportReporteArchivo } from '../../services/reportesService';
import { ChartPanel, MultiLineChart, PaymentDonutChart, VerticalBarChart } from './ReportesCharts';
import {
  buildRangeFromQuick,
  businessTodayString,
  formatCentavos,
  formatDateLabel,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  QUICK_RANGE_OPTIONS
} from './reportesUtils';
import { useDebouncedValue } from './useDebouncedValue';

function createDefaultSalesFilters() {
  const today = businessTodayString();
  const range = buildRangeFromQuick('last7', today);
  return {
    quick: 'last7',
    fecha_inicio: range.fecha_inicio,
    fecha_fin: range.fecha_fin,
    metodo_pago: '',
    usuario_id: ''
  };
}

function paymentLabel(code) {
  if (code === 'TRANSFERENCIA') return 'Transferencia';
  if (code === 'CREDITO') return 'Crédito';
  return 'Efectivo';
}

function toneBySigned(value) {
  const amount = Number(value || 0);
  if (amount > 0) return 'text-emerald-600';
  if (amount < 0) return 'text-red-600';
  return 'text-slate-500';
}

function toneByMargin(value) {
  const amount = Number(value || 0);
  if (amount < 0) return 'text-red-600';
  if (amount < 20) return 'text-amber-600';
  return 'text-emerald-600';
}

function formatSignedMoneyWithPrefix(centavos) {
  const amount = Number(centavos || 0);
  if (amount > 0) return `+${formatCentavos(amount)}`;
  if (amount < 0) return `-${formatCentavos(Math.abs(amount))}`;
  return formatCentavos(0);
}

export default function ReportesVentasSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const view = useReportesStore((state) => state.views.ventasPanel);
  const redondeoView = useReportesStore((state) => state.views.redondeoComercial);
  const [filters, setFilters] = useState(createDefaultSalesFilters);
  const [roundingTab, setRoundingTab] = useState('resumen');
  const [exportState, setExportState] = useState({ csv: false, pdf: false, error: '' });
  const debouncedFilters = useDebouncedValue(filters, 280);

  useEffect(() => {
    const payload = {
      fecha_inicio: debouncedFilters.fecha_inicio,
      fecha_fin: debouncedFilters.fecha_fin,
      metodo_pago: debouncedFilters.metodo_pago || undefined,
      usuario_id: debouncedFilters.usuario_id || undefined
    };
    cargarReporte('ventasPanel', payload);
    cargarReporte('redondeoComercial', payload);
  }, [cargarReporte, debouncedFilters]);

  const data = view.data;
  const loading = view.loading;
  const error = view.error;
  const resumen = data?.resumen || {};
  const graficos = data?.graficos || {};
  const tablas = data?.tablas || {};
  const redondeo = redondeoView.data?.resumen || {};
  const redondeoComparativas = redondeoView.data?.comparativas || {};
  const redondeoAlertas = redondeoView.data?.alertas || {};
  const redondeoPorCajero = redondeoView.data?.por_cajero || [];
  const redondeoPorTurno = redondeoView.data?.por_turno || [];
  const redondeoPorDia = redondeoView.data?.por_dia || [];
  const redondeoPorProducto = redondeoView.data?.por_producto || [];
  const usuarios = data?.opciones?.usuarios || [];

  const chartVentasDia = useMemo(() => (
    (graficos.ventas_por_dia || []).map((row) => ({
      label: new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short' }).format(new Date(`${row.fecha}T00:00:00`)),
      actual: Number(row.total_ventas_centavos || 0),
      anterior: Number(row.total_periodo_anterior_centavos || 0)
    }))
  ), [graficos.ventas_por_dia]);

  const chartVentasHora = useMemo(() => (
    (graficos.ventas_por_hora || []).map((row) => ({
      label: row.hora,
      value: Number(row.total_ventas_centavos || 0)
    }))
  ), [graficos.ventas_por_hora]);

  const methodsData = useMemo(() => (
    (graficos.metodos_pago || []).map((row) => ({
      codigo: row.codigo,
      label: paymentLabel(row.codigo),
      value: Number(row.total_centavos || 0),
      cantidad: Number(row.cantidad || 0)
    }))
  ), [graficos.metodos_pago]);

  const kpis = [
    { label: 'Ventas Netas', value: formatCentavos(resumen.ventas_netas_centavos), icon: PiCashRegister },
    { label: 'Utilidad', value: formatCentavos(resumen.utilidad_centavos), icon: PiChartBar, toneClass: toneBySigned(resumen.utilidad_centavos) },
    { label: 'Margen', value: formatPercent(resumen.margen_porcentaje), icon: PiPercent, toneClass: toneByMargin(resumen.margen_porcentaje) },
    { label: 'Ticket Promedio', value: formatCentavos(resumen.ticket_promedio_centavos), icon: PiWallet },
    { label: 'Número de Ventas', value: formatNumber(resumen.numero_ventas), icon: PiReceipt },
    {
      label: 'Variación vs período anterior',
      value: formatSignedPercent(resumen.variacion_vs_periodo_anterior_porcentaje),
      icon: PiTrendUp,
      toneClass: toneBySigned(resumen.variacion_vs_periodo_anterior_porcentaje)
    }
  ];

  const rangeLabel = `${filters.fecha_inicio} - ${filters.fecha_fin}`;
  const redondeoSeries = useMemo(() => (
    redondeoPorDia.map((row) => ({
      label: formatDateLabel(row.fecha),
      value: Number(row.total_redondeo_centavos || 0)
    }))
  ), [redondeoPorDia]);
  const redondeoProductSeries = useMemo(() => (
    redondeoPorProducto.slice(0, 10).map((row) => ({
      label: row.nombre,
      value: Number(row.total_redondeo_centavos || 0)
    }))
  ), [redondeoPorProducto]);
  const redondeoCajeroSeries = useMemo(() => (
    redondeoPorCajero.slice(0, 10).map((row) => ({
      label: row.usuario_nombre,
      value: Number(row.total_redondeo_centavos || 0)
    }))
  ), [redondeoPorCajero]);
  const exportParams = {
    fecha_inicio: filters.fecha_inicio,
    fecha_fin: filters.fecha_fin,
    metodo_pago: filters.metodo_pago || undefined,
    usuario_id: filters.usuario_id || undefined
  };
  async function exportRedondeo(format) {
    const key = format === 'pdf' ? 'pdf' : 'csv';
    try {
      setExportState((prev) => ({ ...prev, [key]: true, error: '' }));
      await exportReporteArchivo('redondeo_comercial', { ...exportParams, vista: roundingTab }, format);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Exportación redondeo falló', {
        format,
        vista: roundingTab,
        filtros: exportParams,
        error: error?.message || String(error)
      });
      setExportState((prev) => ({ ...prev, error: error?.message || 'No se pudo iniciar la exportación.' }));
    } finally {
      setExportState((prev) => ({ ...prev, [key]: false }));
    }
  }
  const hasComparablePrevious = chartVentasDia.some((row) => Number(row.anterior || 0) !== 0);

  if (loading && !data) {
    return <LoadingState label="Construyendo análisis de ventas..." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ventas"
        description="Análisis comercial y rendimiento"
        actions={(
          <div className="grid gap-2 md:grid-cols-3">
            <Select
              value={filters.quick}
              onChange={(event) => {
                const quick = event.target.value;
                if (quick === 'custom') {
                  setFilters((prev) => ({ ...prev, quick }));
                  return;
                }
                const nextRange = buildRangeFromQuick(quick, businessTodayString());
                setFilters((prev) => ({ ...prev, quick, ...nextRange }));
              }}
            >
              {QUICK_RANGE_OPTIONS.filter((option) => ['last7', 'last30', 'today', 'custom'].includes(option.key)).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.key === 'last7' ? 'Últimos 7 días' : option.key === 'last30' ? 'Últimos 30 días' : option.label}
                </option>
              ))}
            </Select>

            <Select
              value={filters.metodo_pago}
              onChange={(event) => setFilters((prev) => ({ ...prev, metodo_pago: event.target.value }))}
            >
              <option value="">Método de pago</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CREDITO">Crédito</option>
            </Select>

            <Select
              value={filters.usuario_id}
              onChange={(event) => setFilters((prev) => ({ ...prev, usuario_id: event.target.value }))}
            >
              <option value="">Usuario</option>
              {usuarios.map((usuario) => (
                <option key={usuario.usuario_id} value={usuario.usuario_id}>{usuario.usuario}</option>
              ))}
            </Select>
          </div>
        )}
      />

      {filters.quick === 'custom' ? (
        <Panel className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Fecha inicio">
            <Input
              type="date"
              value={filters.fecha_inicio}
              onChange={(event) => setFilters((prev) => ({ ...prev, fecha_inicio: event.target.value }))}
            />
          </Field>
          <Field label="Fecha fin">
            <Input
              type="date"
              value={filters.fecha_fin}
              onChange={(event) => setFilters((prev) => ({ ...prev, fecha_fin: event.target.value }))}
            />
          </Field>
        </Panel>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <kpi.icon />
              </span>
              <div className="min-w-0">
                <p className={`text-xl font-bold ${kpi.toneClass || 'text-[var(--color-text)]'}`}>{kpi.value}</p>
                <p className="text-sm text-[var(--color-text-muted)]">{kpi.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* <Panel className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {[
              ['resumen', 'Resumen'],
              ['producto', 'Por producto'],
              ['cajero', 'Por cajero'],
              ['turno', 'Por turno'],
              ['tendencia', 'Tendencias']
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRoundingTab(key)}
                className={`rounded-full px-3 py-1 text-sm ${roundingTab === key ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={exportState.csv || exportState.pdf}
              onClick={() => exportRedondeo('csv')}
              className="h-9 rounded-lg bg-[#181818] px-3 text-sm text-white hover:bg-[#111827] active:bg-[#0F172A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exportState.csv ? 'Exportando CSV...' : 'Exportar CSV'}
            </button>
            <button
              type="button"
              disabled={exportState.csv || exportState.pdf}
              onClick={() => exportRedondeo('pdf')}
              className="h-9 rounded-lg bg-[#181818] px-3 text-sm text-white hover:bg-[#111827] active:bg-[#0F172A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exportState.pdf ? 'Exportando PDF...' : 'Exportar PDF'}
            </button>
          </div>
        </div>
        {exportState.error ? <Alert tone="error">{exportState.error}</Alert> : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">Total generado por redondeo</p>
            <p className="text-xl font-bold text-[var(--color-text)]">{formatCentavos(redondeo.total_redondeo_centavos || 0)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">Ventas con redondeo</p>
            <p className="text-xl font-bold text-[var(--color-text)]">{formatNumber(redondeo.ventas_con_redondeo || 0)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">Promedio por venta</p>
            <p className="text-xl font-bold text-[var(--color-text)]">{formatCentavos(redondeo.promedio_redondeo_por_venta_centavos || 0)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">% ventas con redondeo</p>
            <p className="text-xl font-bold text-[var(--color-text)]">{formatPercent(redondeo.porcentaje_ventas_con_redondeo || 0)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">Promedio por producto</p>
            <p className="text-xl font-bold text-[var(--color-text)]">{formatCentavos(redondeo.promedio_redondeo_por_producto_centavos || 0)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">Hoy vs período anterior</p>
            <p className={`text-xl font-bold ${toneBySigned(redondeoComparativas.variacion_centavos)}`}>{formatSignedPercent(redondeoComparativas.variacion_porcentaje || 0)}</p>
          </div>
        </div>

        {Array.isArray(redondeoAlertas.items) && redondeoAlertas.items.length > 0 ? (
          <Alert tone="warning">
            {redondeoAlertas.items.length} alertas operativas detectadas por umbral de redondeo.
          </Alert>
        ) : null}

        {roundingTab === 'resumen' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartPanel title="Tendencia diaria de redondeo" subtitle="Impacto neto por día (ventas - devoluciones - anulaciones).">
              <VerticalBarChart data={redondeoSeries} yType="money" label="Redondeo" />
            </ChartPanel>
            <ChartPanel title="Top productos por redondeo" subtitle="Top 10 productos con mayor impacto.">
              <VerticalBarChart data={redondeoProductSeries} yType="money" label="Redondeo" />
            </ChartPanel>
          </div>
        ) : null}

        {roundingTab === 'cajero' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartPanel title="Redondeo por cajero" subtitle="Top 10 cajeros por impacto de redondeo.">
              <VerticalBarChart data={redondeoCajeroSeries} yType="money" label="Redondeo" />
            </ChartPanel>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell as="th">Cajero</TableCell>
                  <TableCell as="th" className="text-right">Ventas</TableCell>
                  <TableCell as="th" className="text-right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody emptyColSpan={3} emptyMessage="Sin datos por cajero.">
                {redondeoPorCajero.slice(0, 15).map((row) => (
                  <TableRow key={row.usuario_id || row.usuario_nombre}>
                    <TableCell>{row.usuario_nombre}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.ventas)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCentavos(row.total_redondeo_centavos)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {roundingTab === 'turno' ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell as="th">Turno</TableCell>
                <TableCell as="th" className="text-right">Ventas</TableCell>
                <TableCell as="th" className="text-right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody emptyColSpan={3} emptyMessage="Sin datos por turno.">
              {redondeoPorTurno.slice(0, 15).map((row) => (
                <TableRow key={row.turno_id || row.cajero_turno}>
                  <TableCell>{row.cajero_turno}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.ventas)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCentavos(row.total_redondeo_centavos)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {roundingTab === 'tendencia' ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell as="th">Fecha</TableCell>
                <TableCell as="th" className="text-right">Ventas</TableCell>
                <TableCell as="th" className="text-right">Impacto</TableCell>
              </TableRow>
            </TableHead>
            <TableBody emptyColSpan={3} emptyMessage="Sin serie diaria para filtros.">
              {redondeoPorDia.map((row) => (
                <TableRow key={row.fecha}>
                  <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.ventas)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCentavos(row.total_redondeo_centavos)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {roundingTab === 'producto' ? (
          <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Redondeo por producto</h3>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell as="th">Producto</TableCell>
                <TableCell as="th" className="text-right">Veces</TableCell>
                <TableCell as="th" className="text-right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody emptyColSpan={3} emptyMessage="Sin datos de redondeo.">
              {redondeoPorProducto.slice(0, 12).map((row) => (
                <TableRow key={row.producto_id}>
                  <TableCell>{row.codigo} {row.nombre}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.veces_redondeado)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCentavos(row.total_redondeo_centavos)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        ) : null}
      </Panel> */}

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <ChartPanel
          title="Ventas por día"
          subtitle={hasComparablePrevious
            ? `Período actual (${rangeLabel}) vs período anterior equivalente`
            : 'Período actual sin comparativa válida'}
        >
          <MultiLineChart
            data={chartVentasDia}
            lines={[
              { key: 'actual', label: `Período actual (${rangeLabel})`, color: '#0f766e' },
              ...(hasComparablePrevious ? [{ key: 'anterior', label: 'Período anterior', color: '#94a3b8' }] : [])
            ]}
            yType="money"
          />
        </ChartPanel>

        <ChartPanel title="Ventas por hora" subtitle="Distribución para detectar horas pico.">
          <VerticalBarChart data={chartVentasHora} yType="money" label="Ventas" />
        </ChartPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <Panel className="p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Últimas ventas</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Lectura operativa del período filtrado.</p>
          </div>
          {(tablas.ultimas_ventas || []).length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin ventas en el período" description="No hay operaciones para los filtros seleccionados." />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell as="th">Factura</TableCell>
                  <TableCell as="th">Cliente</TableCell>
                  <TableCell as="th">Método</TableCell>
                  <TableCell as="th">Total</TableCell>
                  <TableCell as="th">Usuario</TableCell>
                </TableRow>
              </TableHead>
              <TableBody emptyColSpan={5} emptyMessage="Sin ventas.">
                {(tablas.ultimas_ventas || []).map((row) => (
                  <TableRow key={row.venta_id}>
                    <TableCell>{row.factura}</TableCell>
                    <TableCell>{row.cliente}</TableCell>
                    <TableCell>{paymentLabel(row.metodo_pago)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-semibold ${toneBySigned(row.total_ventas_centavos)}`}>
                        {formatSignedMoneyWithPrefix(row.total_ventas_centavos)}
                      </span>
                    </TableCell>
                    <TableCell>{row.usuario}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>

        <ChartPanel title="Métodos de pago" subtitle="Mix comercial del período seleccionado.">
          <div className="space-y-3">
            <div className="h-[220px]">
              <PaymentDonutChart data={methodsData} />
            </div>
            <div className="space-y-2">
              {methodsData.map((item) => (
                <div key={item.codigo} className="flex items-center justify-between rounded-lg bg-[var(--color-surface-subtle)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />
                    <span className="text-sm font-medium text-[var(--color-text)]">{item.label}</span>
                    <span className="text-xs text-slate-500">{item.cantidad} pagos</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">{formatCentavos(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartPanel>
      </div>

      <Panel className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">Top 15 productos más vendidos</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Contenedor compacto con scroll interno.</p>
          </div>
          <span className="text-sm text-[var(--color-text-muted)]">Ver top 15</span>
        </div>
        {(tablas.top_productos || []).length === 0 ? (
          <div className="p-4">
            <EmptyState title="Sin top de productos" description="No hay productos vendidos para los filtros actuales." />
          </div>
        ) : (
          <div className="max-h-[340px] overflow-y-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell as="th">#</TableCell>
                  <TableCell as="th">Producto</TableCell>
                  <TableCell as="th">Cantidad</TableCell>
                  <TableCell as="th" className="text-right">
                    Total
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody emptyColSpan={4} emptyMessage="Sin productos.">
                {(tablas.top_productos || []).map((row) => (
                  <TableRow key={row.producto_id}>
                    <TableCell>{row.ranking}</TableCell>
                    <TableCell>{row.codigo} {row.nombre}</TableCell>
                    <TableCell>{formatNumber(row.cantidad_vendida)} {row.unidad_medida}</TableCell>
                    <TableCell className={`text-right font-semibold ${toneBySigned(row.total_vendido_centavos)}`}>{formatCentavos(row.total_vendido_centavos)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {loading ? <div className="text-sm text-[var(--color-text-muted)]">Actualizando ventas...</div> : null}
    </div>
  );
}
