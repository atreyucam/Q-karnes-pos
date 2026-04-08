import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  Select,
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaFila
} from '../../shared/ui';
import { formatQtyByUnit } from '../../lib/formatQty';
import { fetchProductosActivos } from '../../services/catalogoService';
import { useReportesStore } from '../../stores/reportesStore';
import {
  formatCentavos,
  formatDateLabel,
  formatKardexQuantity,
  formatOrigin,
  monthStartString,
  todayString
} from './reportesUtils';

const TIPO_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'VENTA', label: 'Venta' },
  { value: 'DEVOLUCION_VENTA', label: 'Devolucion' },
  { value: 'RECEPCION', label: 'Recepcion' },
  { value: 'AJUSTE_MASIVO', label: 'Ajuste' },
  { value: 'TRANSFORMACION_CONSUMO', label: 'Transformacion consumo' },
  { value: 'TRANSFORMACION_PRODUCCION', label: 'Transformacion produccion' }
];

function defaultFilters() {
  return {
    fecha_inicio: monthStartString(),
    fecha_fin: todayString(),
    producto_id: '',
    tipo: ''
  };
}

export default function KardexReport() {
  const view = useReportesStore((state) => state.views.kardex);
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const [filters, setFilters] = useState(defaultFilters);
  const [productos, setProductos] = useState([]);
  const [catalogoError, setCatalogoError] = useState(null);

  useEffect(() => {
    fetchProductosActivos()
      .then((items) => setProductos(Array.isArray(items) ? items : []))
      .catch((error) => setCatalogoError(error?.message || 'No se pudo cargar catalogo de productos.'));
  }, []);

  useEffect(() => {
    if (!view.loaded) {
      cargarReporte('kardex', defaultFilters());
    }
  }, [cargarReporte, view.loaded]);

  const rows = view.data?.items || [];

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="text-sm font-medium text-[var(--color-text)]">
            Producto
            <Select
              className="mt-1"
              value={filters.producto_id}
              onChange={(event) => setFilters((state) => ({ ...state, producto_id: event.target.value }))}
            >
              <option value="">Todos los productos</option>
              {productos.map((producto) => (
                <option key={producto.id} value={producto.id}>
                  {producto.codigo} {producto.nombre}
                </option>
              ))}
            </Select>
          </label>

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

          <label className="text-sm font-medium text-[var(--color-text)]">
            Tipo
            <Select
              className="mt-1"
              value={filters.tipo}
              onChange={(event) => setFilters((state) => ({ ...state, tipo: event.target.value }))}
            >
              {TIPO_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => cargarReporte('kardex', filters)} disabled={view.loading}>
            Consultar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const reset = defaultFilters();
              setFilters(reset);
              cargarReporte('kardex', reset);
            }}
            disabled={view.loading}
          >
            Reiniciar
          </Button>
        </div>
      </Card>

      {catalogoError ? <Alert tone="warning">{catalogoError}</Alert> : null}
      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !view.data ? <LoadingState label="Consultando kardex..." /> : null}

      {view.data ? (
        <Card className="p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Kardex de movimientos</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Trazabilidad cronologica del inventario</p>
          </div>

          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin movimientos para estos filtros" description="Cambie el producto o amplie el rango de fechas." />
            </div>
          ) : (
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Tipo</TablaCelda>
                  <TablaCelda as="th">Origen</TablaCelda>
                  <TablaCelda as="th">Cantidad</TablaCelda>
                  <TablaCelda as="th">Saldo</TablaCelda>
                  <TablaCelda as="th">Costo unitario</TablaCelda>
                  <TablaCelda as="th">Total</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {rows.map((row) => (
                  <TablaFila key={row.id}>
                    <TablaCelda>{formatDateLabel(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.codigo} {row.nombre}</TablaCelda>
                    <TablaCelda>{row.tipo_movimiento}</TablaCelda>
                    <TablaCelda>{formatOrigin(row.origen)}</TablaCelda>
                    <TablaCelda>{formatKardexQuantity(row)}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(row.saldo_resultante, row.unidad_medida, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>{formatCentavos(row.costo_unitario)}</TablaCelda>
                    <TablaCelda>{formatCentavos(row.costo_total_centavos)}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          )}
        </Card>
      ) : null}
    </div>
  );
}
