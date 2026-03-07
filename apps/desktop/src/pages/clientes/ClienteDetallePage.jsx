import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import Modal from '../../components/ui/Modal';
import { getStatusClasses } from '../../components/ui/statusColors';
import { useClientesStore } from '../../stores/clientesStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';

const PAGE_SIZE = 8;

function calcPendientes(facturas, saldoCliente) {
  const pendientesById = new Map();
  let restante = Math.max(0, Number(saldoCliente || 0));

  const ordered = [...facturas].sort((a, b) => Number(a.id) - Number(b.id));
  for (const row of ordered) {
    const credito = Math.max(0, Number(row.credito || 0));
    const pendiente = Math.max(0, Math.min(credito, restante));
    pendientesById.set(row.id, pendiente);
    restante = Math.max(0, restante - pendiente);
  }

  return pendientesById;
}

function metodoVenta(detalle) {
  const pagos = detalle?.pagos || [];
  const contado = pagos
    .filter((p) => String(p.tipo || '').toUpperCase() === 'CONTADO')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);
  const credito = pagos
    .filter((p) => String(p.tipo || '').toUpperCase() === 'CREDITO')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);

  if (contado > 0 && credito > 0) return 'MIXTO';
  if (credito > 0) return 'CREDITO';
  return 'CONTADO';
}

export default function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clienteDetalle, facturas, resumen, error, detalle, cargarFacturas, creditoResumen, abonar } = useClientesStore();

  const clienteId = Number(id);
  const [pagina, setPagina] = useState(1);
  const [modalAbono, setModalAbono] = useState(null);
  const [abonoForm, setAbonoForm] = useState({ monto: '', referencia: '', observacion: '' });
  const [abonoError, setAbonoError] = useState('');
  const [modalFactura, setModalFactura] = useState(false);
  const [ventaDetalle, setVentaDetalle] = useState(null);

  const loadData = async () => {
    await Promise.all([detalle(clienteId), cargarFacturas(clienteId), creditoResumen(clienteId)]);
  };

  useEffect(() => {
    if (!Number.isFinite(clienteId) || clienteId <= 0) return;
    loadData();
  }, [clienteId]);

  useEffect(() => {
    setPagina(1);
  }, [facturas.length]);

  const pendientesById = useMemo(() => calcPendientes(facturas, resumen?.saldo), [facturas, resumen?.saldo]);

  const facturasDecoradas = useMemo(() => {
    const rows = facturas.map((row) => ({
      ...row,
      credito_pendiente: pendientesById.get(row.id) || 0
    }));

    return rows.sort((a, b) => {
      const pA = Number(a.credito_pendiente || 0) > 0 ? 0 : 1;
      const pB = Number(b.credito_pendiente || 0) > 0 ? 0 : 1;
      if (pA !== pB) return pA - pB;
      return Number(b.id) - Number(a.id);
    });
  }, [facturas, pendientesById]);

  const facturasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return facturasDecoradas.slice(start, start + PAGE_SIZE);
  }, [facturasDecoradas, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(facturasDecoradas.length / PAGE_SIZE));

  const abrirModalAbono = (factura) => {
    setModalAbono(factura);
    setAbonoForm({ monto: '', referencia: '', observacion: '' });
    setAbonoError('');
  };

  const registrarAbono = async () => {
    if (!modalAbono) return;

    const saldoFactura = Math.min(Number(modalAbono.credito_pendiente || 0), Number(resumen?.saldo || 0));
    const monto = Number(abonoForm.monto || 0);

    if (!(monto > 0)) {
      setAbonoError('El monto debe ser mayor a 0');
      return;
    }

    if (monto > saldoFactura) {
      setAbonoError('El monto no puede exceder el saldo pendiente');
      return;
    }

    await abonar(clienteId, {
      monto,
      venta_id: modalAbono.id,
      referencia: abonoForm.referencia || undefined,
      observacion: abonoForm.observacion || undefined
    });

    setModalAbono(null);
    setAbonoForm({ monto: '', referencia: '', observacion: '' });
    setAbonoError('');
    await loadData();

    if (ventaDetalle?.venta?.id === modalAbono.id) {
      const response = await apiClient.get(`/api/ventas/${modalAbono.id}`);
      setVentaDetalle(normalizeResponse(response.data));
    }
  };

  const abrirDetalleFactura = async (ventaId) => {
    const response = await apiClient.get(`/api/ventas/${ventaId}`);
    setVentaDetalle(normalizeResponse(response.data));
    setModalFactura(true);
  };

  const metodoActual = metodoVenta(ventaDetalle);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => navigate('/clientes')}>
            Volver
          </button>
          <h2 className="mt-3 text-2xl font-semibold text-slate-800">Detalle cliente</h2>
          <p className="text-sm text-slate-500">Facturas y gestion de abonos de credito</p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {clienteDetalle && (
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Nombre</p>
                <p className="font-semibold text-slate-800">{clienteDetalle.nombre}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Telefono</p>
                <p className="font-semibold text-slate-800">{clienteDetalle.telefono || '-'}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(clienteDetalle.activo ? 'ACTIVO' : 'INACTIVO')}`}>
                  {clienteDetalle.activo ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Saldo credito</p>
                <p className={`text-lg font-bold ${Number(resumen?.saldo || 0) > 0 ? 'text-[#b41428]' : 'text-slate-800'}`}>{formatMoney(resumen?.saldo)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold text-slate-800">Facturas del cliente</p>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">VENTA/FACTURA</TablaCelda>
                <TablaCelda as="th">FECHA</TablaCelda>
                <TablaCelda as="th">METODO</TablaCelda>
                <TablaCelda as="th">ESTADO</TablaCelda>
                <TablaCelda as="th">TOTAL</TablaCelda>
                <TablaCelda as="th">CREDITO PENDIENTE</TablaCelda>
                <TablaCelda as="th">ACCIONES</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {facturasPaginadas.map((f) => {
                const pendiente = Number(f.credito_pendiente || 0);
                const sinPendiente = pendiente <= 0;

                return (
                  <TablaFila key={f.id}>
                    <TablaCelda>{f.referencia || `#${f.id}`}</TablaCelda>
                    <TablaCelda>{formatDateQuito(f.fecha)}</TablaCelda>
                    <TablaCelda>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(f.metodo)}`}>
                        {f.metodo}
                      </span>
                    </TablaCelda>
                    <TablaCelda>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(f.estado)}`}>
                        {f.estado}
                      </span>
                    </TablaCelda>
                    <TablaCelda>{formatMoney(f.total)}</TablaCelda>
                    <TablaCelda className={pendiente > 0 ? 'font-bold text-[#b41428]' : ''}>{formatMoney(pendiente)}</TablaCelda>
                    <TablaCelda>
                      <div className="flex justify-end gap-2">
                        <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white" onClick={() => abrirDetalleFactura(f.id)}>
                          Ver
                        </button>
                        <button
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={sinPendiente}
                          title={sinPendiente ? 'Sin saldo pendiente' : 'Registrar abono'}
                          onClick={() => abrirModalAbono(f)}
                        >
                          Registrar abono
                        </button>
                      </div>
                    </TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>

          <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={facturasDecoradas.length} mostrarSiempre onPageChange={setPagina} />
        </div>
      </div>

      <Modal open={Boolean(modalAbono)} onClose={() => setModalAbono(null)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Registrar abono</h3>
            <p className="text-sm text-slate-500">Factura {modalAbono?.referencia || `#${modalAbono?.id || ''}`}</p>
          </div>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setModalAbono(null)}>
            X
          </button>
        </div>

        <p className="mt-1 text-sm text-slate-700">Saldo actual: {formatMoney(Math.min(Number(modalAbono?.credito_pendiente || 0), Number(resumen?.saldo || 0)))}</p>

        {abonoError && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{abonoError}</p>}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Valor</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="10.00" value={abonoForm.monto} onChange={(e) => setAbonoForm((s) => ({ ...s, monto: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Referencia (opcional)</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Transferencia / efectivo" value={abonoForm.referencia} onChange={(e) => setAbonoForm((s) => ({ ...s, referencia: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Observacion (opcional)</label>
            <textarea className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={abonoForm.observacion} onChange={(e) => setAbonoForm((s) => ({ ...s, observacion: e.target.value }))} />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setModalAbono(null)}>
            Cancelar
          </button>
          <button className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={registrarAbono}>
            Guardar abono
          </button>
        </div>
      </Modal>

      <Modal open={modalFactura && Boolean(ventaDetalle?.venta)} onClose={() => setModalFactura(false)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Detalle factura</h3>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setModalFactura(false)}>
            X
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">N factura / venta</p>
            <p className="font-medium text-slate-800">{ventaDetalle?.venta?.referencia || `#${ventaDetalle?.venta?.id || ''}`}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Cliente</p>
            <p className="font-medium text-slate-800">{clienteDetalle?.nombre || ventaDetalle?.venta?.cliente_nombre || 'Consumidor final'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
            <p className="font-medium text-slate-800">{formatDateQuito(ventaDetalle?.venta?.fecha)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tipo de pago</p>
            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(metodoActual)}`}>
              {metodoActual}
            </span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClasses(ventaDetalle?.venta?.estado)}`}>
              {ventaDetalle?.venta?.estado}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">P.unit</TablaCelda>
                <TablaCelda as="th">Subtotal</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(ventaDetalle?.detalle || []).map((d) => (
                <TablaFila key={d.id}>
                  <TablaCelda>{d.producto_codigo} - {d.producto_nombre}</TablaCelda>
                  <TablaCelda>{formatQtyByUnit(d.cantidad, d.unidad_medida || d.unidad, { fixedLB: true })}</TablaCelda>
                  <TablaCelda>{formatMoney(d.precio_unit)}</TablaCelda>
                  <TablaCelda>{formatMoney(d.total_linea)}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>

          {(ventaDetalle?.abonos || []).length > 0 && (
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Monto</TablaCelda>
                  <TablaCelda as="th">Referencia</TablaCelda>
                  <TablaCelda as="th">Observacion</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {(ventaDetalle.abonos || []).map((abono) => (
                  <TablaFila key={abono.id}>
                    <TablaCelda>{formatDateQuito(abono.fecha)}</TablaCelda>
                    <TablaCelda>{formatMoney(abono.monto)}</TablaCelda>
                    <TablaCelda>{abono.referencia || '-'}</TablaCelda>
                    <TablaCelda>{abono.observacion || '-'}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <div className="space-y-1 text-right">
            <p className="text-sm text-slate-600">Subtotal: {formatMoney(ventaDetalle?.venta?.subtotal)}</p>
            <p className="text-lg font-bold text-slate-800">Total: {formatMoney(ventaDetalle?.venta?.total)}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
