import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useComprasStore } from '../../stores/comprasStore';
import { formatDateQuito } from '../../lib/formatDateQuito';

const PAGE_SIZE = 10;

export default function ComprasPage() {
  const { ordenes, error, listarOrdenes } = useComprasStore();
  const navigate = useNavigate();
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    listarOrdenes();
  }, [listarOrdenes]);

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

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">ID</TablaCelda>
              <TablaCelda as="th">Proveedor</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
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
                <TablaCelda className="space-x-2">
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
