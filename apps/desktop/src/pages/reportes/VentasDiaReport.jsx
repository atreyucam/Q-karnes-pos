import { useEffect, useState } from 'react';
import {
  PiCalendarBlank,
  PiCashRegister,
  PiChartBar,
  PiReceipt,
  PiWallet
} from 'react-icons/pi';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  MetricTile,
  StatusChip,
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaFila
} from '../../shared/ui';
import { useReportesStore } from '../../stores/reportesStore';
import {
  formatCentavos,
  formatDateLabel,
  formatNumber,
  formatPercent,
  formatSignedCentavos,
  formatSignedNumber,
  formatSignedPercent,
  formatQuantity,
  todayString
} from './reportesUtils';

function defaultFilters() {
  return { fecha: todayString() };
}

function ComparisonCard({ title, comparison }) {
  const metrics = comparison?.metricas || {};
  const entries = [
    { label: 'Ventas', value: metrics.total_ventas, formatter: formatSignedCentavos },
    { label: 'Costo', value: metrics.total_costo, formatter: formatSignedCentavos },
    { label: 'Utilidad', value: metrics.utilidad, formatter: formatSignedCentavos },
    { label: 'Numero ventas', value: metrics.numero_ventas, formatter: formatSignedNumber },
    { label: 'Ticket promedio', value: metrics.ticket_promedio, formatter: formatSignedCentavos }
  ];

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Base {comparison?.fecha_base || '-'}</p>
        </div>
        <StatusChip tone={comparison ? 'info' : 'warning'}>{comparison?.etiqueta || 'Sin base'}</StatusChip>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {entries.map((entry) => (
          <div key={`${title}-${entry.label}`} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{entry.label}</p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">
              {entry.formatter(entry.value?.diferencia)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Variacion {formatSignedPercent(entry.value?.variacion_porcentaje)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function VentasDiaReport() {
  const view = useReportesStore((state) => state.views.ventasDia);
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const [filters, setFilters] = useState(defaultFilters);

  useEffect(() => {
    if (!view.loaded) {
      cargarReporte('ventasDia', defaultFilters());
    }
  }, [cargarReporte, view.loaded]);

  const data = view.data;
  const resumen = data?.resumen || {};
  const pagos = data?.detalle?.ventas_por_metodo_pago || [];
  const productos = data?.detalle?.ventas_por_producto || [];
  const usuarios = data?.detalle?.ventas_por_usuario || [];

  const summaryCards = [
    { label: 'Total vendido', value: formatCentavos(resumen.total_ventas_centavos), icon: PiCashRegister },
    { label: 'Costo total', value: formatCentavos(resumen.total_costo_centavos), icon: PiWallet },
    { label: 'Utilidad', value: formatCentavos(resumen.utilidad_centavos), icon: PiChartBar },
    { label: 'Margen', value: formatPercent(resumen.margen_porcentaje), icon: PiChartBar },
    { label: 'Numero de ventas', value: formatNumber(resumen.numero_ventas), icon: PiReceipt },
    { label: 'Ticket promedio', value: formatCentavos(resumen.ticket_promedio_centavos), icon: PiCashRegister }
  ];

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha operativa
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha}
              onChange={(event) => setFilters({ fecha: event.target.value })}
            />
          </label>

          <Button onClick={() => cargarReporte('ventasDia', filters)} disabled={view.loading}>
            Consultar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const reset = defaultFilters();
              setFilters(reset);
              cargarReporte('ventasDia', reset);
            }}
            disabled={view.loading}
          >
            Hoy
          </Button>
        </div>
      </Card>

      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !data ? <LoadingState label="Consultando ventas del dia..." /> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <MetricTile key={card.label} icon={card.icon} value={card.value} label={card.label} tone="primary" />
            ))}
          </div>

          <ComparisonCard title="Comparativa vs ayer" comparison={data?.comparativa?.vs_ayer} />
          <ComparisonCard title="Comparativa vs mismo dia semana pasada" comparison={data?.comparativa?.vs_mismo_dia_semana_pasada} />

          <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
            <Card className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--color-text)]">Ventas por metodo de pago</h3>
                  <p className="text-sm text-[var(--color-text-muted)]">Distribucion financiera emitida por backend</p>
                </div>
                <PiCalendarBlank className="text-lg text-[var(--color-info)]" />
              </div>

              {pagos.length === 0 ? (
                <EmptyState title="Sin desglose de pagos" description="No hay ventas para la fecha seleccionada." />
              ) : (
                <div className="space-y-3">
                  {pagos.map((row) => (
                    <div key={row.metodo_pago_codigo} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-[var(--color-text)]">{row.metodo_pago_codigo}</p>
                        <p className="text-base font-semibold text-[var(--color-text)]">{formatCentavos(row.total_ventas_centavos)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Top productos</h3>
                <p className="text-sm text-[var(--color-text-muted)]">Ingreso, costo y utilidad por producto</p>
              </div>

              {productos.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Sin productos vendidos" description="No hay productos para mostrar en esta fecha." />
                </div>
              ) : (
                <Tabla>
                  <TablaCabecera>
                    <tr>
                      <TablaCelda as="th">Producto</TablaCelda>
                      <TablaCelda as="th">Cantidad</TablaCelda>
                      <TablaCelda as="th">Ingreso</TablaCelda>
                      <TablaCelda as="th">Costo</TablaCelda>
                      <TablaCelda as="th">Utilidad</TablaCelda>
                      <TablaCelda as="th">Margen</TablaCelda>
                    </tr>
                  </TablaCabecera>
                  <TablaCuerpo>
                    {productos.map((row) => (
                      <TablaFila key={row.producto_id}>
                        <TablaCelda>{row.codigo} {row.nombre}</TablaCelda>
                        <TablaCelda>{formatQuantity(row.cantidad_vendida, row.unidad_medida, { fixedLB: true })}</TablaCelda>
                        <TablaCelda>{formatCentavos(row.ingreso_total_centavos)}</TablaCelda>
                        <TablaCelda>{formatCentavos(row.costo_total_centavos)}</TablaCelda>
                        <TablaCelda>{formatCentavos(row.utilidad_centavos)}</TablaCelda>
                        <TablaCelda>{formatPercent(row.margen_porcentaje)}</TablaCelda>
                      </TablaFila>
                    ))}
                  </TablaCuerpo>
                </Tabla>
              )}
            </Card>
          </div>

          <Card className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Ventas por usuario</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Detalle operativo complementario</p>
            </div>

            {usuarios.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin actividad de usuarios" description="No se registraron ventas para la fecha seleccionada." />
              </div>
            ) : (
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Usuario</TablaCelda>
                    <TablaCelda as="th">Ventas</TablaCelda>
                    <TablaCelda as="th">Total</TablaCelda>
                    <TablaCelda as="th">Utilidad</TablaCelda>
                    <TablaCelda as="th">Margen</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {usuarios.map((row, index) => (
                    <TablaFila key={`${row.usuario_id || row.usuario}-${index}`}>
                      <TablaCelda>{row.usuario}</TablaCelda>
                      <TablaCelda>{formatNumber(row.numero_ventas)}</TablaCelda>
                      <TablaCelda>{formatCentavos(row.total_ventas_centavos)}</TablaCelda>
                      <TablaCelda>{formatCentavos(row.utilidad_centavos)}</TablaCelda>
                      <TablaCelda>{formatPercent(row.margen_porcentaje)}</TablaCelda>
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>
            )}
          </Card>

          {view.loading && data ? <LoadingState label={`Actualizando datos del ${formatDateLabel(data.fecha)}...`} /> : null}
        </>
      ) : null}
    </div>
  );
}
