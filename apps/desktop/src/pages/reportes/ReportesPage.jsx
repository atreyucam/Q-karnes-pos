import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Paginador,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../ui';
import { useReportesStore } from '../../stores/reportesStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';

const REPORT_TABS = [
  { key: 'ventas', label: 'Ventas', usesDateRange: true },
  { key: 'ventasProducto', label: 'Ventas por producto', usesDateRange: true },
  { key: 'inventario', label: 'Inventario actual', usesDateRange: false },
  { key: 'caja', label: 'Caja', usesDateRange: true },
  { key: 'cxc', label: 'Cuentas por cobrar', usesDateRange: false },
  { key: 'cxp', label: 'Cuentas por pagar', usesDateRange: false },
  { key: 'compras', label: 'Compras', usesDateRange: true }
];

const PAGE_SIZE = 12;

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartString() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function getDefaultFilters() {
  return {
    fecha_inicio: monthStartString(),
    fecha_fin: todayString()
  };
}

function getSummaryCards(tab, resumen = {}) {
  switch (tab) {
    case 'ventas':
      return [
        { label: 'Total ventas', value: formatMoney(resumen.total_ventas || 0) },
        { label: 'Total devuelto', value: formatMoney(resumen.total_devuelto || 0) },
        { label: 'Cantidad ventas', value: Number(resumen.cantidad_ventas || 0) }
      ];
    case 'ventasProducto':
      return [
        { label: 'Total vendido', value: formatMoney(resumen.total_vendido || 0) },
        { label: 'Cantidad total', value: Number(resumen.cantidad_vendida_total || 0).toFixed(2) },
        { label: 'Productos', value: Number(resumen.productos || 0) }
      ];
    case 'inventario':
      return [
        { label: 'Productos', value: Number(resumen.productos || 0) },
        { label: 'Bajo minimo', value: Number(resumen.productos_bajo_minimo || 0) },
        { label: 'Valorizado', value: formatMoney(resumen.valorizado_estimado || 0) },
        { label: 'Diferencias', value: Number(resumen.inconsistencias_stock || 0) }
      ];
    case 'caja':
      return [
        { label: 'Ingresos', value: formatMoney(resumen.total_ingresos || 0) },
        { label: 'Egresos', value: formatMoney(resumen.total_egresos || 0) },
        { label: 'Balance neto', value: formatMoney(Number(resumen.total_ingresos || 0) - Number(resumen.total_egresos || 0)) },
        { label: 'Movimientos', value: Number(resumen.movimientos || 0) }
      ];
    case 'cxc':
      return [
        { label: 'Saldo pendiente', value: formatMoney(resumen.saldo_total_pendiente || 0) },
        { label: 'Clientes con deuda', value: Number(resumen.clientes_con_deuda || 0) },
        { label: 'Ventas pendientes', value: Number(resumen.ventas_pendientes || 0) }
      ];
    case 'cxp':
      return [
        { label: 'Saldo pendiente', value: formatMoney(resumen.saldo_total_pendiente || 0) },
        { label: 'Proveedores con deuda', value: Number(resumen.proveedores_con_deuda || 0) },
        { label: 'Facturas pendientes', value: Number(resumen.facturas_pendientes || 0) }
      ];
    case 'compras':
      return [
        { label: 'Total compras', value: formatMoney(resumen.total_compras || 0) },
        { label: 'Cantidad compras', value: Number(resumen.cantidad_compras || 0) }
      ];
    default:
      return [];
  }
}

function renderTableHead(tab) {
  switch (tab) {
    case 'ventas':
      return (
        <tr>
          <TablaCelda as="th">Fecha</TablaCelda>
          <TablaCelda as="th">Venta</TablaCelda>
          <TablaCelda as="th">Cliente</TablaCelda>
          <TablaCelda as="th">Metodo</TablaCelda>
          <TablaCelda as="th">Usuario</TablaCelda>
          <TablaCelda as="th">Estado</TablaCelda>
          <TablaCelda as="th">Total</TablaCelda>
        </tr>
      );
    case 'ventasProducto':
      return (
        <tr>
          <TablaCelda as="th">Producto</TablaCelda>
          <TablaCelda as="th">Cantidad vendida</TablaCelda>
          <TablaCelda as="th">Total vendido</TablaCelda>
        </tr>
      );
    case 'inventario':
      return (
        <tr>
          <TablaCelda as="th">Producto</TablaCelda>
          <TablaCelda as="th">Categoria</TablaCelda>
          <TablaCelda as="th">Stock actual</TablaCelda>
          <TablaCelda as="th">Costo promedio</TablaCelda>
          <TablaCelda as="th">Stock minimo</TablaCelda>
          <TablaCelda as="th">Diferencia</TablaCelda>
        </tr>
      );
    case 'caja':
      return (
        <tr>
          <TablaCelda as="th">Fecha</TablaCelda>
          <TablaCelda as="th">Tipo</TablaCelda>
          <TablaCelda as="th">Modulo</TablaCelda>
          <TablaCelda as="th">Usuario</TablaCelda>
          <TablaCelda as="th">Descripcion</TablaCelda>
          <TablaCelda as="th">Monto</TablaCelda>
        </tr>
      );
    case 'cxc':
      return (
        <tr>
          <TablaCelda as="th">Cliente</TablaCelda>
          <TablaCelda as="th">Saldo pendiente</TablaCelda>
          <TablaCelda as="th">Ventas asociadas</TablaCelda>
          <TablaCelda as="th">Proximo vencimiento</TablaCelda>
          <TablaCelda as="th">Documentos</TablaCelda>
        </tr>
      );
    case 'cxp':
      return (
        <tr>
          <TablaCelda as="th">Proveedor</TablaCelda>
          <TablaCelda as="th">Saldo pendiente</TablaCelda>
          <TablaCelda as="th">Facturas asociadas</TablaCelda>
          <TablaCelda as="th">Proximo vencimiento</TablaCelda>
          <TablaCelda as="th">Documentos</TablaCelda>
        </tr>
      );
    case 'compras':
      return (
        <tr>
          <TablaCelda as="th">Fecha</TablaCelda>
          <TablaCelda as="th">Factura</TablaCelda>
          <TablaCelda as="th">Proveedor</TablaCelda>
          <TablaCelda as="th">Metodo</TablaCelda>
          <TablaCelda as="th">Total</TablaCelda>
        </tr>
      );
    default:
      return null;
  }
}

function renderTableRow(tab, row) {
  switch (tab) {
    case 'ventas':
      return (
        <TablaFila key={`${tab}-${row.id}`}>
          <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
          <TablaCelda>{row.numero_venta}</TablaCelda>
          <TablaCelda>{row.cliente}</TablaCelda>
          <TablaCelda>{row.metodo_pago}</TablaCelda>
          <TablaCelda>{row.usuario}</TablaCelda>
          <TablaCelda>{row.estado}</TablaCelda>
          <TablaCelda>{formatMoney(row.total)}</TablaCelda>
        </TablaFila>
      );
    case 'ventasProducto':
      return (
        <TablaFila key={`${tab}-${row.id}`}>
          <TablaCelda>{row.producto}</TablaCelda>
          <TablaCelda>{formatQtyByUnit(row.cantidad_vendida, row.unidad_medida, { fixedLB: true })}</TablaCelda>
          <TablaCelda>{formatMoney(row.total_vendido)}</TablaCelda>
        </TablaFila>
      );
    case 'inventario':
      return (
        <TablaFila key={`${tab}-${row.id}`}>
          <TablaCelda>{row.codigo} {row.producto}</TablaCelda>
          <TablaCelda>{row.categoria}</TablaCelda>
          <TablaCelda>{formatQtyByUnit(row.stock_actual, row.unidad_medida, { fixedLB: true })}</TablaCelda>
          <TablaCelda>{formatMoney(row.costo_promedio)}</TablaCelda>
          <TablaCelda>{formatQtyByUnit(row.stock_minimo, row.unidad_medida, { fixedLB: true })}</TablaCelda>
          <TablaCelda className={Number(row.diferencia_stock) === 0 ? 'text-emerald-700' : 'font-semibold text-rose-700'}>
            {formatQtyByUnit(row.diferencia_stock, row.unidad_medida, { fixedLB: true })}
          </TablaCelda>
        </TablaFila>
      );
    case 'caja':
      return (
        <TablaFila key={`${tab}-${row.id}`}>
          <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
          <TablaCelda>{row.tipo_movimiento}</TablaCelda>
          <TablaCelda>{row.modulo_origen}</TablaCelda>
          <TablaCelda>{row.usuario}</TablaCelda>
          <TablaCelda>{row.descripcion}</TablaCelda>
          <TablaCelda className={row.sentido === 'INGRESO' ? 'text-emerald-700' : 'text-rose-700'}>
            {row.sentido === 'INGRESO' ? '+' : '-'}{formatMoney(row.monto)}
          </TablaCelda>
        </TablaFila>
      );
    case 'cxc':
      return (
        <TablaFila key={`${tab}-${row.cliente_id}`}>
          <TablaCelda>{row.cliente}</TablaCelda>
          <TablaCelda className="font-semibold text-rose-700">{formatMoney(row.saldo_pendiente)}</TablaCelda>
          <TablaCelda>{row.ventas_asociadas}</TablaCelda>
          <TablaCelda>{row.proximo_vencimiento ? formatDateQuito(row.proximo_vencimiento) : '-'}</TablaCelda>
          <TablaCelda>{row.ventas_referencia}</TablaCelda>
        </TablaFila>
      );
    case 'cxp':
      return (
        <TablaFila key={`${tab}-${row.proveedor_id}`}>
          <TablaCelda>{row.proveedor}</TablaCelda>
          <TablaCelda className="font-semibold text-rose-700">{formatMoney(row.saldo_pendiente)}</TablaCelda>
          <TablaCelda>{row.facturas_asociadas}</TablaCelda>
          <TablaCelda>{row.proximo_vencimiento ? formatDateQuito(row.proximo_vencimiento) : '-'}</TablaCelda>
          <TablaCelda>{row.facturas_referencia}</TablaCelda>
        </TablaFila>
      );
    case 'compras':
      return (
        <TablaFila key={`${tab}-${row.id}`}>
          <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
          <TablaCelda>{row.numero_factura}</TablaCelda>
          <TablaCelda>{row.proveedor}</TablaCelda>
          <TablaCelda>{row.metodo_pago}</TablaCelda>
          <TablaCelda>{formatMoney(row.total_compra)}</TablaCelda>
        </TablaFila>
      );
    default:
      return null;
  }
}

export default function ReportesPage() {
  const [params, setParams] = useSearchParams();
  const { reportes, loading, error, cargarReporte } = useReportesStore();
  const [pagina, setPagina] = useState(1);
  const [filters, setFilters] = useState(getDefaultFilters);

  const currentTab = useMemo(() => {
    const tab = params.get('tab');
    return REPORT_TABS.some((item) => item.key === tab) ? tab : 'ventas';
  }, [params]);

  const currentDefinition = REPORT_TABS.find((item) => item.key === currentTab) || REPORT_TABS[0];
  const currentReport = reportes[currentTab] || { resumen: {}, items: [], filtros: {} };
  const summaryCards = useMemo(
    () => getSummaryCards(currentTab, currentReport.resumen),
    [currentTab, currentReport.resumen]
  );

  useEffect(() => {
    if (!params.get('tab')) {
      setParams({ tab: 'ventas' }, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    cargarReporte(currentTab, filters);
  }, [cargarReporte, currentTab]);

  useEffect(() => {
    setPagina(1);
  }, [currentTab, currentReport.items.length]);

  const rows = currentReport.items || [];
  const totalPaginas = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginatedRows = rows.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE);

  const onSearch = () => {
    cargarReporte(currentTab, filters);
  };

  const onResetFilters = () => {
    const defaults = getDefaultFilters();
    setFilters(defaults);
    cargarReporte(currentTab, defaults);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reportes operativos"
        description="Ventas, compras, inventario, caja y deudas del negocio a partir de datos transaccionales reales"
      />

      <div className="flex flex-wrap gap-2">
        {REPORT_TABS.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            variant={currentTab === tab.key ? 'primary' : 'ghost'}
            className={currentTab === tab.key ? '' : '!text-[var(--color-text-muted)]'}
            onClick={() => setParams({ tab: tab.key })}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha inicio
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha_inicio}
              onChange={(event) => setFilters((state) => ({ ...state, fecha_inicio: event.target.value }))}
              disabled={!currentDefinition.usesDateRange}
            />
          </label>
          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha fin
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha_fin}
              onChange={(event) => setFilters((state) => ({ ...state, fecha_fin: event.target.value }))}
              disabled={!currentDefinition.usesDateRange}
            />
          </label>
          <Button type="button" onClick={onSearch} disabled={loading}>
            Aplicar filtros
          </Button>
          <Button type="button" variant="ghost" onClick={onResetFilters} disabled={loading}>
            Reiniciar
          </Button>
        </div>

        {!currentDefinition.usesDateRange && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Este reporte refleja el estado actual del negocio y no usa rango de fechas.
          </p>
        )}
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && <LoadingState label="Consultando reporte..." />}

      {summaryCards.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <Card key={card.label} className="space-y-1 p-4">
              <p className="text-sm text-[var(--color-text-muted)]">{card.label}</p>
              <p className="text-2xl font-semibold text-[var(--color-text)]">{card.value}</p>
            </Card>
          ))}
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="Sin datos para este reporte"
          description="No se encontraron registros con los filtros actuales."
        />
      ) : (
        !loading && (
          <>
            <Tabla>
              <TablaCabecera>{renderTableHead(currentTab)}</TablaCabecera>
              <TablaCuerpo>{paginatedRows.map((row) => renderTableRow(currentTab, row))}</TablaCuerpo>
            </Tabla>

            <Paginador
              paginaActual={pagina}
              totalPaginas={totalPaginas}
              totalRegistros={rows.length}
              mostrarSiempre
              onPageChange={setPagina}
            />
          </>
        )
      )}
    </div>
  );
}
