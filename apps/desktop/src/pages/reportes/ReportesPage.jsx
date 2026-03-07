import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getStatusClasses, getTipoClasses } from '../../components/ui/statusColors';
import { useReportesStore } from '../../stores/reportesStore';
import { formatDateQuito } from '../../lib/formatDateQuito';

const tabs = [
  { key: 'ventas-diarias', label: 'Ventas diarias' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'top-productos', label: 'Top productos' },
  { key: 'caja', label: 'Caja' },
  { key: 'inventario-movimientos', label: 'Inventario movimientos' }
];

const PAGE_SIZE = 10;

export default function ReportesPage() {
  const { dashboard, ventasDiarias, ventas, topProductos, caja, invMovimientos, loading, error, cargarTodo } = useReportesStore();
  const [params, setParams] = useSearchParams();
  const [pagina, setPagina] = useState(1);

  const currentTab = params.get('tab') || 'ventas-diarias';

  useEffect(() => {
    if (!params.get('tab')) {
      setParams({ tab: 'ventas-diarias' }, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  useEffect(() => {
    setPagina(1);
  }, [currentTab]);

  const currentRows = useMemo(() => {
    switch (currentTab) {
      case 'ventas':
        return ventas;
      case 'top-productos':
        return topProductos;
      case 'caja':
        return caja;
      case 'inventario-movimientos':
        return invMovimientos;
      case 'ventas-diarias':
      default:
        return ventasDiarias;
    }
  }, [currentTab, ventas, topProductos, caja, invMovimientos, ventasDiarias]);

  const totalPaginas = Math.max(1, Math.ceil(currentRows.length / PAGE_SIZE));
  const rows = currentRows.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Reportes</h2>
        <p className="text-sm text-slate-500">Analitica operacional</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando...</p>}
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {dashboard && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Ventas total</p>
            <p className="text-xl font-bold text-slate-800">${Number(dashboard.ventas_total || 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Compras total</p>
            <p className="text-xl font-bold text-slate-800">${Number(dashboard.compras_total || 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Clientes con saldo</p>
            <p className="text-xl font-bold text-slate-800">{dashboard.clientes_con_saldo || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Productos bajo minimo</p>
            <p className="text-xl font-bold text-slate-800">{dashboard.productos_bajo_minimo || 0}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setParams({ tab: tab.key })}
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              currentTab === tab.key ? 'bg-[#b41428] text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Tabla>
        <TablaCabecera>
          <tr>
            {currentTab === 'ventas-diarias' && (
              <>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Total</TablaCelda>
              </>
            )}
            {currentTab === 'ventas' && (
              <>
                <TablaCelda as="th">ID</TablaCelda>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Cliente</TablaCelda>
                <TablaCelda as="th">Estado</TablaCelda>
                <TablaCelda as="th">Total</TablaCelda>
              </>
            )}
            {currentTab === 'top-productos' && (
              <>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Venta total</TablaCelda>
              </>
            )}
            {currentTab === 'caja' && (
              <>
                <TablaCelda as="th">Turno</TablaCelda>
                <TablaCelda as="th">Usuario</TablaCelda>
                <TablaCelda as="th">Estado</TablaCelda>
                <TablaCelda as="th">Fondo inicial</TablaCelda>
              </>
            )}
            {currentTab === 'inventario-movimientos' && (
              <>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Tipo</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
              </>
            )}
          </tr>
        </TablaCabecera>
        <TablaCuerpo>
          {rows.map((row) => (
            <TablaFila key={`${currentTab}-${row.id ?? row.fecha}`}>
              {currentTab === 'ventas-diarias' && (
                <>
                  <TablaCelda>{String(formatDateQuito(row.fecha)).split(',')[0]}</TablaCelda>
                  <TablaCelda>{row.cantidad}</TablaCelda>
                  <TablaCelda>${Number(row.total || 0).toFixed(2)}</TablaCelda>
                </>
              )}

              {currentTab === 'ventas' && (
                <>
                  <TablaCelda>#{row.id}</TablaCelda>
                  <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                  <TablaCelda>{row.cliente_nombre || '-'}</TablaCelda>
                  <TablaCelda>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(row.estado)}`}>
                      {row.estado}
                    </span>
                  </TablaCelda>
                  <TablaCelda>${Number(row.total || 0).toFixed(2)}</TablaCelda>
                </>
              )}

              {currentTab === 'top-productos' && (
                <>
                  <TablaCelda>{row.codigo} {row.nombre}</TablaCelda>
                  <TablaCelda>{Number(row.cantidad_total || 0).toFixed(2)}</TablaCelda>
                  <TablaCelda>${Number(row.venta_total || 0).toFixed(2)}</TablaCelda>
                </>
              )}

              {currentTab === 'caja' && (
                <>
                  <TablaCelda>#{row.id}</TablaCelda>
                  <TablaCelda>{row.usuario_nombre}</TablaCelda>
                  <TablaCelda>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(row.estado)}`}>
                      {row.estado}
                    </span>
                  </TablaCelda>
                  <TablaCelda>${Number(row.fondo_inicial || 0).toFixed(2)}</TablaCelda>
                </>
              )}

              {currentTab === 'inventario-movimientos' && (
                <>
                  <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                  <TablaCelda>{row.producto_codigo} {row.producto_nombre}</TablaCelda>
                  <TablaCelda>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getTipoClasses(row.tipo)}`}>
                      {row.tipo}
                    </span>
                  </TablaCelda>
                  <TablaCelda>{row.cantidad}</TablaCelda>
                </>
              )}
            </TablaFila>
          ))}
        </TablaCuerpo>
      </Tabla>

      <Paginador
        paginaActual={pagina}
        totalPaginas={totalPaginas}
        totalRegistros={currentRows.length}
        mostrarSiempre
        onPageChange={setPagina}
      />
      </div>
    </div>
  );
}
