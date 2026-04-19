import { useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiEye, PiPlus, PiReceipt } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Field,
  FiltersBar,
  Input,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  TableActions,
  TableActionButton,
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

  const [filters, setFilters] = useState({ search: '', estado: 'TODOS', metodo: 'TODOS' });
  const [pagina, setPagina] = useState(1);
  const [printingSaleId, setPrintingSaleId] = useState(null);

  useEffect(() => {
    listar();
  }, [listar]);

  useEffect(() => {
    setPagina(1);
  }, [ventas.length, filters]);

  const ventasFiltradas = useMemo(() => {
    const q = filters.search.trim().toLowerCase();

    return ventas.filter((venta) => {
      const matchesSearch = !q || [
        venta.id,
        venta.cliente_nombre,
        venta.metodo_pago_label,
        venta.estado,
        venta.total,
        venta.usuario_nombre,
        venta.referencia
      ].some((value) => String(value || '').toLowerCase().includes(q));
      const matchesEstado = filters.estado === 'TODOS' || String(venta.estado || '') === filters.estado;
      const metodo = String(venta.metodo_pago_label || '').trim().toLowerCase();
      const matchesMetodo = filters.metodo === 'TODOS' || metodo === filters.metodo.toLowerCase();
      return matchesSearch && matchesEstado && matchesMetodo;
    });
  }, [filters, ventas]);

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

      <FiltersBar
        search={(
          <Field label="Buscar">
            <Input
              value={filters.search}
              onChange={(event) => setFilters((state) => ({ ...state, search: event.target.value }))}
              placeholder="Orden, cliente, método, vendedor o estado"
            />
          </Field>
        )}
        actions={(
          <Button
            variant="secondary"
            className="w-full xl:w-auto"
            onClick={() => setFilters({ search: '', estado: 'TODOS', metodo: 'TODOS' })}
          >
            Limpiar filtros
          </Button>
        )}
      >
        <Field label="Estado">
          <Select
            value={filters.estado}
            onChange={(event) => setFilters((state) => ({ ...state, estado: event.target.value }))}
          >
            <option value="TODOS">Todos</option>
            {Array.from(new Set(ventas.map((venta) => String(venta.estado || '').trim()).filter(Boolean))).map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Método">
          <Select
            value={filters.metodo}
            onChange={(event) => setFilters((state) => ({ ...state, metodo: event.target.value }))}
          >
            <option value="TODOS">Todos</option>
            {Array.from(new Set(ventas.map((venta) => String(venta.metodo_pago_label || '').trim()).filter(Boolean))).map((metodo) => (
              <option key={metodo} value={metodo}>
                {metodo}
              </option>
            ))}
          </Select>
        </Field>
      </FiltersBar>

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
                <TableActions>
                  <TableActionButton
                    variant="neutral"
                    icon={<PiEye />}
                    aria-label={`Ver venta ${venta.id}`}
                    title="Ver venta"
                    onClick={() => navigate(`/ventas/${venta.id}`)}
                  >
                    Ver
                  </TableActionButton>
                  <TableActionButton
                    variant="warning"
                    icon={<PiArrowsClockwise />}
                    aria-label={`Devolver venta ${venta.id}`}
                    title="Devolver"
                    onClick={() => navigate(`/ventas/${venta.id}?action=devolucion`)}
                  >
                    Devolver
                  </TableActionButton>
                  <TableActionButton
                    variant="secondary"
                    icon={<PiReceipt />}
                    aria-label={`Ver ticket venta ${venta.id}`}
                    title="Ver ticket"
                    disabled={printingSaleId === venta.id}
                    onClick={() => handlePrintTicket(venta.id)}
                  >
                    {printingSaleId === venta.id ? 'Imprimiendo...' : 'Imprimir'}
                  </TableActionButton>
                </TableActions>
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
