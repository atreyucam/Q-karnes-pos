import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  FiltersBar,
  Input,
  LoadingState,
  Select,
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
  formatPercent,
  formatQuantity,
  joinChildren,
  monthStartString,
  todayString
} from './reportesUtils';

function defaultFilters() {
  return {
    fecha_inicio: monthStartString(),
    fecha_fin: todayString(),
    estado: ''
  };
}

export default function TransformacionesReport() {
  const view = useReportesStore((state) => state.views.transformaciones);
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const [filters, setFilters] = useState(defaultFilters);

  useEffect(() => {
    if (!view.loaded) {
      cargarReporte('transformaciones', defaultFilters());
    }
  }, [cargarReporte, view.loaded]);

  const rows = view.data?.items || [];

  return (
    <div className="space-y-5">
      <FiltersBar
        actions={(
          <>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => {
                const reset = defaultFilters();
                setFilters(reset);
                cargarReporte('transformaciones', reset);
              }}
              disabled={view.loading}
            >
              Limpiar filtros
            </Button>
            <Button onClick={() => cargarReporte('transformaciones', filters)} disabled={view.loading}>
              Consultar
            </Button>
          </>
        )}
      >
        <Field label="Fecha de inicio">
          <Input
            type="date"
            value={filters.fecha_inicio}
            onChange={(event) => setFilters((state) => ({ ...state, fecha_inicio: event.target.value }))}
          />
        </Field>

        <Field label="Fecha de fin">
          <Input
            type="date"
            value={filters.fecha_fin}
            onChange={(event) => setFilters((state) => ({ ...state, fecha_fin: event.target.value }))}
          />
        </Field>

        <Field label="Estado">
          <Select
            value={filters.estado}
            onChange={(event) => setFilters((state) => ({ ...state, estado: event.target.value }))}
          >
            <option value="">Todos los estados</option>
            <option value="APLICADA">Aplicada</option>
            <option value="BORRADOR">Borrador</option>
            <option value="ANULADA">Anulada</option>
          </Select>
        </Field>
      </FiltersBar>

      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !view.data ? <LoadingState label="Consultando transformaciones..." /> : null}

      {view.data ? (
        <Card className="p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Transformaciones</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Padre, hijos, merma, rendimiento y conservacion de costo</p>
          </div>

          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin transformaciones para este rango" description="No se registraron operaciones con los filtros actuales." />
            </div>
          ) : (
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Padre</TablaCelda>
                  <TablaCelda as="th">Total consumido</TablaCelda>
                  <TablaCelda as="th">Hijos</TablaCelda>
                  <TablaCelda as="th">Merma</TablaCelda>
                  <TablaCelda as="th">Rendimiento</TablaCelda>
                  <TablaCelda as="th">Estado</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {rows.map((row) => (
                  <TablaFila key={row.id}>
                    <TablaCelda>{formatDateLabel(row.fecha)}</TablaCelda>
                    <TablaCelda>
                      <div className="space-y-1">
                        <p>{row.producto_padre.codigo} {row.producto_padre.nombre}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">Costo {formatCentavos(row.costo_total_padre_centavos)}</p>
                      </div>
                    </TablaCelda>
                    <TablaCelda>{formatQuantity(row.producto_padre.cantidad, row.producto_padre.unidad_medida, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>{joinChildren(row.productos_hijos)}</TablaCelda>
                    <TablaCelda>{formatQuantity(row.merma_total, row.producto_padre.unidad_medida, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>{formatPercent(row.rendimiento_porcentaje)}</TablaCelda>
                    <TablaCelda>
                      <StatusChip tone={row.estado === 'APLICADA' ? 'success' : row.estado === 'ANULADA' ? 'danger' : 'warning'}>
                        {row.estado}
                      </StatusChip>
                    </TablaCelda>
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
