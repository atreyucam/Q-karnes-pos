import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useComprasStore } from '../../stores/comprasStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';

const PAGE_SIZE = 10;

export default function ComprasPage() {
  const { ordenes, error, listarOrdenes } = useComprasStore();
  const navigate = useNavigate();
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS', credito: 'TODOS' });

  const refresh = () => {
    listarOrdenes({
      search: filtros.search || undefined,
      estado: filtros.estado === 'TODOS' ? undefined : filtros.estado,
      con_credito: filtros.credito === 'CON' ? 1 : undefined,
      credito_parcial: filtros.credito === 'PARCIAL' ? 1 : undefined
    });
  };

  useEffect(() => {
    const timer = setTimeout(refresh, 250);
    return () => clearTimeout(timer);
  }, [listarOrdenes, filtros]);

  useEffect(() => {
    setPagina(1);
  }, [ordenes.length]);

  const ordenesPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return ordenes.slice(start, start + PAGE_SIZE);
  }, [pagina, ordenes]);

  const totalPaginas = Math.max(1, Math.ceil(ordenes.length / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">Compras</h2>
            <p className="text-sm text-slate-500">Ordenes de compra y recepciones</p>
          </div>
          <button
            className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
            onClick={() => navigate('/compras/nueva')}
          >
            Crear orden de compra
          </button>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_220px]">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Buscar</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filtros.search}
              onChange={(e) => setFiltros((s) => ({ ...s, search: e.target.value }))}
              placeholder="Proveedor, id u observacion"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Estado</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filtros.estado}
              onChange={(e) => setFiltros((s) => ({ ...s, estado: e.target.value }))}
            >
              <option value="TODOS">Todos</option>
              <option value="ABIERTA">ABIERTA</option>
              <option value="PARCIAL">PARCIAL</option>
              <option value="COMPLETA">COMPLETA</option>
              <option value="CANCELADA">CANCELADA</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Credito</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filtros.credito}
              onChange={(e) => setFiltros((s) => ({ ...s, credito: e.target.value }))}
            >
              <option value="TODOS">Todos</option>
              <option value="CON">Con credito pendiente</option>
              <option value="PARCIAL">Credito parcial</option>
            </select>
          </div>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">ID</TablaCelda>
              <TablaCelda as="th">Proveedor</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Credito pendiente</TablaCelda>
              <TablaCelda as="th">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {ordenesPaginadas.map((o) => (
              <TablaFila key={o.id}>
                <TablaCelda>#{o.id}</TablaCelda>
                <TablaCelda>{o.proveedor_nombre || '-'}</TablaCelda>
                <TablaCelda>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(o.estado)}`}>
                    {o.estado}
                  </span>
                </TablaCelda>
                <TablaCelda>{formatDateQuito(o.fecha)}</TablaCelda>
                <TablaCelda className={Number(o.credito_pendiente || 0) > 0 ? 'font-bold text-[#b41428]' : ''}>{formatMoney(o.credito_pendiente || 0)}</TablaCelda>
                <TablaCelda>
                  <div className="flex justify-end gap-2">
                    {(o.estado === 'ABIERTA' || o.estado === 'PARCIAL') && (
                      <button
                        className="rounded-lg bg-[#b41428] px-3 py-1.5 text-xs text-white hover:bg-[#8f1020]"
                        onClick={() => navigate(`/compras/ordenes/${o.id}/cargar`)}
                      >
                        Cargar
                      </button>
                    )}
                    <button
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white"
                      onClick={() => navigate(`/compras/ordenes/${o.id}`)}
                    >
                      Ver
                    </button>
                  </div>
                </TablaCelda>
              </TablaFila>
            ))}
          </TablaCuerpo>
        </Tabla>

        <Paginador
          paginaActual={pagina}
          totalPaginas={totalPaginas}
          totalRegistros={ordenes.length}
          mostrarSiempre
          onPageChange={setPagina}
        />
      </div>
    </div>
  );
}
