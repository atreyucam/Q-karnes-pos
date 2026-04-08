import { useEffect, useState } from 'react';
import { PiChartBar, PiPackage, PiWallet } from 'react-icons/pi';
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
  formatNumber,
  formatPercent,
  formatQuantity,
  monthStartString,
  todayString
} from './reportesUtils';

function defaultFilters() {
  return {
    fecha_inicio: monthStartString(),
    fecha_fin: todayString()
  };
}

export default function VentasPorProductoReport() {
  const view = useReportesStore((state) => state.views.ventasPorProducto);
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const [filters, setFilters] = useState(defaultFilters);

  useEffect(() => {
    if (!view.loaded) {
      cargarReporte('ventasPorProducto', defaultFilters());
    }
  }, [cargarReporte, view.loaded]);

  const data = view.data;
  const resumen = data?.resumen || {};
  const items = data?.items || [];

  const cards = [
    { label: 'Productos', value: formatNumber(resumen.productos), icon: PiPackage },
    { label: 'Ingreso', value: formatCentavos(resumen.ingreso_total_centavos), icon: PiChartBar },
    { label: 'Costo', value: formatCentavos(resumen.costo_total_centavos), icon: PiWallet },
    { label: 'Utilidad', value: formatCentavos(resumen.utilidad_centavos), icon: PiChartBar }
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

          <Button onClick={() => cargarReporte('ventasPorProducto', filters)} disabled={view.loading}>
            Consultar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const reset = defaultFilters();
              setFilters(reset);
              cargarReporte('ventasPorProducto', reset);
            }}
            disabled={view.loading}
          >
            Reiniciar
          </Button>
        </div>
      </Card>

      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !data ? <LoadingState label="Consultando ventas por producto..." /> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <MetricTile key={card.label} icon={card.icon} value={card.value} label={card.label} tone="primary" />
            ))}
          </div>

          <Card className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Rentabilidad por producto</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Totales historicos por producto enviados por backend</p>
            </div>

            {items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Sin datos para este periodo"
                  description="No se encontraron ventas por producto con los filtros actuales."
                />
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
                  {items.map((row) => (
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
        </>
      ) : null}
    </div>
  );
}
