import { useEffect } from 'react';
import { PiPackage, PiWallet } from 'react-icons/pi';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricTile,
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaFila
} from '../../shared/ui';
import { useReportesStore } from '../../stores/reportesStore';
import { formatCentavos, formatNumber, formatQuantity } from './reportesUtils';

export default function InventarioActualReport() {
  const view = useReportesStore((state) => state.views.inventarioActual);
  const cargarReporte = useReportesStore((state) => state.cargarReporte);

  useEffect(() => {
    if (!view.loaded) {
      cargarReporte('inventarioActual');
    }
  }, [cargarReporte, view.loaded]);

  const data = view.data;
  const items = data?.items || [];
  const resumen = data?.resumen || {};

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Inventario valorizado</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Estado actual del inventario y su valor financiero visible</p>
        </div>
        <Button onClick={() => cargarReporte('inventarioActual')} disabled={view.loading}>
          Actualizar
        </Button>
      </Card>

      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !data ? <LoadingState label="Consultando inventario valorizado..." /> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <MetricTile icon={PiPackage} value={formatNumber(resumen.productos)} label="Productos valorizados" tone="primary" />
            <MetricTile icon={PiWallet} value={formatCentavos(resumen.valor_total_inventario_centavos)} label="Valor total inventario" tone="primary" />
          </div>

          <Card className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Detalle de existencias</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Costo promedio y valor total por producto</p>
            </div>

            {items.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin inventario para mostrar" description="No se encontraron productos valorizados." />
              </div>
            ) : (
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Producto</TablaCelda>
                    <TablaCelda as="th">Stock</TablaCelda>
                    <TablaCelda as="th">Unidad</TablaCelda>
                    <TablaCelda as="th">Costo visible</TablaCelda>
                    <TablaCelda as="th">Valor inventario</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {items.map((row) => (
                    <TablaFila key={row.producto_id}>
                      <TablaCelda>{row.codigo} {row.nombre}</TablaCelda>
                      <TablaCelda>{formatQuantity(row.stock_actual, row.unidad_medida, { fixedLB: true })}</TablaCelda>
                      <TablaCelda>{row.unidad_medida}</TablaCelda>
                      <TablaCelda>{formatCentavos(row.costo_promedio)}</TablaCelda>
                      <TablaCelda>{formatCentavos(row.valor_total_inventario_centavos)}</TablaCelda>
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
