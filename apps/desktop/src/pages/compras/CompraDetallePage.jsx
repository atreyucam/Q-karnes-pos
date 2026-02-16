import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useComprasStore } from '../../stores/comprasStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';

export default function CompraDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ordenActual, recepciones, error, cargarOrden, cargarRecepciones } = useComprasStore();

  const ordenId = Number(id);
  const [proveedorInfo, setProveedorInfo] = useState(null);
  const [facturasProveedor, setFacturasProveedor] = useState([]);

  useEffect(() => {
    if (!Number.isFinite(ordenId) || ordenId <= 0) return;
    cargarOrden(ordenId);
    cargarRecepciones(ordenId);
  }, [ordenId, cargarOrden, cargarRecepciones]);

  useEffect(() => {
    async function loadProveedorData() {
      const proveedorId = ordenActual?.orden?.proveedor_id;
      if (!proveedorId) {
        setProveedorInfo(null);
        setFacturasProveedor([]);
        return;
      }

      const [proveedorResp, facturasResp] = await Promise.all([
        apiClient.get(`/api/proveedores/${proveedorId}`),
        apiClient.get(`/api/proveedores/${proveedorId}/facturas`)
      ]);

      setProveedorInfo(normalizeResponse(proveedorResp.data));
      setFacturasProveedor(normalizeResponse(facturasResp.data) || []);
    }

    loadProveedorData();
  }, [ordenActual?.orden?.proveedor_id]);

  const recepcionesCards = useMemo(() => {
    const rows = recepciones?.recepciones || [];

    return rows.map((r, idx) => {
      const factura = facturasProveedor.find((f) => f.numero_factura === r.factura_id);
      const isLast = idx === 0;
      const estado = ordenActual?.orden?.estado === 'COMPLETA' && isLast ? 'COMPLETA' : 'PARCIAL';

      return {
        ...r,
        metodo_pago: factura?.metodo_pago || '-',
        estado
      };
    });
  }, [recepciones, facturasProveedor, ordenActual?.orden?.estado]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => navigate('/compras')}>
            Volver
          </button>
          <h2 className="mt-3 text-2xl font-semibold text-slate-800">Detalle orden de compra #{ordenId}</h2>
          <p className="text-sm text-slate-500">Informacion de proveedor, recepciones e items</p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {ordenActual?.orden && (
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Proveedor</p>
                <p className="font-semibold text-slate-800">{ordenActual.orden.proveedor_nombre || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Telefono</p>
                <p className="font-semibold text-slate-800">{proveedorInfo?.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Credito / dias</p>
                <p className="font-semibold text-slate-800">{proveedorInfo?.tiene_credito ? 'SI' : 'NO'} / {Number(proveedorInfo?.dias_pago || 0)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Estado orden</p>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(ordenActual.orden.estado)}`}>
                  {ordenActual.orden.estado}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
                <p className="font-semibold text-slate-800">{formatDateQuito(ordenActual.orden.fecha)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Observacion</p>
                <p className="font-semibold text-slate-800">{ordenActual.orden.observacion || '-'}</p>
              </div>
            </div>
          </div>
        )}

        {recepcionesCards.length > 0 && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-800">Recepciones</p>
            <div className="space-y-4">
              {recepcionesCards.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-bold text-slate-800">Factura # {r.factura_id || '-'}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{formatDateQuito(r.fecha)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Metodo</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(r.metodo_pago)}`}>
                        {r.metodo_pago}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(r.estado)}`}>
                        {r.estado}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Monto</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{formatMoney(r.total)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-800">Items orden</p>
            {(ordenActual?.orden?.estado === 'ABIERTA' || ordenActual?.orden?.estado === 'PARCIAL') && (
              <button className="rounded-xl bg-[#b41428] px-3 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={() => navigate(`/compras/ordenes/${ordenId}/cargar`)}>
                Cargar recepcion
              </button>
            )}
          </div>
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Recibida</TablaCelda>
                <TablaCelda as="th">Pendiente</TablaCelda>
                <TablaCelda as="th">Costo est.</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(ordenActual?.detalle || []).map((d) => {
                const unidad = d.unidad_medida || d.unidad;
                const pendiente = Number(d.cantidad) - Number(d.cantidad_recibida);
                return (
                  <TablaFila key={d.id}>
                    <TablaCelda>{d.producto_codigo} - {d.producto_nombre}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(d.cantidad, unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(d.cantidad_recibida, unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(pendiente, unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>{formatMoney(d.costo_unit_est)}</TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>
          <Paginador paginaActual={1} totalPaginas={1} totalRegistros={ordenActual?.detalle?.length || 0} mostrarSiempre />
        </div>
      </div>
    </div>
  );
}
