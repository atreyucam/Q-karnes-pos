import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useClientesStore } from '../../stores/clientesStore';
import { formatMoney } from '../../lib/formatMoney';

const PAGE_SIZE = 10;

export default function ClientesPage() {
  const { clientes, meta, error, loading, listar, crear, actualizar, abonar } = useClientesStore();
  const navigate = useNavigate();

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS', credito: 'TODOS' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', activo: true });
  const [abonoModal, setAbonoModal] = useState(null);
  const [abonoForm, setAbonoForm] = useState({ monto: '', referencia: '', observacion: '' });

  useEffect(() => {
    const timer = setTimeout(() => {
      listar({
        include_credito: 1,
        limit: PAGE_SIZE,
        offset: (pagina - 1) * PAGE_SIZE,
        search: filtros.search || undefined,
        activo: filtros.estado === 'TODOS' ? undefined : filtros.estado,
        credito: filtros.credito === 'TODOS' ? undefined : filtros.credito
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [listar, pagina, filtros]);

  const totalRegistros = Number(meta?.total || 0);
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / PAGE_SIZE));

  const onChangeFiltro = (key, value) => {
    setPagina(1);
    setFiltros((prev) => ({ ...prev, [key]: value }));
  };

  const onCreate = async () => {
    if (!nuevoCliente.nombre.trim()) return;
    await crear({
      nombre: nuevoCliente.nombre.trim(),
      telefono: nuevoCliente.telefono.trim() || null,
      activo: nuevoCliente.activo
    });

    setShowCreateModal(false);
    setNuevoCliente({ nombre: '', telefono: '', activo: true });
    listar({
      include_credito: 1,
      limit: PAGE_SIZE,
      offset: (pagina - 1) * PAGE_SIZE,
      search: filtros.search || undefined,
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado,
      credito: filtros.credito === 'TODOS' ? undefined : filtros.credito
    });
  };

  const onRegistrarAbono = async () => {
    if (!abonoModal) return;
    await abonar(abonoModal.id, {
      monto: Number(abonoForm.monto || 0),
      referencia: abonoForm.referencia || undefined,
      observacion: abonoForm.observacion || undefined
    });

    setAbonoModal(null);
    setAbonoForm({ monto: '', referencia: '', observacion: '' });
    listar({
      include_credito: 1,
      limit: PAGE_SIZE,
      offset: (pagina - 1) * PAGE_SIZE,
      search: filtros.search || undefined,
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado,
      credito: filtros.credito === 'TODOS' ? undefined : filtros.credito
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Clientes y credito</h2>
          <p className="text-sm text-slate-500">Gestion de clientes, estado y cartera</p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_180px_auto]">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Buscar</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filtros.search}
              onChange={(e) => onChangeFiltro('search', e.target.value)}
              placeholder="Nombre o telefono"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Estado</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filtros.estado}
              onChange={(e) => onChangeFiltro('estado', e.target.value)}
            >
              <option value="TODOS">Todos</option>
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Credito</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filtros.credito}
              onChange={(e) => onChangeFiltro('credito', e.target.value)}
            >
              <option value="TODOS">Todos</option>
              <option value="CON">Con credito</option>
              <option value="SIN">Sin credito</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              className="w-full rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
              onClick={() => setShowCreateModal(true)}
            >
              Nuevo cliente
            </button>
          </div>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">ID</TablaCelda>
              <TablaCelda as="th">Nombre</TablaCelda>
              <TablaCelda as="th">Telefono</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th">Credito</TablaCelda>
              <TablaCelda as="th">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {clientes.map((c) => {
              const saldoCredito = Number(c.saldo_credito || 0);
              const sinSaldo = saldoCredito <= 0;
              return (
                <TablaFila key={c.id}>
                  <TablaCelda>#{c.id}</TablaCelda>
                  <TablaCelda>{c.nombre}</TablaCelda>
                  <TablaCelda>{c.telefono || '-'}</TablaCelda>
                  <TablaCelda>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(c.activo ? 'ACTIVO' : 'INACTIVO')}`}>
                      {c.activo ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </TablaCelda>
                  <TablaCelda>{formatMoney(saldoCredito)}</TablaCelda>
                  <TablaCelda className="space-x-2">
                    <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white" onClick={() => navigate(`/clientes/${c.id}`)}>
                      Ver
                    </button>
                    <button
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={sinSaldo}
                      title={sinSaldo ? 'Sin saldo pendiente' : 'Registrar abono'}
                      onClick={() => {
                        setAbonoModal(c);
                        setAbonoForm({ monto: '', referencia: '', observacion: '' });
                      }}
                    >
                      Registrar abono
                    </button>
                    <button
                      className="rounded-lg bg-[#b41428] px-3 py-1.5 text-xs text-white hover:bg-[#8f1020]"
                      onClick={async () => {
                        await actualizar(c.id, { activo: !c.activo });
                        listar({
                          include_credito: 1,
                          limit: PAGE_SIZE,
                          offset: (pagina - 1) * PAGE_SIZE,
                          search: filtros.search || undefined,
                          activo: filtros.estado === 'TODOS' ? undefined : filtros.estado,
                          credito: filtros.credito === 'TODOS' ? undefined : filtros.credito
                        });
                      }}
                    >
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <Paginador
          paginaActual={pagina}
          totalPaginas={totalPaginas}
          totalRegistros={totalRegistros}
          mostrarSiempre
          onPageChange={setPagina}
        />

        {loading && <p className="text-xs text-slate-500">Cargando...</p>}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">Nuevo cliente</h3>
            <p className="text-sm text-slate-500">Registra un nuevo cliente para ventas y credito.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Nombre</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={nuevoCliente.nombre}
                  onChange={(e) => setNuevoCliente((s) => ({ ...s, nombre: e.target.value }))}
                  placeholder="Ej: Restaurante El Buen Sabor"
                />
                <p className="mt-1 text-xs text-slate-500">Nombre comercial o de la persona.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Telefono</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={nuevoCliente.telefono}
                  onChange={(e) => setNuevoCliente((s) => ({ ...s, telefono: e.target.value }))}
                  placeholder="0990000000"
                />
                <p className="mt-1 text-xs text-slate-500">Contacto para seguimiento de facturas y credito.</p>
              </div>

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={nuevoCliente.activo}
                    onChange={(e) => setNuevoCliente((s) => ({ ...s, activo: e.target.checked }))}
                  />
                  Cliente activo
                </label>
                <p className="mt-1 text-xs text-slate-500">Si esta inactivo no podra ser usado para ventas a credito.</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </button>
              <button className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={onCreate}>
                Guardar cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {abonoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbonoModal(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">Registrar abono</h3>
            <p className="text-sm text-slate-500">Cliente: {abonoModal.nombre}</p>
            <p className="mt-1 text-sm text-slate-600">Saldo actual: {formatMoney(abonoModal.saldo_credito)}</p>
            <div className="mt-3 space-y-2">
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Monto" value={abonoForm.monto} onChange={(e) => setAbonoForm((s) => ({ ...s, monto: e.target.value }))} />
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Referencia" value={abonoForm.referencia} onChange={(e) => setAbonoForm((s) => ({ ...s, referencia: e.target.value }))} />
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Observacion" value={abonoForm.observacion} onChange={(e) => setAbonoForm((s) => ({ ...s, observacion: e.target.value }))} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setAbonoModal(null)}>
                Cancelar
              </button>
              <button className="rounded-xl bg-[#b41428] px-3 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={onRegistrarAbono}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
