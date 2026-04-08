import { useEffect, useState } from 'react';
import { PiCashRegister, PiReceipt, PiWallet } from 'react-icons/pi';
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
  formatSignedCentavos,
  todayString
} from './reportesUtils';

function defaultFilters() {
  return { fecha: todayString() };
}

function MovementTable({ title, rows, emptyDescription }) {
  return (
    <Card className="p-0">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <h3 className="text-lg font-semibold text-[var(--color-text)]">{title}</h3>
      </div>

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Sin movimientos" description={emptyDescription} />
        </div>
      ) : (
        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Tipo</TablaCelda>
              <TablaCelda as="th">Concepto</TablaCelda>
              <TablaCelda as="th">Modulo</TablaCelda>
              <TablaCelda as="th">Usuario</TablaCelda>
              <TablaCelda as="th">Monto</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {rows.map((row) => (
              <TablaFila key={row.movimiento_id}>
                <TablaCelda>{formatDateLabel(row.fecha)}</TablaCelda>
                <TablaCelda>{row.tipo}</TablaCelda>
                <TablaCelda>{row.descripcion}</TablaCelda>
                <TablaCelda>{row.modulo_origen || '-'}</TablaCelda>
                <TablaCelda>{row.usuario}</TablaCelda>
                <TablaCelda className={row.sentido === 'INGRESO' ? 'text-success' : 'text-danger'}>
                  {formatSignedCentavos(row.sentido === 'INGRESO' ? row.monto_centavos : -row.monto_centavos)}
                </TablaCelda>
              </TablaFila>
            ))}
          </TablaCuerpo>
        </Tabla>
      )}
    </Card>
  );
}

export default function CajaDiariaReport() {
  const view = useReportesStore((state) => state.views.cajaDiaria);
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const [filters, setFilters] = useState(defaultFilters);

  useEffect(() => {
    if (!view.loaded) {
      cargarReporte('cajaDiaria', defaultFilters());
    }
  }, [cargarReporte, view.loaded]);

  const data = view.data;
  const resumen = data?.resumen || {};
  const turnos = data?.turnos || [];
  const movimientosSaldo = data?.movimientos_afectan_saldo || [];
  const movimientosInfo = data?.movimientos_informativos || [];

  const metrics = [
    { label: 'Saldo inicial', value: formatCentavos(resumen.saldo_inicial_centavos), icon: PiWallet },
    { label: 'Ingresos efectivo', value: formatCentavos(resumen.ingresos_efectivo_centavos), icon: PiCashRegister },
    { label: 'Egresos', value: formatCentavos(resumen.egresos_centavos), icon: PiWallet },
    { label: 'Saldo esperado', value: formatCentavos(resumen.saldo_esperado_centavos), icon: PiReceipt },
    { label: 'Saldo real', value: formatCentavos(resumen.saldo_real_centavos), icon: PiReceipt },
    { label: 'Diferencia', value: formatSignedCentavos(resumen.diferencia_centavos), icon: PiCashRegister }
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

          <Button onClick={() => cargarReporte('cajaDiaria', filters)} disabled={view.loading}>
            Consultar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const reset = defaultFilters();
              setFilters(reset);
              cargarReporte('cajaDiaria', reset);
            }}
            disabled={view.loading}
          >
            Hoy
          </Button>
        </div>
      </Card>

      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !data ? <LoadingState label="Consultando caja diaria..." /> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metrics.map((card) => (
              <MetricTile key={card.label} icon={card.icon} value={card.value} label={card.label} tone="primary" />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <MovementTable
              title="Movimientos que afectan saldo"
              rows={movimientosSaldo}
              emptyDescription="No se registraron movimientos de efectivo para esta fecha."
            />
            <MovementTable
              title="Movimientos informativos"
              rows={movimientosInfo}
              emptyDescription="No se registraron movimientos informativos para esta fecha."
            />
          </div>

          <Card className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Turnos del dia</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Detalle de apertura, cierre y conteo real</p>
            </div>

            {turnos.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin turnos registrados" description="No se encontraron aperturas de caja para la fecha seleccionada." />
              </div>
            ) : (
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Usuario</TablaCelda>
                    <TablaCelda as="th">Apertura</TablaCelda>
                    <TablaCelda as="th">Cierre</TablaCelda>
                    <TablaCelda as="th">Fondo inicial</TablaCelda>
                    <TablaCelda as="th">Contado real</TablaCelda>
                    <TablaCelda as="th">Diferencia</TablaCelda>
                    <TablaCelda as="th">Estado</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {turnos.map((row) => (
                    <TablaFila key={row.turno_id}>
                      <TablaCelda>{row.usuario}</TablaCelda>
                      <TablaCelda>{formatDateLabel(row.fecha_apertura)}</TablaCelda>
                      <TablaCelda>{row.fecha_cierre ? formatDateLabel(row.fecha_cierre) : '-'}</TablaCelda>
                      <TablaCelda>{formatCentavos(row.fondo_inicial_centavos)}</TablaCelda>
                      <TablaCelda>{row.efectivo_contado_centavos === null ? '-' : formatCentavos(row.efectivo_contado_centavos)}</TablaCelda>
                      <TablaCelda>{row.diferencia_centavos === null ? '-' : formatSignedCentavos(row.diferencia_centavos)}</TablaCelda>
                      <TablaCelda>
                        <StatusChip tone={row.estado === 'CERRADO' ? 'success' : 'warning'}>
                          {row.estado}
                        </StatusChip>
                      </TablaCelda>
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
