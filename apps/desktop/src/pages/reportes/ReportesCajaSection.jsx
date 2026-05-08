import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiCashRegister, PiReceipt, PiWarningCircle, PiWallet } from 'react-icons/pi';
import {
  Alert,
  EmptyState,
  Field,
  MetricTile,
  Paginador,
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
import ReportDateFilters from './ReportesFilters';
import { ChartPanel, HorizontalBarChart, PaymentDonutChart } from './ReportesCharts';
import { exportRowsToCsv } from './reportesExport';
import {
  createDefaultQuickFilters,
  formatCentavos,
  formatDateLabel,
  formatSignedCentavos,
  sanitizeDateRange
} from './reportesUtils';
import { useReportTablePagination } from './useReportTablePagination';

function mapMethod(code = '') {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return 'SIN_METODO';
  if (normalized === 'CREDITO_CLIENTE') return 'CRÉDITO';
  return normalized;
}

export default function ReportesCajaSection() {
  const cargarReporte = useReportesStore((state) => state.cargarReporte);
  const views = useReportesStore((state) => state.views);
  const [filters, setFilters] = useState(() => ({
    ...createDefaultQuickFilters('today'),
    turno_id: '',
    usuario: '',
    tipo: ''
  }));

  const loadSection = useCallback(async (currentFilters) => {
    const range = sanitizeDateRange(currentFilters);
    await Promise.all([
      cargarReporte('caja', range, true),
      cargarReporte('cajaDiaria', { fecha: range.fecha_fin }, true)
    ]);
  }, [cargarReporte]);

  useEffect(() => {
    loadSection(filters);
  }, [filters, loadSection]);

  const loading = views.caja.loading || views.cajaDiaria.loading;
  const error = views.caja.error || views.cajaDiaria.error;
  const hasData = Boolean(views.caja.data || views.cajaDiaria.data);

  const cajaRangeRows = views.caja.data?.items || [];
  const dayRows = views.cajaDiaria.data?.movimientos_afectan_saldo || [];
  const dayInfoRows = views.cajaDiaria.data?.movimientos_informativos || [];
  const turnos = views.cajaDiaria.data?.turnos || [];
  const resumen = views.cajaDiaria.data?.resumen || {};

  const users = useMemo(() => {
    const map = new Set();
    for (const row of cajaRangeRows) {
      const name = String(row.usuario || '').trim();
      if (name) map.add(name);
    }
    return Array.from(map);
  }, [cajaRangeRows]);

  const filteredRangeRows = useMemo(() => {
    return cajaRangeRows.filter((row) => {
      if (filters.turno_id && Number(row.turno_id || 0) !== Number(filters.turno_id)) return false;
      if (filters.usuario && row.usuario !== filters.usuario) return false;
      if (filters.tipo && String(row.tipo_movimiento || '').toUpperCase() !== filters.tipo) return false;
      return true;
    });
  }, [cajaRangeRows, filters.turno_id, filters.usuario, filters.tipo]);

  const ventasCobradas = dayRows.filter((row) => {
    const type = String(row.tipo || '').toUpperCase();
    return type.includes('VENTA');
  });

  const paymentRows = useMemo(() => {
    const grouped = new Map();
    for (const row of ventasCobradas) {
      const key = mapMethod(row.metodo_pago);
      grouped.set(key, Number(grouped.get(key) || 0) + Number(row.monto_centavos || 0));
    }
    return Array.from(grouped.entries()).map(([label, value]) => ({ label, value }));
  }, [ventasCobradas]);

  const turnosDiffChart = turnos.map((turno) => ({
    label: `Turno ${turno.turno_id}`,
    value: Number(turno.diferencia_centavos || 0)
  }));

  const totalVentasCobradas = ventasCobradas.reduce((acc, row) => acc + Number(row.monto_centavos || 0), 0);
  const saldoContado = Number(resumen.saldo_real_centavos || 0);

  const kpis = [
    { label: 'Apertura', value: formatCentavos(resumen.saldo_inicial_centavos), icon: PiWallet },
    { label: 'Ventas cobradas', value: formatCentavos(totalVentasCobradas), icon: PiCashRegister },
    { label: 'Egresos', value: formatCentavos(resumen.egresos_centavos), icon: PiReceipt },
    { label: 'Saldo esperado', value: formatCentavos(resumen.saldo_esperado_centavos), icon: PiCashRegister },
    { label: 'Saldo contado', value: formatCentavos(saldoContado), icon: PiWallet },
    { label: 'Diferencia', value: formatSignedCentavos(resumen.diferencia_centavos), icon: PiWarningCircle }
  ];

  const rangePagination = useReportTablePagination(filteredRangeRows, 12);
  const ventasCobradasPagination = useReportTablePagination(ventasCobradas, 10);
  const turnosPagination = useReportTablePagination(turnos, 10);
  const dayInfoPagination = useReportTablePagination(dayInfoRows, 10);

  return (
    <div className="space-y-5">
      <ReportDateFilters
        filters={filters}
        setFilters={setFilters}
        loading={loading}
        submitLabel="Actualizar caja"
        showExport
        onSubmit={(next) => loadSection(next)}
        onExport={() => {
          const rows = filteredRangeRows.map((row) => ({
            fecha: formatDateLabel(row.fecha),
            tipo: row.tipo_movimiento,
            sentido: row.sentido,
            descripcion: row.descripcion,
            usuario: row.usuario,
            monto: formatCentavos(Math.round(Number(row.monto || 0) * 100))
          }));
          exportRowsToCsv('reportes-caja-movimientos.csv', [
            { key: 'fecha', label: 'Fecha' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'sentido', label: 'Sentido' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'usuario', label: 'Usuario' },
            { key: 'monto', label: 'Monto' }
          ], rows);
        }}
        extraFields={(
          <>
            <Field label="Turno">
              <Select value={filters.turno_id} onChange={(event) => setFilters((prev) => ({ ...prev, turno_id: event.target.value }))}>
                <option value="">Todos</option>
                {turnos.map((turno) => (
                  <option key={turno.turno_id} value={turno.turno_id}>Turno {turno.turno_id}</option>
                ))}
              </Select>
            </Field>

            <Field label="Usuario">
              <Select value={filters.usuario} onChange={(event) => setFilters((prev) => ({ ...prev, usuario: event.target.value }))}>
                <option value="">Todos</option>
                {users.map((user) => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </Select>
            </Field>

            <Field label="Tipo de movimiento">
              <Select value={filters.tipo} onChange={(event) => setFilters((prev) => ({ ...prev, tipo: event.target.value }))}>
                <option value="">Todos</option>
                <option value="VENTA_CONTADO">Venta contado</option>
                <option value="VENTA_TRANSFERENCIA">Venta transferencia</option>
                <option value="INGRESO_MANUAL">Ingreso manual</option>
                <option value="EGRESO_MANUAL">Egreso manual</option>
                <option value="COMPRA_CONTADO">Compra contado</option>
              </Select>
            </Field>
          </>
        )}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      {hasData ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {kpis.map((kpi) => (
              <MetricTile key={kpi.label} icon={kpi.icon} value={kpi.value} label={kpi.label} tone="primary" />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel title="Cobros por método de pago" subtitle="Solo movimientos de venta que afectan saldo.">
              <PaymentDonutChart data={paymentRows} />
            </ChartPanel>
            <ChartPanel title="Diferencia por turno" subtitle="Monitoreo de diferencias de cierre en turnos del día.">
              <HorizontalBarChart data={turnosDiffChart} xType="money" label="Diferencia" />
            </ChartPanel>
          </div>

          <Panel className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Movimientos de caja (rango)</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Ingresos y egresos operativos que impactan caja.</p>
            </div>
            {filteredRangeRows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin movimientos en este periodo" description="No hubo movimientos de caja para los filtros actuales." />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Fecha</TableCell>
                    <TableCell as="th">Tipo</TableCell>
                    <TableCell as="th">Sentido</TableCell>
                    <TableCell as="th">Descripción</TableCell>
                    <TableCell as="th">Usuario</TableCell>
                    <TableCell as="th">Monto</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyColSpan={6} emptyMessage="Sin movimientos para este rango.">
                  {rangePagination.pagedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                      <TableCell>{row.tipo_movimiento}</TableCell>
                      <TableCell>
                        <StatusChip tone={row.sentido === 'INGRESO' ? 'success' : 'danger'}>{row.sentido}</StatusChip>
                      </TableCell>
                      <TableCell>{row.descripcion}</TableCell>
                      <TableCell>{row.usuario}</TableCell>
                      <TableCell>{formatCentavos(Math.round(Number(row.monto || 0) * 100))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pb-4">
              <Paginador
                paginaActual={rangePagination.page}
                totalPaginas={rangePagination.totalPages}
                totalRegistros={rangePagination.totalRecords}
                mostrarSiempre
                onPageChange={rangePagination.setPage}
              />
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Ventas cobradas en caja (día)</h3>
              </div>
              {ventasCobradas.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Sin ventas cobradas" description="No hubo cobros registrados para la fecha operativa." />
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell as="th">Fecha</TableCell>
                      <TableCell as="th">Concepto</TableCell>
                      <TableCell as="th">Método</TableCell>
                      <TableCell as="th">Monto</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody emptyColSpan={4} emptyMessage="Sin cobros de ventas.">
                    {ventasCobradasPagination.pagedRows.map((row) => (
                      <TableRow key={row.movimiento_id}>
                        <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                        <TableCell>{row.descripcion}</TableCell>
                        <TableCell>{mapMethod(row.metodo_pago)}</TableCell>
                        <TableCell>{formatCentavos(row.monto_centavos)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                )}
                <div className="px-4 pb-4">
                  <Paginador
                    paginaActual={ventasCobradasPagination.page}
                    totalPaginas={ventasCobradasPagination.totalPages}
                    totalRegistros={ventasCobradasPagination.totalRecords}
                    mostrarSiempre
                    onPageChange={ventasCobradasPagination.setPage}
                  />
                </div>
              </Panel>

            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Turnos del día</h3>
              </div>
              {turnos.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Sin turnos del día" description="No se registraron aperturas para la fecha operativa." />
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell as="th">Turno</TableCell>
                      <TableCell as="th">Usuario</TableCell>
                      <TableCell as="th">Apertura</TableCell>
                      <TableCell as="th">Cierre</TableCell>
                      <TableCell as="th">Diferencia</TableCell>
                      <TableCell as="th">Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody emptyColSpan={6} emptyMessage="Sin turnos cargados.">
                    {turnosPagination.pagedRows.map((row) => (
                      <TableRow key={row.turno_id}>
                        <TableCell>#{row.turno_id}</TableCell>
                        <TableCell>{row.usuario}</TableCell>
                        <TableCell>{formatDateLabel(row.fecha_apertura)}</TableCell>
                        <TableCell>{row.fecha_cierre ? formatDateLabel(row.fecha_cierre) : '-'}</TableCell>
                        <TableCell>{row.diferencia_centavos === null ? '-' : formatSignedCentavos(row.diferencia_centavos)}</TableCell>
                        <TableCell>
                          <StatusChip tone={row.estado === 'CERRADO' ? 'success' : 'warning'}>{row.estado}</StatusChip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                )}
                <div className="px-4 pb-4">
                  <Paginador
                    paginaActual={turnosPagination.page}
                    totalPaginas={turnosPagination.totalPages}
                    totalRegistros={turnosPagination.totalRecords}
                    mostrarSiempre
                    onPageChange={turnosPagination.setPage}
                  />
                </div>
              </Panel>
          </div>

          {dayInfoRows.length > 0 ? (
            <Panel className="p-0">
              <div className="border-b border-[var(--color-border)] px-4 py-4">
                <h3 className="text-base font-semibold text-[var(--color-text)]">Movimientos informativos (día)</h3>
              </div>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Fecha</TableCell>
                    <TableCell as="th">Tipo</TableCell>
                    <TableCell as="th">Descripción</TableCell>
                    <TableCell as="th">Usuario</TableCell>
                    <TableCell as="th">Monto</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyColSpan={5} emptyMessage="Sin movimientos informativos.">
                  {dayInfoPagination.pagedRows.map((row) => (
                    <TableRow key={row.movimiento_id}>
                      <TableCell>{formatDateLabel(row.fecha)}</TableCell>
                      <TableCell>{row.tipo}</TableCell>
                      <TableCell>{row.descripcion}</TableCell>
                      <TableCell>{row.usuario}</TableCell>
                      <TableCell>{formatCentavos(row.monto_centavos)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 pb-4">
                <Paginador
                  paginaActual={dayInfoPagination.page}
                  totalPaginas={dayInfoPagination.totalPages}
                  totalRegistros={dayInfoPagination.totalRecords}
                  mostrarSiempre
                  onPageChange={dayInfoPagination.setPage}
                />
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
