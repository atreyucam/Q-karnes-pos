import { useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiEye, PiPlus, PiReceipt } from 'react-icons/pi';
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
import { formatMoney } from '../../lib/formatMoney';
import { printSaleTicketDocument } from './printTicket';

const PAGE_SIZE = 8;

export default function VentasListPage() {
  const navigate = useNavigate();
  const ventas = useVentasStore((s) => s.ventas);
  const error = useVentasStore((s) => s.error);
  const listar = useVentasStore((s) => s.listar);
  const cargarTicket = useVentasStore((s) => s.cargarTicket);

  const [search, setSearch] = useState('');
  const [pagina, setPagina] = useState(1);
  const [printingSaleId, setPrintingSaleId] = useState(null);

  useEffect(() => {
    listar();
  }, [listar]);

  useEffect(() => {
    setPagina(1);
  }, [ventas.length, search]);

  const ventasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ventas;

    return ventas.filter((venta) => [
      venta.id,
      venta.cliente_nombre,
      venta.metodo_pago_label,
      venta.estado,
      venta.total,
      venta.usuario_nombre,
      venta.referencia
    ].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [search, ventas]);

  const totalPaginas = Math.max(1, Math.ceil(ventasFiltradas.length / PAGE_SIZE));
  const ventasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return ventasFiltradas.slice(start, start + PAGE_SIZE);
  }, [pagina, ventasFiltradas]);

  const handlePrintTicket = async (saleId) => {
    try {
      setPrintingSaleId(saleId);
      const ticketData = await cargarTicket(saleId);
      printSaleTicketDocument(ticketData);
    } catch (_) {
      // store handles message
    } finally {
      setPrintingSaleId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ventas"
        description="Consulta ventas emitidas, abre el detalle operativo y dispara devoluciones o anulaciones desde la ficha completa."
        actions={(
          <Button type="button" onClick={() => navigate('/ventas/nueva')}>
            <PiPlus className="text-base" />
            Nueva venta
          </Button>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-5">
        <div className="max-w-md">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Buscar</label>
          <Input
            className="mt-2"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Orden, cliente, metodo, vendedor o estado"
          />
        </div>
      </Card>

      <Tabla>
        <TablaCabecera>
          <tr>
            <TablaCelda as="th">Orden</TablaCelda>
            <TablaCelda as="th">Fecha</TablaCelda>
            <TablaCelda as="th">Cliente</TablaCelda>
            <TablaCelda as="th">Metodo</TablaCelda>
            <TablaCelda as="th">Estado</TablaCelda>
            <TablaCelda as="th">Vendedor</TablaCelda>
            <TablaCelda as="th" className="text-right">Total</TablaCelda>
            <TablaCelda as="th">Acciones</TablaCelda>
          </tr>
        </TablaCabecera>
        <TablaCuerpo>
          {ventasPaginadas.length === 0 ? (
            <TablaFila>
              <TablaCelda colSpan={8} className="text-center text-[var(--color-text-muted)]">
                No hay ventas para este filtro.
              </TablaCelda>
            </TablaFila>
          ) : ventasPaginadas.map((venta) => (
            <TablaFila key={venta.id}>
              <TablaCelda className="font-semibold text-[var(--color-text)]">#{venta.id}</TablaCelda>
              <TablaCelda>{formatDateQuito(venta.fecha)}</TablaCelda>
              <TablaCelda>{String(venta.cliente_nombre || '').trim() || 'Comprobante final'}</TablaCelda>
              <TablaCelda>{venta.metodo_pago_label || '-'}</TablaCelda>
              <TablaCelda>
                <StatusBadge status={venta.estado} />
              </TablaCelda>
              <TablaCelda>{venta.usuario_nombre || '-'}</TablaCelda>
              <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(venta.total || 0)}</TablaCelda>
              <TablaCelda>
                <div className="flex justify-end gap-1">
                  <IconButton
                    variant="iconView"
                    size="sm"
                    aria-label={`Ver venta ${venta.id}`}
                    title="Ver venta"
                    onClick={() => navigate(`/ventas/${venta.id}`)}
                  >
                    <PiEye className="text-lg" />
                  </IconButton>
                  <IconButton
                    variant="iconEdit"
                    size="sm"
                    aria-label={`Devolver venta ${venta.id}`}
                    title="Devolver"
                    onClick={() => navigate(`/ventas/${venta.id}?action=devolucion`)}
                  >
                    <PiArrowsClockwise className="text-lg" />
                  </IconButton>
                  <IconButton
                    variant="iconSecondary"
                    size="sm"
                    aria-label={`Ver ticket venta ${venta.id}`}
                    title="Ver ticket"
                    disabled={printingSaleId === venta.id}
                    onClick={() => handlePrintTicket(venta.id)}
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
        totalRegistros={ventasFiltradas.length}
        mostrarSiempre
        onPageChange={setPagina}
      />
    </div>
  );
}
