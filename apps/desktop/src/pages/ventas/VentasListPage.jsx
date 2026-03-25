import { useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiEye, PiReceipt } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  IconButton,
  Input,
  PageHeader,
  Paginador,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../ui';
import { useVentasStore } from '../../stores/ventasStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { getUnidad, formatQtyByUnit } from '../../lib/formatQty';
import { printSaleTicketDocument } from './printTicket';

const PAGE_SIZE = 8;

function formatQtyWithUnit(value, unidad) {
  const unit = getUnidad(unidad);
  return `${formatQtyByUnit(value, unit)} ${unit}`;
}

export default function VentasListPage() {
  const navigate = useNavigate();
  const { ventas, ventaDetalle, devoluciones, error, listar, detalle, cargarTicket, cargarDevoluciones, crearDevolucion } = useVentasStore();
  const [selected, setSelected] = useState(null);
  const [motivo, setMotivo] = useState('Cliente no conforme');
  const [contado, setContado] = useState('');
  const [credito, setCredito] = useState('');
  const [authAdmin, setAuthAdmin] = useState({ usuario: '', password: '' });
  const [qtyByDetail, setQtyByDetail] = useState({});
  const [pagina, setPagina] = useState(1);
  const [printingSaleId, setPrintingSaleId] = useState(null);

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

  const handlePrintTicket = async (saleId) => {
    try {
      setPrintingSaleId(saleId);
      const ticketData = await cargarTicket(saleId);
      printSaleTicketDocument(ticketData);
    } catch (_) {
      // El store ya deja el mensaje de error disponible para la vista.
    } finally {
      setPrintingSaleId(null);
    }
  };

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
    <div className="space-y-5">
      <PageHeader
        title="Historial y devoluciones"
        description="Consulta ventas emitidas, ticket y devoluciones autorizadas"
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Tabla>
        <TablaCabecera>
          <tr>
            <TablaCelda as="th">Orden</TablaCelda>
            <TablaCelda as="th">Fecha</TablaCelda>
            <TablaCelda as="th">Cliente</TablaCelda>
            <TablaCelda as="th">Estado</TablaCelda>
            <TablaCelda as="th" className="text-right">Total</TablaCelda>
            <TablaCelda as="th">Acciones</TablaCelda>
          </tr>
        </TablaCabecera>
        <TablaCuerpo>
          {ventasPaginadas.map((v) => (
            <TablaFila key={v.id}>
              <TablaCelda className="font-semibold text-[var(--color-text)]">#{v.id}</TablaCelda>
              <TablaCelda>{formatDateQuito(v.fecha)}</TablaCelda>
              <TablaCelda>{String(v.cliente_nombre || '').trim() || 'Consumidor final'}</TablaCelda>
              <TablaCelda>
                <StatusBadge status={v.estado} />
              </TablaCelda>
              <TablaCelda className="text-right font-semibold text-[var(--color-text)]">${Number(v.total || 0).toFixed(2)}</TablaCelda>
              <TablaCelda>
                <div className="flex justify-end gap-1">
                  <IconButton
                    variant="iconView"
                    size="sm"
                    aria-label={`Ver venta ${v.id}`}
                    title="Ver venta"
                    onClick={() => navigate(`/ventas/${v.id}`)}
                  >
                    <PiEye className="text-lg" />
                  </IconButton>
                  <IconButton
                    variant="iconEdit"
                    size="sm"
                    aria-label={`Registrar devolución venta ${v.id}`}
                    title="Registrar devolución"
                    onClick={() => setSelected(v.id)}
                  >
                    <PiArrowsClockwise className="text-lg" />
                  </IconButton>
                  <IconButton
                    variant="iconSecondary"
                    size="sm"
                    aria-label={`Ver recibo venta ${v.id}`}
                    title="Ver recibo"
                    disabled={printingSaleId === v.id}
                    onClick={() => handlePrintTicket(v.id)}
                  >
                    <PiReceipt className="text-lg" />
                  </IconButton>
                </div>
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

      {selected && ventaDetalle && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="space-y-3 p-4">
            <h3 className="font-semibold text-[var(--color-text)]">Detalle venta #{ventaDetalle.venta.id}</h3>
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
                    <TablaCelda>{formatQtyWithUnit(d.cantidad, d.unidad_medida || d.unidad)}</TablaCelda>
                    <TablaCelda>${Number(d.precio_unit || 0).toFixed(2)}</TablaCelda>
                    <TablaCelda>${Number(d.total_linea || 0).toFixed(2)}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </Card>

          <Card className="space-y-3 p-4">
            <h3 className="font-semibold text-[var(--color-text)]">Registrar devolucion</h3>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo"
            />
            {ventaDetalle.detalle.map((d) => (
              <div key={d.id} className="grid grid-cols-[1fr_120px] gap-2 items-center">
                <span className="text-sm text-[var(--color-text-muted)]">{d.producto_codigo} {d.producto_nombre} (vendido: {d.cantidad})</span>
                <Input
                  value={qtyByDetail[d.id] || ''}
                  onChange={(e) => setQtyByDetail((s) => ({ ...s, [d.id]: e.target.value }))}
                  placeholder="Cant"
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <Input value={contado} onChange={(e) => setContado(e.target.value)} placeholder="Contado opcional" />
              <Input value={credito} onChange={(e) => setCredito(e.target.value)} placeholder="Credito opcional" />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2">
              <Input
                className="border-amber-300"
                value={authAdmin.usuario}
                onChange={(e) => setAuthAdmin((s) => ({ ...s, usuario: e.target.value }))}
                placeholder="Usuario admin"
              />
              <Input
                type="password"
                className="border-amber-300"
                value={authAdmin.password}
                onChange={(e) => setAuthAdmin((s) => ({ ...s, password: e.target.value }))}
                placeholder="Clave admin"
              />
            </div>
            <Button onClick={submitDevolucion}>
              Guardar devolucion
            </Button>
          </Card>
        </div>
      )}

      {devoluciones?.devoluciones?.length > 0 && (
        <Card className="space-y-2 p-4">
          <h3 className="font-semibold text-[var(--color-text)]">Historial devoluciones</h3>
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Orden</TablaCelda>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Motivo</TablaCelda>
                <TablaCelda as="th" className="text-right">Total</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {devoluciones.devoluciones.map((d) => (
                <TablaFila key={d.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">#{d.id}</TablaCelda>
                  <TablaCelda>{formatDateQuito(d.fecha)}</TablaCelda>
                  <TablaCelda>{d.motivo}</TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">${Number(d.total_devuelto || 0).toFixed(2)}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
          <Paginador paginaActual={1} totalPaginas={1} totalRegistros={devoluciones.devoluciones.length} mostrarSiempre />
        </Card>
      )}

    </div>
  );
}
