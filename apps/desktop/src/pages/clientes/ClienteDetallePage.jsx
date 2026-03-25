import { useEffect, useMemo, useState } from 'react';
import { PiCurrencyDollar, PiEye } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
import {
  Alert,
  Button,
  Card,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Paginador,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../ui';
import { useClientesStore } from '../../stores/clientesStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { getUnidad, formatQtyByUnit } from '../../lib/formatQty';

const PAGE_SIZE = 8;

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

function formatDetalleCantidad(value, unidad) {
  const unit = getUnidad(unidad);
  return `${formatQtyByUnit(value, unit)} ${unit}`;
}

export default function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clienteDetalle, facturas, resumen, error, detalle, cargarFacturas, creditoResumen, abonar } = useClientesStore();
  const configuracion = useConfiguracionStore((state) => state.configuracion);

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

  const facturasDecoradas = useMemo(() => {
    const rows = facturas.map((row) => ({
      ...row,
      credito_pendiente: Math.max(0, Number(row.saldo || 0))
    }));

    return rows.sort((a, b) => {
      const pA = Number(a.credito_pendiente || 0) > 0 ? 0 : 1;
      const pB = Number(b.credito_pendiente || 0) > 0 ? 0 : 1;
      if (pA !== pB) return pA - pB;
      const fechaA = String(a.fecha_vencimiento || '');
      const fechaB = String(b.fecha_vencimiento || '');
      if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
      return Number(b.id) - Number(a.id);
    });
  }, [facturas]);

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
    <div className="space-y-5">
      <PageHeader
        title="Detalle cliente"
        description="Facturas y gestion de abonos de credito."
        actions={(
          <Button variant="secondary" onClick={() => navigate('/clientes')}>
            Volver
          </Button>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {clienteDetalle && (
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cliente</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle.nombre}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Telefono</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle.telefono || '-'}</span>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</span>
                <StatusBadge status={clienteDetalle.activo ? 'ACTIVO' : 'INACTIVO'} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Direccion</span>
                <span className="text-[var(--color-text)]">{clienteDetalle.direccion || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Saldo credito</span>
                <span className={`text-lg font-bold ${Number(resumen?.saldo || 0) > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                  {formatMoney(resumen?.saldo)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="font-semibold text-[var(--color-text)]">Facturas del cliente</p>
          <span className="ui-chip ui-chip-info">{facturasDecoradas.length} registros</span>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Venta / factura</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Metodo</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th" className="text-right">Total</TablaCelda>
              <TablaCelda as="th" className="text-right">Credito pendiente</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {facturasPaginadas.map((f) => {
              const pendiente = Number(f.credito_pendiente || 0);
              const sinPendiente = pendiente <= 0;

              return (
                <TablaFila key={f.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{f.referencia || `#${f.id}`}</TablaCelda>
                  <TablaCelda>{formatDateQuito(f.fecha)}</TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={f.metodo} />
                  </TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={f.estado} />
                  </TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(f.total)}</TablaCelda>
                  <TablaCelda className={`text-right font-semibold ${pendiente > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                    {formatMoney(pendiente)}
                  </TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        variant="iconView"
                        size="sm"
                        aria-label="Ver factura"
                        title="Ver factura"
                        onClick={() => abrirDetalleFactura(f.id)}
                      >
                        <PiEye className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant="iconSecondary"
                        size="sm"
                        aria-label="Registrar abono"
                        title={sinPendiente ? 'Sin saldo pendiente' : 'Registrar abono'}
                        disabled={sinPendiente}
                        onClick={() => abrirModalAbono(f)}
                      >
                        <PiCurrencyDollar className="text-lg" />
                      </IconButton>
                    </div>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <div className="px-5 pb-5">
          <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={facturasDecoradas.length} mostrarSiempre onPageChange={setPagina} />
        </div>
      </Card>

      <Modal open={Boolean(modalAbono)} onClose={() => setModalAbono(null)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Registrar abono</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Factura {modalAbono?.referencia || `#${modalAbono?.id || ''}`}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setModalAbono(null)}>
            X
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <p className="text-[var(--color-text-muted)]">Saldo actual: <span className="font-semibold text-[var(--color-text)]">{formatMoney(Math.min(Number(modalAbono?.credito_pendiente || 0), Number(resumen?.saldo || 0)))}</span></p>
          <p className="text-[var(--color-text-muted)]">
            Cliente: <span className="font-semibold text-[var(--color-text)]">{clienteDetalle?.nombre || '-'}</span>
          </p>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {configuracion?.exigir_caja_abierta_para_cobros
            ? 'Este cobro impacta caja y requiere turno abierto.'
            : 'Este cobro puede registrarse sin turno abierto; si existe turno abierto tambien queda en caja.'}
        </p>

        {abonoError && <Alert tone="error" className="mt-3">{abonoError}</Alert>}

        <div className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr_1.3fr]">
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]">Valor</label>
            <Input className="mt-2" placeholder="10.00" value={abonoForm.monto} onChange={(e) => setAbonoForm((s) => ({ ...s, monto: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]">Referencia</label>
            <Input className="mt-2" placeholder="Transferencia / efectivo" value={abonoForm.referencia} onChange={(e) => setAbonoForm((s) => ({ ...s, referencia: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]">Observacion</label>
            <Textarea className="mt-2" value={abonoForm.observacion} onChange={(e) => setAbonoForm((s) => ({ ...s, observacion: e.target.value }))} />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalAbono(null)}>
            Cancelar
          </Button>
          <Button onClick={registrarAbono}>
            Guardar abono
          </Button>
        </div>
      </Modal>

      <Modal open={modalFactura && Boolean(ventaDetalle?.venta)} onClose={() => setModalFactura(false)} maxWidthClass="max-w-5xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Detalle factura</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setModalFactura(false)}>
            X
          </Button>
        </div>

        <Card className="mt-4 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">N factura / venta</span>
                <span className="font-semibold text-[var(--color-text)]">{ventaDetalle?.venta?.referencia || `#${ventaDetalle?.venta?.id || ''}`}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cliente</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle?.nombre || ventaDetalle?.venta?.cliente_nombre || 'Consumidor final'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Fecha</span>
                <span className="font-semibold text-[var(--color-text)]">{formatDateQuito(ventaDetalle?.venta?.fecha)}</span>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo de pago</span>
                <StatusBadge status={metodoActual} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</span>
                <StatusBadge status={ventaDetalle?.venta?.estado} />
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="grid grid-cols-[minmax(0,1.6fr)_140px_140px_140px] gap-0 border-b border-[var(--color-border)] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <div>Producto</div>
            <div>Cantidad</div>
            <div className="text-right">P.unit</div>
            <div className="text-right">Subtotal</div>
          </div>

          {(ventaDetalle?.detalle || []).map((d, index) => (
            <div
              key={d.id}
              className={`grid grid-cols-[minmax(0,1.6fr)_140px_140px_140px] gap-0 px-6 py-4 text-sm ${index > 0 ? 'border-t border-[var(--color-border)]' : ''}`}
            >
              <div className="pr-4 font-medium text-[var(--color-text)]">{d.producto_codigo} - {d.producto_nombre}</div>
              <div className="font-medium text-[var(--color-text)]">{formatDetalleCantidad(d.cantidad, d.unidad_medida || d.unidad)}</div>
              <div className="text-right font-medium text-[var(--color-text)]">{formatMoney(d.precio_unit)}</div>
              <div className="text-right font-semibold text-[var(--color-text)]">{formatMoney(d.total_linea)}</div>
            </div>
          ))}
        </div>

        {(ventaDetalle?.abonos || []).length > 0 && (
          <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="grid grid-cols-[220px_minmax(0,1fr)_140px] gap-0 border-b border-[var(--color-border)] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <div>Fecha</div>
              <div>Observacion</div>
              <div className="text-right">Monto</div>
            </div>

            {(ventaDetalle.abonos || []).map((abono, index) => (
              <div
                key={abono.id}
                className={`grid grid-cols-[220px_minmax(0,1fr)_140px] gap-0 px-6 py-4 text-sm ${index > 0 ? 'border-t border-[var(--color-border)]' : ''}`}
              >
                <div className="pr-4 text-[var(--color-text)]">{formatDateQuito(abono.fecha)}</div>
                <div className="text-[var(--color-text)]">{abono.observacion || '-'}</div>
                <div className="text-right font-semibold text-[var(--color-text)]">{formatMoney(abono.monto)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <div className="grid w-[140px] gap-2 text-right">
            <p className="text-sm text-[var(--color-text-muted)]">
              <span className="font-semibold">Subtotal:</span> {formatMoney(ventaDetalle?.venta?.subtotal)}
            </p>
            <p className="text-lg font-bold text-[var(--color-text)]">
              <span>Total:</span> {formatMoney(ventaDetalle?.venta?.total)}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
