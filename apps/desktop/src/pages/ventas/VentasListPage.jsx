import { useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiEye, PiPrinter, PiReceipt } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  IconButton,
  Input,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../ui';
import { useVentasStore } from '../../stores/ventasStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { getUnidad, formatQtyByUnit } from '../../lib/formatQty';
import { printSaleTicketDocument } from './printTicket';

const PAGE_SIZE = 8;

function formatQtyWithUnit(value, unidad) {
  const unit = getUnidad(unidad);
  return `${formatQtyByUnit(value, unit)} ${unit}`;
}

export default function VentasListPage() {
  const navigate = useNavigate();
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

  const ticketDetalle = ticket?.detalle || [];
  const ticketPagos = ticket?.pagos || [];
  const ticketMetodo = String(ticket?.metodo_pago || '-');
  const ticketFecha = ticket?.venta?.fecha ? formatDateQuito(ticket.venta.fecha) : '-';
  const printTicket = () => {
    printSaleTicketDocument(ticket);
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
                    aria-label={`Ver ticket venta ${v.id}`}
                    title="Ver ticket"
                    onClick={() => cargarTicket(v.id)}
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

      {ticket && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-[var(--color-text)]">Ticket de venta #{ticket.venta?.id}</h3>
            <div className="ticket-print-actions flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={printTicket}>
                <PiPrinter />
                Imprimir ticket
              </Button>
            </div>
          </div>

          <div className="ticket-print-root rounded-xl border border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-text)] shadow-sm">
            <header className="space-y-0.5 border-b border-dashed border-[var(--color-border)] pb-3 text-center">
              <p className="m-0 text-base font-extrabold tracking-wide">{ticket.negocio?.nombre || 'QKarnes POS'}</p>
              <p className="m-0 text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Comprobante de venta</p>
              {ticket.ticket_config?.numero && <p className="m-0 text-xs text-[var(--color-text-muted)]">{ticket.ticket_config.numero}</p>}
            </header>

            <section className="grid gap-1 py-3 text-xs text-[var(--color-text-muted)] md:grid-cols-2">
              <p className="m-0"><span className="font-semibold text-[var(--color-text)]">Venta:</span> #{ticket.venta?.id}</p>
              <p className="m-0"><span className="font-semibold text-[var(--color-text)]">Fecha:</span> {ticketFecha}</p>
              <p className="m-0"><span className="font-semibold text-[var(--color-text)]">Cliente:</span> {ticket.cliente?.nombre || 'Consumidor final'}</p>
              <p className="m-0"><span className="font-semibold text-[var(--color-text)]">Cajero:</span> {ticket.usuario?.nombre || '-'}</p>
              <p className="m-0"><span className="font-semibold text-[var(--color-text)]">Metodo:</span> {ticketMetodo}</p>
              <p className="m-0"><span className="font-semibold text-[var(--color-text)]">Referencia:</span> {ticket.venta?.referencia || '-'}</p>
              {ticket.negocio?.ruc && <p className="m-0"><span className="font-semibold text-[var(--color-text)]">RUC:</span> {ticket.negocio.ruc}</p>}
              {ticket.negocio?.direccion && <p className="m-0"><span className="font-semibold text-[var(--color-text)]">Direccion:</span> {ticket.negocio.direccion}</p>}
            </section>

            <section className="border-y border-dashed border-[var(--color-border)] py-3">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-[var(--color-text-muted)]">
                    <th className="pb-1 pr-2">Detalle</th>
                    <th className="pb-1 pr-2 text-right">Cant</th>
                    <th className="pb-1 pr-2 text-right">P. Unit</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketDetalle.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="py-1 pr-2">
                        <p className="m-0 font-semibold text-[var(--color-text)]">{row.producto_nombre}</p>
                        <p className="m-0 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{row.producto_codigo}</p>
                      </td>
                      <td className="py-1 pr-2 text-right">{formatQtyWithUnit(row.cantidad, row.unidad_medida || 'UND')}</td>
                      <td className="py-1 pr-2 text-right">{formatMoney(row.precio_unit)}</td>
                      <td className="py-1 text-right">{formatMoney(row.total_linea)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="space-y-1 py-3 text-xs">
              <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                <span>Subtotal</span>
                <span>{formatMoney(ticket.venta?.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                <span>Descuento</span>
                <span>{formatMoney(ticket.venta?.descuento_total)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-[var(--color-border)] pt-2 text-sm font-bold text-[var(--color-text)]">
                <span>Total</span>
                <span>{formatMoney(ticket.venta?.total)}</span>
              </div>
              {Number(ticket.ticket_config?.impuesto_porcentaje || 0) > 0 && (
                <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                  <span>Impuesto estimado ({Number(ticket.ticket_config?.impuesto_porcentaje || 0)}%)</span>
                  <span>{formatMoney(ticket.totales?.impuesto_estimado)}</span>
                </div>
              )}
            </section>

            <section className="space-y-1 border-t border-dashed border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
              <p className="m-0 font-semibold uppercase tracking-wide text-[var(--color-text)]">Formas de pago</p>
              {ticketPagos.length === 0 && <p className="m-0">Sin pagos registrados</p>}
              {ticketPagos.map((pago) => (
                <div key={pago.id} className="flex items-center justify-between">
                  <span>{String(pago.tipo || '-').toUpperCase()}</span>
                  <span>{formatMoney(pago.monto)}</span>
                </div>
              ))}
            </section>

            <footer className="pt-3 text-center text-[11px] text-[var(--color-text-muted)]">
              <p className="m-0">{ticket.ticket_config?.mensaje || 'Gracias por su compra'}</p>
              <p className="m-0">Impresion simulada de ticket (offline desktop)</p>
            </footer>
          </div>
        </Card>
      )}
    </div>
  );
}
