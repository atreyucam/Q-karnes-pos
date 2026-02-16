import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useComprasStore } from '../../stores/comprasStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';

function parseQtyByUnit(value, unidad) {
  const unit = getUnidad(unidad);
  if (unit === 'UND') {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export default function CompraCargarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ordenActual, error, cargarOrden, recepcionarOrden } = useComprasStore();

  const ordenId = Number(id);
  const [factura, setFactura] = useState({ numero_factura: '', metodo_pago: 'CREDITO' });
  const [recv, setRecv] = useState({});
  const [proveedorInfo, setProveedorInfo] = useState(null);
  const [resumenCxp, setResumenCxp] = useState(null);

  useEffect(() => {
    if (!Number.isFinite(ordenId) || ordenId <= 0) return;
    cargarOrden(ordenId);
  }, [ordenId, cargarOrden]);

  useEffect(() => {
    async function loadProveedorData() {
      const proveedorId = ordenActual?.orden?.proveedor_id;
      if (!proveedorId) {
        setProveedorInfo(null);
        setResumenCxp(null);
        return;
      }

      const proveedorResp = await apiClient.get(`/api/proveedores/${proveedorId}`);
      setProveedorInfo(normalizeResponse(proveedorResp.data));

      try {
        const resumenResp = await apiClient.get(`/api/cxp/proveedores/${proveedorId}/resumen`);
        setResumenCxp(normalizeResponse(resumenResp.data));
      } catch (_) {
        setResumenCxp(null);
      }
    }

    loadProveedorData();
  }, [ordenActual?.orden?.proveedor_id]);

  const totalRecepcion = useMemo(() => {
    return (ordenActual?.detalle || []).reduce((acc, d) => {
      const qty = parseQtyByUnit(recv[d.id]?.cantidad, d.unidad_medida || d.unidad);
      const cost = Number(String(recv[d.id]?.costo_unit_real || '').replace(',', '.'));
      const safeQty = Number.isFinite(qty) ? qty : 0;
      const safeCost = Number.isFinite(cost) ? cost : 0;
      return acc + safeQty * safeCost;
    }, 0);
  }, [ordenActual, recv]);

  const onRegistrar = async () => {
    const items = (ordenActual?.detalle || [])
      .map((d) => {
        const unidad = d.unidad_medida || d.unidad;
        const cantidad = parseQtyByUnit(recv[d.id]?.cantidad, unidad);
        const costo = Number(String(recv[d.id]?.costo_unit_real || '').replace(',', '.'));
        return {
          orden_detalle_id: d.id,
          cantidad,
          costo_unit_real: costo
        };
      })
      .filter((i) => Number.isFinite(i.cantidad) && i.cantidad > 0 && Number.isFinite(i.costo_unit_real) && i.costo_unit_real >= 0);

    if (!factura.numero_factura.trim() || !items.length) return;

    await recepcionarOrden(ordenId, {
      factura: {
        numero_factura: factura.numero_factura.trim(),
        metodo_pago: factura.metodo_pago
      },
      items
    });

    navigate(`/compras/ordenes/${ordenId}`);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => navigate(`/compras/ordenes/${ordenId}`)}>
            Volver
          </button>
          <h2 className="mt-3 text-2xl font-semibold text-slate-800">Cargar recepcion OC #{ordenId}</h2>
          <p className="text-sm text-slate-500">Registrar cantidades recibidas y factura</p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {proveedorInfo && (
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Nombre</p>
                <p className="font-semibold text-slate-800">{proveedorInfo.nombre}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Telefono</p>
                <p className="font-semibold text-slate-800">{proveedorInfo.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Credito / dias</p>
                <p className="font-semibold text-slate-800">{proveedorInfo.tiene_credito ? 'SI' : 'NO'} / {Number(proveedorInfo.dias_pago || 0)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(proveedorInfo.activo ? 'ACTIVO' : 'INACTIVO')}`}>
                  {proveedorInfo.activo ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Saldo pendiente</p>
                <p className="text-lg font-bold text-[#b41428]">{formatMoney(resumenCxp?.saldo || 0)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Numero factura"
              value={factura.numero_factura}
              onChange={(e) => setFactura((s) => ({ ...s, numero_factura: e.target.value }))}
            />
            <select
              className="rounded-xl border border-slate-300 px-3 py-2"
              value={factura.metodo_pago}
              onChange={(e) => setFactura((s) => ({ ...s, metodo_pago: e.target.value }))}
            >
              <option value="CONTADO">CONTADO</option>
              <option value="CREDITO">CREDITO</option>
            </select>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Pendiente</TablaCelda>
                <TablaCelda as="th">Cantidad recibir</TablaCelda>
                <TablaCelda as="th">Costo unit real</TablaCelda>
                <TablaCelda as="th">Subtotal</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(ordenActual?.detalle || []).map((d) => {
                const unidad = d.unidad_medida || d.unidad;
                const pendiente = Number(d.cantidad) - Number(d.cantidad_recibida);
                const qty = parseQtyByUnit(recv[d.id]?.cantidad, unidad);
                const cost = Number(String(recv[d.id]?.costo_unit_real || '').replace(',', '.'));
                const safeQty = Number.isFinite(qty) ? qty : 0;
                const safeCost = Number.isFinite(cost) ? cost : 0;

                return (
                  <TablaFila key={d.id}>
                    <TablaCelda>{d.producto_codigo} - {d.producto_nombre}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(pendiente, unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>
                      <input
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1"
                        value={recv[d.id]?.cantidad || ''}
                        onChange={(e) => setRecv((s) => ({ ...s, [d.id]: { ...s[d.id], cantidad: sanitizeQtyInput(e.target.value, unidad) } }))}
                        placeholder={unidad === 'UND' ? '0' : '0.00'}
                      />
                    </TablaCelda>
                    <TablaCelda>
                      <input
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1"
                        value={recv[d.id]?.costo_unit_real || ''}
                        onChange={(e) => setRecv((s) => ({ ...s, [d.id]: { ...s[d.id], costo_unit_real: sanitizeDecimalInput(e.target.value, 2) } }))}
                        placeholder="0.00"
                      />
                    </TablaCelda>
                    <TablaCelda>{formatMoney(safeQty * safeCost)}</TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>
          <Paginador paginaActual={1} totalPaginas={1} totalRegistros={ordenActual?.detalle?.length || 0} mostrarSiempre />

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Total recepcion: {formatMoney(totalRecepcion)}</p>
            <button className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={onRegistrar}>
              Confirmar recepcion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
