import { useEffect, useMemo, useState } from 'react';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useVentasStore } from '../../stores/ventasStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';

const PAGE_SIZE = 8;

export default function VentasListPage() {
  const { ventas, ventaDetalle, ticket, devoluciones, error, listar, detalle, cargarTicket, cargarDevoluciones, crearDevolucion } = useVentasStore();
  const [selected, setSelected] = useState(null);
  const [motivo, setMotivo] = useState('Cliente no conforme');
  const [contado, setContado] = useState('');
  const [credito, setCredito] = useState('');
  const [authAdmin, setAuthAdmin] = useState({ usuario: '', password: '' });
  const [qtyByDetail, setQtyByDetail] = useState({});
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    listar();
  }, [listar]);

  useEffect(() => {
    if (!selected) return;
    detalle(selected);
    cargarDevoluciones(selected);
  }, [selected, detalle, cargarDevoluciones]);

  useEffect(() => {
    setPagina(1);
  }, [ventas.length]);

  const totalPaginas = Math.max(1, Math.ceil(ventas.length / PAGE_SIZE));
  const ventasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return ventas.slice(start, start + PAGE_SIZE);
  }, [pagina, ventas]);

  const devolucionItems = useMemo(() => {
    if (!ventaDetalle?.detalle) return [];
    return ventaDetalle.detalle
      .map((d) => ({ venta_detalle_id: d.id, cantidad: Number(qtyByDetail[d.id] || 0) }))
      .filter((d) => d.cantidad > 0);
  }, [ventaDetalle, qtyByDetail]);

  const submitDevolucion = async () => {
    if (!selected) return;
    await crearDevolucion(selected, {
      motivo,
      items: devolucionItems,
      contado: contado === '' ? undefined : Number(contado),
      credito: credito === '' ? undefined : Number(credito),
      autorizacion: {
        usuario: authAdmin.usuario.trim(),
        password: authAdmin.password
      }
    });
    await detalle(selected);
    await cargarDevoluciones(selected);
    setQtyByDetail({});
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Listado de ventas</h2>
        <p className="text-sm text-slate-500">Consulta, ticket y devoluciones</p>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <Tabla>
        <TablaCabecera>
          <tr>
            <TablaCelda as="th">ID</TablaCelda>
            <TablaCelda as="th">Fecha</TablaCelda>
            <TablaCelda as="th">Cliente</TablaCelda>
            <TablaCelda as="th">Estado</TablaCelda>
            <TablaCelda as="th">Total</TablaCelda>
            <TablaCelda as="th">Acciones</TablaCelda>
          </tr>
        </TablaCabecera>
        <TablaCuerpo>
          {ventasPaginadas.map((v) => (
            <TablaFila key={v.id}>
              <TablaCelda>#{v.id}</TablaCelda>
              <TablaCelda>{formatDateQuito(v.fecha)}</TablaCelda>
              <TablaCelda>{v.cliente_nombre || '-'}</TablaCelda>
              <TablaCelda>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(v.estado)}`}>
                  {v.estado}
                </span>
              </TablaCelda>
              <TablaCelda>${Number(v.total || 0).toFixed(2)}</TablaCelda>
              <TablaCelda className="space-x-2">
                <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white" onClick={() => setSelected(v.id)}>
                  Ver
                </button>
                <button className="rounded-lg bg-[#b41428] px-3 py-1.5 text-xs text-white hover:bg-[#8f1020]" onClick={() => cargarTicket(v.id)}>
                  Ticket
                </button>
              </TablaCelda>
            </TablaFila>
          ))}
        </TablaCuerpo>
      </Tabla>

      <Paginador
        paginaActual={pagina}
        totalPaginas={totalPaginas}
        totalRegistros={ventas.length}
        mostrarSiempre
        onPageChange={setPagina}
      />

      {ventaDetalle && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">Detalle venta #{ventaDetalle.venta.id}</h3>
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Cantidad</TablaCelda>
                  <TablaCelda as="th">P. Unit</TablaCelda>
                  <TablaCelda as="th">Subtotal</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {ventaDetalle.detalle.map((d) => (
                  <TablaFila key={d.id}>
                    <TablaCelda>{d.producto_codigo} {d.producto_nombre}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(d.cantidad, d.unidad_medida || d.unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>${Number(d.precio_unit || 0).toFixed(2)}</TablaCelda>
                    <TablaCelda>${Number(d.total_linea || 0).toFixed(2)}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">Registrar devolucion</h3>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo"
            />
            {ventaDetalle.detalle.map((d) => (
              <div key={d.id} className="grid grid-cols-[1fr_120px] gap-2 items-center">
                <span className="text-sm text-slate-600">{d.producto_codigo} {d.producto_nombre} (vendido: {d.cantidad})</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={qtyByDetail[d.id] || ''}
                  onChange={(e) => setQtyByDetail((s) => ({ ...s, [d.id]: e.target.value }))}
                  placeholder="Cant"
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-xl border border-slate-300 px-3 py-2" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="Contado opcional" />
              <input className="rounded-xl border border-slate-300 px-3 py-2" value={credito} onChange={(e) => setCredito(e.target.value)} placeholder="Credito opcional" />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2">
              <input
                className="rounded-xl border border-amber-300 px-3 py-2"
                value={authAdmin.usuario}
                onChange={(e) => setAuthAdmin((s) => ({ ...s, usuario: e.target.value }))}
                placeholder="Usuario admin"
              />
              <input
                type="password"
                className="rounded-xl border border-amber-300 px-3 py-2"
                value={authAdmin.password}
                onChange={(e) => setAuthAdmin((s) => ({ ...s, password: e.target.value }))}
                placeholder="Clave admin"
              />
            </div>
            <button className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={submitDevolucion}>
              Guardar devolucion
            </button>
          </div>
        </div>
      )}

      {devoluciones?.devoluciones?.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800">Historial devoluciones</h3>
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">ID</TablaCelda>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Motivo</TablaCelda>
                <TablaCelda as="th">Total</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {devoluciones.devoluciones.map((d) => (
                <TablaFila key={d.id}>
                  <TablaCelda>#{d.id}</TablaCelda>
                  <TablaCelda>{formatDateQuito(d.fecha)}</TablaCelda>
                  <TablaCelda>{d.motivo}</TablaCelda>
                  <TablaCelda>${Number(d.total_devuelto || 0).toFixed(2)}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
          <Paginador paginaActual={1} totalPaginas={1} totalRegistros={devoluciones.devoluciones.length} mostrarSiempre />
        </div>
      )}

      {ticket && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold text-slate-800">Ticket</h3>
          <pre className="overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(ticket, null, 2)}</pre>
        </div>
      )}
      </div>
    </div>
  );
}
