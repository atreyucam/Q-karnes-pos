import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import Modal from '../../components/ui/Modal';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { formatMoney } from '../../lib/formatMoney';

const PAGE_SIZE = 10;

const emptyProveedorForm = {
  id: null,
  nombre: '',
  telefono: '',
  direccion: '',
  observacion: '',
  tiene_credito: true,
  dias_pago: '15',
  activo: true
};

export default function ProveedoresPage() {
  const { proveedores, error, listar, crear, actualizar } = useProveedoresStore();
  const navigate = useNavigate();

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS' });
  const [proveedorModal, setProveedorModal] = useState({ open: false, mode: 'create' });
  const [proveedorForm, setProveedorForm] = useState(emptyProveedorForm);

  const refreshList = () => {
    listar({
      include_cxp: 1,
      search: filtros.search || undefined,
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado
    });
  };

  useEffect(() => {
    const timer = setTimeout(refreshList, 250);
    return () => clearTimeout(timer);
  }, [listar, filtros]);

  useEffect(() => {
    setPagina(1);
  }, [proveedores.length]);

  const proveedoresOrdenados = useMemo(() => {
    return [...proveedores].sort((a, b) => {
      const saldoA = Number(a.saldo_pendiente || 0);
      const saldoB = Number(b.saldo_pendiente || 0);
      if (saldoB !== saldoA) return saldoB - saldoA;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    });
  }, [proveedores]);

  const totalPaginas = Math.max(1, Math.ceil(proveedoresOrdenados.length / PAGE_SIZE));
  const proveedoresPaginados = proveedoresOrdenados.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE);

  const openCreateModal = () => {
    setProveedorModal({ open: true, mode: 'create' });
    setProveedorForm({ ...emptyProveedorForm });
  };

  const openEditModal = (proveedor) => {
    setProveedorModal({ open: true, mode: 'edit' });
    setProveedorForm({
      id: proveedor.id,
      nombre: proveedor.nombre || '',
      telefono: proveedor.telefono || '',
      direccion: proveedor.direccion || '',
      observacion: proveedor.observacion || '',
      tiene_credito: Boolean(proveedor.tiene_credito),
      dias_pago: String(Number(proveedor.dias_pago || 0)),
      activo: Boolean(proveedor.activo)
    });
  };

  const closeProveedorModal = () => {
    setProveedorModal({ open: false, mode: 'create' });
    setProveedorForm({ ...emptyProveedorForm });
  };

  const onSaveProveedor = async () => {
    if (!proveedorForm.nombre.trim()) return;

    const payload = {
      nombre: proveedorForm.nombre.trim(),
      telefono: proveedorForm.telefono.trim() || null,
      direccion: proveedorForm.direccion.trim() || null,
      observacion: proveedorForm.observacion.trim() || null,
      tiene_credito: proveedorForm.tiene_credito,
      dias_pago: proveedorForm.tiene_credito ? Number(proveedorForm.dias_pago || 0) : 0,
      activo: proveedorForm.activo
    };

    if (proveedorModal.mode === 'edit' && proveedorForm.id) {
      await actualizar(proveedorForm.id, payload);
    } else {
      await crear(payload);
    }

    closeProveedorModal();
    refreshList();
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
              placeholder="Nombre, telefono, direccion"
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
            <button className="w-full rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={openCreateModal}>
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
            {proveedoresPaginados.map((p) => {
              const saldoPendiente = Number(p.saldo_pendiente || 0);
              return (
                <TablaFila key={p.id}>
                  <TablaCelda>{p.nombre}</TablaCelda>
                  <TablaCelda>{p.telefono || '-'}</TablaCelda>
                  <TablaCelda>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(p.tiene_credito ? 'CREDITO' : 'INACTIVO')}`}>
                      {p.tiene_credito ? 'SI' : 'NO'}
                    </span>
                  </TablaCelda>
                  <TablaCelda>{Number(p.dias_pago || 0)}</TablaCelda>
                  <TablaCelda className={saldoPendiente > 0 ? 'font-bold text-[#b41428]' : ''}>{formatMoney(saldoPendiente)}</TablaCelda>
                  <TablaCelda>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(p.activo ? 'ACTIVO' : 'INACTIVO')}`}>
                      {p.activo ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end gap-2">
                      <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white" onClick={() => navigate(`/proveedores/${p.id}`)}>
                        Ver
                      </button>
                      <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs" onClick={() => openEditModal(p)}>
                        Editar
                      </button>
                      <button
                        className="rounded-lg bg-[#b41428] px-3 py-1.5 text-xs text-white hover:bg-[#8f1020]"
                        onClick={async () => {
                          await actualizar(p.id, { activo: !p.activo });
                          refreshList();
                        }}
                      >
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={proveedoresOrdenados.length} mostrarSiempre onPageChange={setPagina} />
      </div>

      <Modal open={proveedorModal.open} onClose={closeProveedorModal} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{proveedorModal.mode === 'edit' ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
            <p className="text-sm text-slate-500">Crea o actualiza condiciones de compra y pago.</p>
          </div>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={closeProveedorModal}>
            X
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Nombre</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={proveedorForm.nombre} onChange={(e) => setProveedorForm((s) => ({ ...s, nombre: e.target.value }))} placeholder="Pronaca" />
            <p className="mt-1 text-xs text-slate-500">Nombre del proveedor para compras y reportes.</p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Telefono</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={proveedorForm.telefono} onChange={(e) => setProveedorForm((s) => ({ ...s, telefono: e.target.value }))} placeholder="0990000000" />
            <p className="mt-1 text-xs text-slate-500">Contacto para pedidos y seguimiento de facturas.</p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Direccion</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={proveedorForm.direccion} onChange={(e) => setProveedorForm((s) => ({ ...s, direccion: e.target.value }))} placeholder="Sector / calle" />
            <p className="mt-1 text-xs text-slate-500">Direccion comercial o punto de despacho.</p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Observacion</label>
            <textarea className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={proveedorForm.observacion} onChange={(e) => setProveedorForm((s) => ({ ...s, observacion: e.target.value }))} placeholder="Notas internas" />
            <p className="mt-1 text-xs text-slate-500">Notas sobre plazos, entregas y condiciones.</p>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={proveedorForm.tiene_credito} onChange={(e) => setProveedorForm((s) => ({ ...s, tiene_credito: e.target.checked }))} />
              Tiene credito
            </label>
            <p className="mt-1 text-xs text-slate-500">Si se activa, permite facturas a credito con saldo pendiente.</p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Cada cuantos dias se paga</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={proveedorForm.dias_pago} onChange={(e) => setProveedorForm((s) => ({ ...s, dias_pago: e.target.value }))} disabled={!proveedorForm.tiene_credito} placeholder="15" />
            <p className="mt-1 text-xs text-slate-500">Periodicidad esperada de pago para credito.</p>
          </div>

          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={proveedorForm.activo} onChange={(e) => setProveedorForm((s) => ({ ...s, activo: e.target.checked }))} />
              Proveedor activo
            </label>
            <p className="mt-1 text-xs text-slate-500">Si esta inactivo no aparecera para nuevas ordenes.</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={closeProveedorModal}>
            Cancelar
          </button>
          <button className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={onSaveProveedor}>
            {proveedorModal.mode === 'edit' ? 'Guardar cambios' : 'Guardar proveedor'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
