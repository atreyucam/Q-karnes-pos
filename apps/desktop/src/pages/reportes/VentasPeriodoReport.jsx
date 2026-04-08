import { useEffect, useState } from 'react';
import { PiCashRegister, PiChartBar, PiReceipt, PiWallet } from 'react-icons/pi';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  MetricTile,
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
  monthStartString,
  todayString
} from './reportesUtils';

function defaultFilters() {
  return {
    fecha_inicio: monthStartString(),
    fecha_fin: todayString()
  };
}

export default function VentasPeriodoReport() {
  const view = useReportesStore((state) => state.views.ventasPeriodo);
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const [filters, setFilters] = useState(defaultFilters);

  useEffect(() => {
    if (!view.loaded) {
      cargarReporte('ventasPeriodo', defaultFilters());
    }
  }, [cargarReporte, view.loaded]);

  const data = view.data;
  const resumen = data?.resumen || {};
  const ventas = data?.ventas || [];

  const metrics = [
    { label: 'Total ventas', value: formatCentavos(resumen.total_ventas_centavos), icon: PiCashRegister },
    { label: 'Costo', value: formatCentavos(resumen.total_costo_centavos), icon: PiWallet },
    { label: 'Utilidad', value: formatCentavos(resumen.utilidad_centavos), icon: PiChartBar },
    { label: 'Margen', value: formatPercent(resumen.margen_porcentaje), icon: PiChartBar },
    { label: 'Numero de ventas', value: formatNumber(resumen.numero_ventas), icon: PiReceipt }
  ];

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha inicio
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha_inicio}
              onChange={(event) => setFilters((state) => ({ ...state, fecha_inicio: event.target.value }))}
            />
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha fin
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha_fin}
              onChange={(event) => setFilters((state) => ({ ...state, fecha_fin: event.target.value }))}
            />
          </label>

          <Button onClick={() => cargarReporte('ventasPeriodo', filters)} disabled={view.loading}>
            Consultar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const reset = defaultFilters();
              setFilters(reset);
              cargarReporte('ventasPeriodo', reset);
            }}
            disabled={view.loading}
          >
            Reiniciar
          </Button>
        </div>
      </Card>

      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !data ? <LoadingState label="Consultando ventas por periodo..." /> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {metrics.map((card) => (
              <MetricTile key={card.label} icon={card.icon} value={card.value} label={card.label} tone="primary" />
            ))}
          </div>

          <Card className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Ventas del periodo</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Totales emitidos por venta sin recalculo en frontend</p>
            </div>

            {ventas.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin ventas para este periodo" description="Ajuste el rango para ampliar la consulta." />
              </div>
            ) : (
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Fecha</TablaCelda>
                    <TablaCelda as="th">Referencia</TablaCelda>
                    <TablaCelda as="th">Usuario</TablaCelda>
                    <TablaCelda as="th">Total</TablaCelda>
                    <TablaCelda as="th">Costo</TablaCelda>
                    <TablaCelda as="th">Utilidad</TablaCelda>
                    <TablaCelda as="th">Margen</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {ventas.map((row) => (
                    <TablaFila key={row.venta_id}>
                      <TablaCelda>{formatDateLabel(row.fecha)}</TablaCelda>
                      <TablaCelda>{row.referencia}</TablaCelda>
                      <TablaCelda>{row.usuario}</TablaCelda>
                      <TablaCelda>{formatCentavos(row.total_ventas_centavos)}</TablaCelda>
                      <TablaCelda>{formatCentavos(row.total_costo_centavos)}</TablaCelda>
                      <TablaCelda>{formatCentavos(row.utilidad_centavos)}</TablaCelda>
                      <TablaCelda>{formatPercent(row.margen_porcentaje)}</TablaCelda>
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
