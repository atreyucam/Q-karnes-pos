import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import Modal from '../../components/ui/Modal';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';

const PAGE_SIZE = 8;

export default function ProveedorDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    proveedorDetalle,
    facturas,
    resumenCxp,
    loading,
    error,
    getById,
    cargarFacturas,
    cargarResumenCxp,
    pagarCredito,
    actualizar,
    cargarFacturaDetalle
  } = useProveedoresStore();

  const [pagina, setPagina] = useState(1);
  const [modalPago, setModalPago] = useState(null);
  const [montoPago, setMontoPago] = useState('0');
  const [referencia, setReferencia] = useState('');
  const [modalFactura, setModalFactura] = useState(false);
  const [facturaDetalle, setFacturaDetalle] = useState(null);

  const proveedorId = Number(id);

  const loadData = async () => {
    await Promise.all([getById(proveedorId), cargarFacturas(proveedorId), cargarResumenCxp(proveedorId)]);
  };

  useEffect(() => {
    if (!Number.isFinite(proveedorId) || proveedorId <= 0) return;
    loadData();
  }, [proveedorId]);

  const facturasOrdenadas = useMemo(() => {
    return [...facturas].sort((a, b) => {
      const pA = Number(a.pendiente || 0) > 0 ? 0 : 1;
      const pB = Number(b.pendiente || 0) > 0 ? 0 : 1;
      if (pA !== pB) return pA - pB;
      return Number(b.id) - Number(a.id);
    });
  }, [facturas]);

  const totalPaginas = Math.max(1, Math.ceil(facturasOrdenadas.length / PAGE_SIZE));
  const facturasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return facturasOrdenadas.slice(start, start + PAGE_SIZE);
  }, [facturasOrdenadas, pagina]);

  useEffect(() => {
    setPagina(1);
  }, [facturas.length]);

  const onPagar = async () => {
    if (!modalPago) return;
    await pagarCredito(proveedorId, {
      factura_id: modalPago.id,
      monto: Number(montoPago || 0),
      referencia: referencia || null
    });
    setModalPago(null);
    setMontoPago('0');
    setReferencia('');
    loadData();
  };

  const onVerFactura = async (facturaId) => {
    const data = await cargarFacturaDetalle(proveedorId, facturaId);
    setFacturaDetalle(data);
    setModalFactura(true);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => navigate('/proveedores')}>
            Volver
          </button>
          <h2 className="mt-3 text-2xl font-semibold text-slate-800">Detalle proveedor</h2>
          <p className="text-sm text-slate-500">Facturas, saldo pendiente y pagos</p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {proveedorDetalle && (
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Nombre</p>
                <p className="font-semibold text-slate-800">{proveedorDetalle.nombre}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Telefono</p>
                <p className="font-semibold text-slate-800">{proveedorDetalle.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Credito / dias</p>
                <p className="font-semibold text-slate-800">{proveedorDetalle.tiene_credito ? 'SI' : 'NO'} / {Number(proveedorDetalle.dias_pago || 0)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(proveedorDetalle.activo ? 'ACTIVO' : 'INACTIVO')}`}>
                  {proveedorDetalle.activo ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Saldo pendiente</p>
                <p className="text-lg font-bold text-[#b41428]">{formatMoney(resumenCxp?.saldo)}</p>
              </div>
              <div className="pt-1">
                <button
                  className="rounded-xl bg-[#b41428] px-3 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
                  onClick={async () => {
                    await actualizar(proveedorId, { activo: !proveedorDetalle.activo });
                    loadData();
                  }}
                >
                  {proveedorDetalle.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold text-slate-800">Facturas / Compras del proveedor</p>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">N factura</TablaCelda>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Total</TablaCelda>
                <TablaCelda as="th">Metodo</TablaCelda>
                <TablaCelda as="th">Pendiente</TablaCelda>
                <TablaCelda as="th">Accion</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {facturasPaginadas.map((f) => {
                const pendiente = Number(f.pendiente || 0);
                return (
                  <TablaFila key={f.id}>
                    <TablaCelda>{f.numero_factura}</TablaCelda>
                    <TablaCelda>{formatDateQuito(f.fecha)}</TablaCelda>
                    <TablaCelda>{formatMoney(f.total)}</TablaCelda>
                    <TablaCelda>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(f.metodo_pago)}`}>
                        {f.metodo_pago}
                      </span>
                    </TablaCelda>
                    <TablaCelda className={pendiente > 0 ? 'font-bold text-[#b41428]' : ''}>{formatMoney(pendiente)}</TablaCelda>
                    <TablaCelda>
                      <div className="flex justify-end gap-2">
                        <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white" onClick={() => onVerFactura(f.id)}>
                          Ver
                        </button>
                        {f.metodo_pago === 'CREDITO' && pendiente > 0 && (
                          <button
                            className="rounded-lg bg-[#b41428] px-3 py-1.5 text-xs text-white hover:bg-[#8f1020]"
                            onClick={() => {
                              setModalPago(f);
                              setMontoPago(String(Number(f.pendiente || 0).toFixed(2)));
                            }}
                          >
                            Pagar credito
                          </button>
                        )}
                      </div>
                    </TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>

          <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={facturasOrdenadas.length} mostrarSiempre onPageChange={setPagina} />
        </div>
      </div>

      <Modal open={Boolean(modalPago)} onClose={() => setModalPago(null)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Pagar credito</h3>
            <p className="text-sm text-slate-500">Factura {modalPago?.numero_factura}</p>
          </div>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setModalPago(null)}>
            X
          </button>
        </div>

        <p className="mt-1 text-sm text-slate-600">Pendiente: {formatMoney(modalPago?.pendiente)}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2" value={montoPago} onChange={(e) => setMontoPago(e.target.value)} placeholder="Monto a pagar" />
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia (opcional)" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setModalPago(null)}>
            Cancelar
          </button>
          <button disabled={loading} className="rounded-xl bg-[#b41428] px-3 py-2 text-sm font-medium text-white hover:bg-[#8f1020] disabled:opacity-60" onClick={onPagar}>
            Confirmar pago
          </button>
        </div>
      </Modal>

      <Modal open={modalFactura && Boolean(facturaDetalle)} onClose={() => setModalFactura(false)} maxWidthClass="max-w-4xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Detalle factura proveedor</h3>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setModalFactura(false)}>
            X
          </button>
        </div>

        {facturaDetalle?.factura && (
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Factura</p>
              <p className="font-semibold text-slate-800">{facturaDetalle.factura.numero_factura}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
              <p className="font-semibold text-slate-800">{formatDateQuito(facturaDetalle.factura.fecha)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Metodo</p>
              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(facturaDetalle.factura.metodo_pago)}`}>
                {facturaDetalle.factura.metodo_pago}
              </span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
              <p className="font-semibold text-slate-800">{formatMoney(facturaDetalle.factura.total)}</p>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">C.Unit</TablaCelda>
                <TablaCelda as="th">Subtotal</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(facturaDetalle?.items || []).map((item) => (
                <TablaFila key={item.id}>
                  <TablaCelda>{item.producto_codigo} - {item.producto_nombre}</TablaCelda>
                  <TablaCelda>{formatQtyByUnit(item.cantidad, item.unidad_medida || item.unidad, { fixedLB: true })}</TablaCelda>
                  <TablaCelda>{formatMoney(item.costo_unit_real)}</TablaCelda>
                  <TablaCelda>{formatMoney(item.subtotal)}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>

          {(facturaDetalle?.movimientos || []).length > 0 && (
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Tipo</TablaCelda>
                  <TablaCelda as="th">Monto</TablaCelda>
                  <TablaCelda as="th">Observacion</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {(facturaDetalle.movimientos || []).map((mov) => (
                  <TablaFila key={mov.id}>
                    <TablaCelda>{formatDateQuito(mov.fecha)}</TablaCelda>
                    <TablaCelda>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(mov.tipo === 'ABONO' ? 'PARCIAL' : 'CREDITO')}`}>
                        {mov.tipo}
                      </span>
                    </TablaCelda>
                    <TablaCelda>{formatMoney(mov.monto)}</TablaCelda>
                    <TablaCelda>{mov.observacion || '-'}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          )}
        </div>
      </Modal>
    </div>
  );
}
