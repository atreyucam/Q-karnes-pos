import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { formatMoney } from '../../lib/formatMoney';

const PAGE_SIZE = 10;

export default function ProveedoresPage() {
  const { proveedores, error, listar, crear, actualizar } = useProveedoresStore();
  const navigate = useNavigate();

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState({
    nombre: '',
    telefono: '',
    tiene_credito: true,
    dias_pago: '15',
    activo: true
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      listar({
        include_cxp: 1,
        search: filtros.search || undefined,
        activo: filtros.estado === 'TODOS' ? undefined : filtros.estado
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [listar, filtros]);

  useEffect(() => {
    setPagina(1);
  }, [proveedores.length]);

  const totalPaginas = Math.max(1, Math.ceil(proveedores.length / PAGE_SIZE));
  const proveedoresPaginados = proveedores.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE);

  const onCreate = async () => {
    if (!nuevoProveedor.nombre.trim()) return;

    await crear({
      nombre: nuevoProveedor.nombre.trim(),
      telefono: nuevoProveedor.telefono.trim() || null,
      tiene_credito: nuevoProveedor.tiene_credito,
      dias_pago: nuevoProveedor.tiene_credito ? Number(nuevoProveedor.dias_pago || 0) : 0,
      activo: nuevoProveedor.activo
    });

    setShowCreateModal(false);
    setNuevoProveedor({ nombre: '', telefono: '', tiene_credito: true, dias_pago: '15', activo: true });
    listar({ include_cxp: 1, search: filtros.search || undefined, activo: filtros.estado === 'TODOS' ? undefined : filtros.estado });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Proveedores</h2>
          <p className="text-sm text-slate-500">Catalogo y creditos por proveedor</p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_auto]">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Buscar</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filtros.search}
              onChange={(e) => setFiltros((s) => ({ ...s, search: e.target.value }))}
              placeholder="Nombre o telefono"
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
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </select>
          </div>

          <div className="flex items-end">
            <button className="w-full rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={() => setShowCreateModal(true)}>
              Nuevo proveedor
            </button>
          </div>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Nombre</TablaCelda>
              <TablaCelda as="th">Telefono</TablaCelda>
              <TablaCelda as="th">Credito</TablaCelda>
              <TablaCelda as="th">Cada (dias)</TablaCelda>
              <TablaCelda as="th">Credito pendiente</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {proveedoresPaginados.map((p) => (
              <TablaFila key={p.id}>
                <TablaCelda>{p.nombre}</TablaCelda>
                <TablaCelda>{p.telefono || '-'}</TablaCelda>
                <TablaCelda>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(p.tiene_credito ? 'OK' : 'INACTIVO')}`}>
                    {p.tiene_credito ? 'SI' : 'NO'}
                  </span>
                </TablaCelda>
                <TablaCelda>{Number(p.dias_pago || 0)}</TablaCelda>
                <TablaCelda>{formatMoney(p.saldo_pendiente)}</TablaCelda>
                <TablaCelda>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(p.activo ? 'ACTIVO' : 'INACTIVO')}`}>
                    {p.activo ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </TablaCelda>
                <TablaCelda className="space-x-2">
                  <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white" onClick={() => navigate(`/proveedores/${p.id}`)}>
                    Ver
                  </button>
                  <button
                    className="rounded-lg bg-[#b41428] px-3 py-1.5 text-xs text-white hover:bg-[#8f1020]"
                    onClick={async () => {
                      await actualizar(p.id, { activo: !p.activo });
                      listar({ include_cxp: 1, search: filtros.search || undefined, activo: filtros.estado === 'TODOS' ? undefined : filtros.estado });
                    }}
                  >
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </TablaCelda>
              </TablaFila>
            ))}
          </TablaCuerpo>
        </Tabla>

        <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={proveedores.length} mostrarSiempre onPageChange={setPagina} />
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">Nuevo proveedor</h3>
            <p className="text-sm text-slate-500">Crea un proveedor y define condiciones de pago.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Nombre</label>
                <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={nuevoProveedor.nombre} onChange={(e) => setNuevoProveedor((s) => ({ ...s, nombre: e.target.value }))} placeholder="Pronaca" />
                <p className="mt-1 text-xs text-slate-500">Nombre del proveedor para compras y reportes.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Telefono</label>
                <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={nuevoProveedor.telefono} onChange={(e) => setNuevoProveedor((s) => ({ ...s, telefono: e.target.value }))} placeholder="0990000000" />
                <p className="mt-1 text-xs text-slate-500">Contacto para pedidos y seguimiento de facturas.</p>
              </div>

              <div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={nuevoProveedor.tiene_credito} onChange={(e) => setNuevoProveedor((s) => ({ ...s, tiene_credito: e.target.checked }))} />
                  Tiene credito
                </label>
                <p className="mt-1 text-xs text-slate-500">Si se activa, permite facturas a credito con saldo pendiente.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Cada cuantos dias se paga</label>
                <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={nuevoProveedor.dias_pago} onChange={(e) => setNuevoProveedor((s) => ({ ...s, dias_pago: e.target.value }))} disabled={!nuevoProveedor.tiene_credito} placeholder="15" />
                <p className="mt-1 text-xs text-slate-500">Periodicidad esperada de pago para credito.</p>
              </div>

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={nuevoProveedor.activo} onChange={(e) => setNuevoProveedor((s) => ({ ...s, activo: e.target.checked }))} />
                  Proveedor activo
                </label>
                <p className="mt-1 text-xs text-slate-500">Si esta inactivo no aparecera para nuevas ordenes.</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </button>
              <button className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={onCreate}>
                Guardar proveedor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
