import { useEffect, useMemo, useState } from 'react';
import { PiCurrencyDollar, PiEye } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  BackButton,
  Button,
  Card,
  DeactivateEntityDialogs,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Paginador,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../ui';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';

const PAGE_SIZE = 8;

export default function ProveedorDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const configuracion = useConfiguracionStore((state) => state.configuracion);
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
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');
  const [deactivateLoading, setDeactivateLoading] = useState(false);

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
      const pendienteA = Number(a.pendiente || 0) > 0 ? 0 : 1;
      const pendienteB = Number(b.pendiente || 0) > 0 ? 0 : 1;
      if (pendienteA !== pendienteB) return pendienteA - pendienteB;
      return Number(b.id) - Number(a.id);
    });
  }, [facturas]);

  const totalPaginas = Math.max(1, Math.ceil(facturasOrdenadas.length / PAGE_SIZE));
  const facturasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return facturasOrdenadas.slice(start, start + PAGE_SIZE);
  }, [facturasOrdenadas, pagina]);
  const facturaResumenSeleccionada = useMemo(
    () => facturas.find((factura) => Number(factura.id) === Number(facturaDetalle?.factura?.id)) || null,
    [facturaDetalle?.factura?.id, facturas]
  );
  const facturaPendiente = useMemo(() => {
    if (facturaResumenSeleccionada) return Number(facturaResumenSeleccionada.pendiente || 0);

    const movimientos = facturaDetalle?.movimientos || [];
    const cargos = movimientos
      .filter((movimiento) => movimiento.tipo === 'CARGO')
      .reduce((acc, movimiento) => acc + Number(movimiento.monto || 0), 0);
    const abonos = movimientos
      .filter((movimiento) => movimiento.tipo === 'ABONO')
      .reduce((acc, movimiento) => acc + Number(movimiento.monto || 0), 0);
    const base = cargos > 0 ? cargos : Number(facturaDetalle?.factura?.total || 0);
    return Math.max(0, base - abonos);
  }, [facturaDetalle?.factura?.total, facturaDetalle?.movimientos, facturaResumenSeleccionada]);

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

  const onToggleProveedor = async () => {
    if (!proveedorDetalle) return;

    if (proveedorDetalle.activo) {
      setConfirmDeactivateOpen(true);
      return;
    }

    try {
      await actualizar(proveedorId, { activo: true });
      loadData();
    } catch (_) {
      // store error already exposed in page alert
    }
  };

  const onConfirmDeactivate = async () => {
    setDeactivateLoading(true);
    try {
      await actualizar(proveedorId, { activo: false });
      setConfirmDeactivateOpen(false);
      loadData();
    } catch (error) {
      setConfirmDeactivateOpen(false);
      setDeactivateError(error.message || 'El sistema no permitio desactivar este proveedor.');
    } finally {
      setDeactivateLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <BackButton to="/proveedores">Volver</BackButton>

      <PageHeader
        title="Detalle proveedor"
        description="Facturas, saldo pendiente y pagos."
        actions={(
          <div className="flex flex-wrap gap-2">
            {proveedorDetalle && (
              <Button
                variant={proveedorDetalle.activo ? 'danger' : 'primary'}
                onClick={onToggleProveedor}
              >
                {proveedorDetalle.activo ? 'Desactivar proveedor' : 'Activar proveedor'}
              </Button>
            )}
          </div>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {proveedorDetalle && (
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Proveedor</span>
                <span className="font-semibold text-[var(--color-text)]">{proveedorDetalle.nombre}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Telefono</span>
                <span className="font-semibold text-[var(--color-text)]">{proveedorDetalle.telefono || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Direccion</span>
                <span className="text-[var(--color-text)]">{proveedorDetalle.direccion || '-'}</span>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</span>
                <StatusBadge status={proveedorDetalle.activo ? 'ACTIVO' : 'INACTIVO'} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Credito / dias</span>
                <StatusBadge tone={proveedorDetalle.tiene_credito ? 'warning' : 'neutral'}>
                  {proveedorDetalle.tiene_credito ? `${Number(proveedorDetalle.dias_pago || 0)} dias` : 'Sin credito'}
                </StatusBadge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Saldo pendiente</span>
                <span className={`text-lg font-bold ${Number(resumenCxp?.saldo || 0) > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                  {formatMoney(resumenCxp?.saldo)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="font-semibold text-[var(--color-text)]">Facturas / compras del proveedor</p>
          <span className="ui-chip ui-chip-info">{facturasOrdenadas.length} registros</span>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">N factura</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Metodo</TablaCelda>
              <TablaCelda as="th" className="text-right">Total</TablaCelda>
              <TablaCelda as="th" className="text-right">Pendiente</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {facturasPaginadas.map((factura) => {
              const pendiente = Number(factura.pendiente || 0);
              const sinPendiente = pendiente <= 0;
              return (
                <TablaFila key={factura.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{factura.numero_factura}</TablaCelda>
                  <TablaCelda>{formatDateQuito(factura.fecha)}</TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={factura.metodo_pago} />
                  </TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(factura.total)}</TablaCelda>
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
                        onClick={() => onVerFactura(factura.id)}
                      >
                        <PiEye className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant="iconSecondary"
                        size="sm"
                        aria-label="Pagar credito"
                        title={sinPendiente ? 'Sin saldo pendiente' : 'Pagar credito'}
                        disabled={factura.metodo_pago !== 'CREDITO' || sinPendiente}
                        onClick={() => {
                          setModalPago(factura);
                          setMontoPago(String(Number(factura.pendiente || 0).toFixed(2)));
                          setReferencia('');
                        }}
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
          <Paginador
            paginaActual={pagina}
            totalPaginas={totalPaginas}
            totalRegistros={facturasOrdenadas.length}
            mostrarSiempre
            onPageChange={setPagina}
          />
        </div>
      </Card>

      {loading && <LoadingState label="Cargando proveedor..." />}

      <Modal open={Boolean(modalPago)} onClose={() => setModalPago(null)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Pagar credito</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Factura {modalPago?.numero_factura}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setModalPago(null)}>
            X
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <p className="text-[var(--color-text-muted)]">Pendiente: <span className="font-semibold text-[var(--color-text)]">{formatMoney(modalPago?.pendiente)}</span></p>
          <p className="text-[var(--color-text-muted)]">
            {configuracion?.exigir_caja_abierta_para_pagos
              ? 'Este pago impacta caja y requiere turno abierto.'
              : 'Este pago puede registrarse sin turno abierto; si existe turno abierto tambien queda en caja.'}
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Monto</label>
            <Input className="mt-2" value={montoPago} onChange={(e) => setMontoPago(e.target.value)} placeholder="Monto a pagar" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Referencia</label>
            <Input className="mt-2" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia (opcional)" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalPago(null)}>
            Cancelar
          </Button>
          <Button disabled={loading} onClick={onPagar}>
            Confirmar pago
          </Button>
        </div>
      </Modal>

      <Modal open={modalFactura && Boolean(facturaDetalle)} onClose={() => setModalFactura(false)} maxWidthClass="max-w-5xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Detalle factura proveedor</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Resumen de compra, pagos y trazabilidad de la factura.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setModalFactura(false)}>
            X
          </Button>
        </div>

        {facturaDetalle?.factura && (
          <Card className="mt-4 grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Proveedor</p>
                <p className="text-[1.12rem] font-bold text-[var(--color-text)]">{proveedorDetalle?.nombre || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Telefono</p>
                <p className="font-semibold text-[var(--color-text)]">{proveedorDetalle?.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Credito / dias</p>
                <p className="font-semibold text-[var(--color-text)]">
                  {proveedorDetalle?.tiene_credito ? 'SI' : 'NO'} / {Number(proveedorDetalle?.dias_pago || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Factura</p>
                <p className="font-semibold text-[var(--color-text)]">{facturaDetalle.factura.numero_factura}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Fecha emision</p>
                <p className="font-semibold text-[var(--color-text)]">{formatDateQuito(facturaDetalle.factura.fecha)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Observacion</p>
                <p className="font-semibold text-[var(--color-text)]">{facturaDetalle.factura.observacion || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Método de pago</p>
                <div className="pt-1">
                  <StatusBadge status={facturaDetalle.factura.metodo_pago} />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Pendiente residual</p>
                <p className={`font-semibold ${facturaPendiente > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                  {formatMoney(facturaPendiente)}
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="mt-4 space-y-4">
          {(facturaResumenSeleccionada?.orden_id || facturaResumenSeleccionada?.recepcion_id || facturaResumenSeleccionada?.fecha_vencimiento) && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Orden asociada</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                  {facturaResumenSeleccionada?.orden_id ? `#${facturaResumenSeleccionada.orden_id}` : '-'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Recepción asociada</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                  {facturaResumenSeleccionada?.recepcion_id ? `#${facturaResumenSeleccionada.recepcion_id}` : '-'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Vencimiento</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                  {facturaResumenSeleccionada?.fecha_vencimiento ? formatDateQuito(facturaResumenSeleccionada.fecha_vencimiento) : '-'}
                </p>
              </div>
            </div>
          )}

          <Card className="space-y-3 p-4">
            <p className="font-semibold text-[var(--color-text)]">Items factura</p>
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Cantidad</TablaCelda>
                  <TablaCelda as="th" className="text-right">C.Unit</TablaCelda>
                  <TablaCelda as="th" className="text-right">Subtotal</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {(facturaDetalle?.items || []).map((item) => (
                  <TablaFila key={item.id}>
                    <TablaCelda>{item.producto_codigo} - {item.producto_nombre}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(item.cantidad, item.unidad_medida || item.unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(item.costo_unit_real)}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(item.subtotal)}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </Card>

          {(facturaDetalle?.movimientos || []).length > 0 && (
            <Card className="space-y-3 p-4">
              <p className="font-semibold text-[var(--color-text)]">Movimientos de pago</p>
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Fecha</TablaCelda>
                    <TablaCelda as="th">Tipo</TablaCelda>
                    <TablaCelda as="th" className="text-right">Monto</TablaCelda>
                    <TablaCelda as="th">Observacion</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {(facturaDetalle.movimientos || []).map((movimiento) => (
                    <TablaFila key={movimiento.id}>
                      <TablaCelda>{formatDateQuito(movimiento.fecha || movimiento.fecha_emision)}</TablaCelda>
                      <TablaCelda>
                        <StatusBadge status={movimiento.tipo === 'ABONO' ? 'PARCIAL' : 'CREDITO'}>
                          {movimiento.tipo}
                        </StatusBadge>
                      </TablaCelda>
                      <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(movimiento.monto)}</TablaCelda>
                      <TablaCelda>{movimiento.observacion || movimiento.referencia || '-'}</TablaCelda>
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>
            </Card>
          )}
        </div>
      </Modal>

      <DeactivateEntityDialogs
        confirmOpen={confirmDeactivateOpen}
        entityLabel={proveedorDetalle ? `al proveedor ${proveedorDetalle.nombre}` : 'este proveedor'}
        onCloseConfirm={() => setConfirmDeactivateOpen(false)}
        onConfirm={onConfirmDeactivate}
        confirmLoading={deactivateLoading}
        blockedOpen={Boolean(deactivateError)}
        blockedMessage={deactivateError}
        onCloseBlocked={() => setDeactivateError('')}
      />
    </div>
  );
}
